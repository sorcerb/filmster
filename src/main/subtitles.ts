import { app } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import { promises as fsp } from 'fs';
import path from 'path';
import { SubtitleCue, SubtitleRequest, SubtitleTrackInfo } from '../renderer/models/MediaInfo';
import { handle, RpcClient } from './rpc';

const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : path.join(__dirname, '../../bin/ffmpeg.exe');

const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'microdvd']);
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.ass', '.ssa', '.vtt']);

export const getEmbeddedSubtitles = (streams: any[]): SubtitleTrackInfo[] => streams
    .filter(s => s.codec_type === 'subtitle')
    .map((s, stream) => ({ s, stream }))
    .filter(({ s }) => TEXT_SUBTITLE_CODECS.has(s.codec_name))
    .map(({ s, stream }) => ({
        stream,
        language: s.tags?.language,
        title: s.tags?.title,
        isForced: s.disposition?.forced === 1,
    }));

export const getExternalSubtitles = async (videoPath: string): Promise<SubtitleTrackInfo[]> => {
    const dir = path.dirname(videoPath);
    const baseName = path.parse(videoPath).name.toLowerCase();
    try {
        const files = await fsp.readdir(dir);
        return files
            .filter(f => SUBTITLE_EXTENSIONS.has(path.extname(f).toLowerCase()) && f.toLowerCase().startsWith(baseName))
            .sort()
            .map(f => {
                const suffix = path.parse(f).name.slice(baseName.length).replace(/^[\s._-]+/, '');
                return { filePath: path.join(dir, f), title: suffix || f, isForced: false };
            });
    } catch {
        return [];
    }
};

// Non-UTF-8 subtitle files are almost always legacy Cyrillic here
const detectCharset = async (filePath: string): Promise<string | null> => {
    const data = await fsp.readFile(filePath);
    if (data[0] === 0xff || data[0] === 0xfe) return null; // UTF-16 BOM, ffmpeg handles it
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(data);
        return null;
    } catch {
        return 'CP1251';
    }
};

const parseTime = (value: string): number => {
    const match = /(?:(\d+):)?(\d+):(\d+)\.(\d+)/.exec(value);
    if (!match) return NaN;
    return (parseInt(match[1] ?? '0', 10) * 3600) + (parseInt(match[2], 10) * 60) + parseInt(match[3], 10)
        + parseInt(match[4], 10) / 10 ** match[4].length;
};

const parseCueBlock = (block: string): SubtitleCue | null => {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(l => l.includes('-->'));
    if (timingIndex < 0) return null;
    const [startText, endText] = lines[timingIndex].split('-->');
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    const start = parseTime(startText);
    const end = parseTime(endText);
    if (!text || isNaN(start) || isNaN(end)) return null;
    return { start, end, text };
};

// Request ids are per client, so the key is `${client id}:${request id}`
const activeExtractions = new Map<string, ChildProcess>();

const stopExtraction = (key: string) => {
    const ffmpeg = activeExtractions.get(key);
    if (ffmpeg && ffmpeg.exitCode === null) ffmpeg.kill('SIGKILL');
    activeExtractions.delete(key);
};

export const stopClientSubtitles = (clientId: string) => {
    [...activeExtractions.keys()].filter(key => key.startsWith(`${clientId}:`)).forEach(stopExtraction);
};

// Embedded tracks are interleaved through the whole file, so reading them all at once would mean reading
// gigabytes (slow over network) - the player requests windows around the playback position instead.
const startExtraction = async (client: RpcClient, request: SubtitleRequest) => {
    const { id, videoPath, track, from, until } = request;
    const key = `${client.id}:${id}`;
    const input = track.filePath ?? videoPath;
    const charset = track.filePath ? await detectCharset(track.filePath).catch(() => null) : null;
    const ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        ...(track.filePath || from <= 0 ? [] : ['-ss', String(from)]),
        // Keep file timestamps, otherwise they become relative to the seek point
        '-copyts',
        ...(charset ? ['-sub_charenc', charset] : []),
        '-i', input,
        '-map', `0:s:${track.stream ?? 0}`,
        '-flush_packets', '1',
        '-f', 'webvtt', 'pipe:1',
    ], { windowsHide: true });
    activeExtractions.set(key, ffmpeg);

    let buffer = '';
    let reachedUntil = false;
    const emit = (blocks: string[]) => {
        const cues = blocks.map(parseCueBlock).filter((c): c is SubtitleCue => !!c);
        if (until !== null && cues.some(c => c.start >= until)) reachedUntil = true;
        if (cues.length) client.send('subtitle-cues', id, cues);
        if (reachedUntil) ffmpeg.kill('SIGKILL');
    };

    ffmpeg.stdout.setEncoding('utf8');
    ffmpeg.stdout.on('data', (chunk: string) => {
        if (reachedUntil) return;
        buffer += chunk.replace(/\r\n/g, '\n');
        const blocks = buffer.split(/\n{2,}/);
        buffer = blocks.pop() ?? '';
        emit(blocks);
    });
    ffmpeg.stdout.on('error', () => ffmpeg.kill('SIGKILL'));
    ffmpeg.on('error', (err) => console.error('ffmpeg subtitles:', err));
    ffmpeg.stderr.on('data', (data) => console.error('ffmpeg subtitles:', data.toString().trim()));
    ffmpeg.on('close', () => {
        // Killed by stop-subtitles: the player has already moved on
        if (activeExtractions.get(key) !== ffmpeg) return;
        if (!reachedUntil && buffer) emit([buffer]);
        activeExtractions.delete(key);
        client.send('subtitle-end', id, reachedUntil);
    });
};

handle('start-subtitles', (client, request: SubtitleRequest) => startExtraction(client, request));
handle('stop-subtitles', (client, id: number) => stopExtraction(`${client.id}:${id}`));

app.on('will-quit', () => [...activeExtractions.keys()].forEach(stopExtraction));
