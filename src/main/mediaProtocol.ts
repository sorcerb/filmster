import { app, net, protocol } from 'electron';
import { ChildProcess, execFile, spawn } from 'child_process';
import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import { MediaInfo } from '../renderer/models/MediaInfo';
import { getPostersFolder } from '../renderer/stores/metadataService';
import { getEmbeddedSubtitles, getExternalSubtitles } from './subtitles';
import { handle, LOCAL_CLIENT_ID } from './rpc';

export const MEDIA_SCHEME = 'media';
export const POSTER_SCHEME = 'poster';

export const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : path.join(__dirname, '../../bin/ffmpeg.exe');
export const ffprobePath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffprobe.exe')
    : path.join(__dirname, '../../bin/ffprobe.exe');

// Chromium refuses video/x-matroska, but plays Matroska when told it's WebM
const MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/mp4',
    '.mkv': 'video/webm',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.ts': 'video/mp2t',
};

// Audio codecs Chromium can decode natively; anything else (ac3, eac3, dts, truehd...) gets transcoded
const SUPPORTED_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

// Each client (the app window, every browser tab) has one player, so one transcode per client
const activeTranscodes = new Map<string, ChildProcess>();

export const stopTranscode = (clientId: string) => {
    const ffmpeg = activeTranscodes.get(clientId);
    if (ffmpeg && ffmpeg.exitCode === null) ffmpeg.kill('SIGKILL');
    activeTranscodes.delete(clientId);
};

const getMediaInfo = (filePath: string): Promise<MediaInfo> => new Promise((resolve, reject) => {
    execFile(
        ffprobePath,
        ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
        { timeout: 15000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
            if (err) { reject(err); return; }
            try {
                const data = JSON.parse(stdout);
                const streams: any[] = data.streams ?? [];
                const audioTracks = streams
                    .filter(s => s.codec_type === 'audio')
                    .map((s, index) => ({
                        index,
                        codec: s.codec_name ?? 'unknown',
                        channels: s.channels ?? 0,
                        language: s.tags?.language,
                        title: s.tags?.title,
                        isDefault: s.disposition?.default === 1,
                        isSupported: SUPPORTED_AUDIO_CODECS.has(s.codec_name),
                    }));
                resolve({
                    duration: parseFloat(data.format?.duration ?? '0') || 0,
                    videoCodec: streams.find(s => s.codec_type === 'video')?.codec_name,
                    audioTracks,
                    subtitleTracks: getEmbeddedSubtitles(streams),
                });
            } catch (parseError) {
                reject(parseError);
            }
        }
    );
});

handle('get-media-info', async (_client, filePath: string): Promise<MediaInfo | null> => {
    try {
        const [info, externalSubtitles] = await Promise.all([getMediaInfo(filePath), getExternalSubtitles(filePath)]);
        return { ...info, subtitleTracks: [...info.subtitleTracks, ...externalSubtitles] };
    } catch (error) {
        console.error('Error reading media info:', error);
        return null;
    }
});

// Video keyframe timestamps within ±KEYFRAME_SEARCH_RANGE of `time` (reads packet headers only, fast)
const KEYFRAME_SEARCH_RANGE = 10;
handle('get-keyframes', (_client, filePath: string, time: number): Promise<number[]> => new Promise((resolve) => {
    const from = Math.max(0, time - KEYFRAME_SEARCH_RANGE);
    execFile(
        ffprobePath,
        ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `${from}%${time + KEYFRAME_SEARCH_RANGE}`,
            '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', filePath],
        { timeout: 10000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
            if (err) { resolve([]); return; }
            resolve(stdout.split(/\r?\n/)
                .filter(line => line.includes(',K'))
                .map(line => parseFloat(line))
                .filter(t => !isNaN(t)));
        }
    );
}));

handle('stop-transcode', (client) => stopTranscode(client.id));

// Converts the selected audio track to stereo Opus, streamed as Matroska from `start` seconds.
// Video is copied as-is, or re-encoded to H.264 when `encodeVideo` (codecs Chromium can't decode, e.g. Xvid).
// Copied video: `start` should be a keyframe: -noaccurate_seek makes audio start at the same keyframe as the video,
// otherwise audio begins up to a GOP later and the playback clock jumps when it kicks in.
// Re-encoded video starts exactly at `start`, so it needs no keyframe.
const transcodeResponse = (filePath: string, start: number, audioTrack: number, encodeVideo: boolean, clientId: string): Response => {
    stopTranscode(clientId);
    const ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        ...(encodeVideo ? [] : ['-noaccurate_seek']),
        '-ss', String(start),
        '-i', filePath,
        '-map', '0:v:0',
        // Optional: files without audio still play
        '-map', `0:a:${audioTrack}?`,
        ...(encodeVideo
            ? ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '20', '-pix_fmt', 'yuv420p']
            : ['-c:v', 'copy']),
        '-c:a', 'libopus', '-b:a', '192k', '-ac', '2',
        '-avoid_negative_ts', 'make_zero',
        '-live', '1',
        '-f', 'matroska', 'pipe:1',
    ], { windowsHide: true });
    activeTranscodes.set(clientId, ffmpeg);

    ffmpeg.stderr.on('data', (data) => console.error('ffmpeg:', data.toString().trim()));
    ffmpeg.on('exit', () => {
        if (activeTranscodes.get(clientId) === ffmpeg) activeTranscodes.delete(clientId);
    });
    // Player dropped the stream (seek / track change / closed) - EPIPE is expected
    ffmpeg.stdout.on('error', () => ffmpeg.kill('SIGKILL'));

    const body = Readable.toWeb(ffmpeg.stdout) as unknown as ReadableStream;
    return new Response(body, { status: 200, headers: { 'Content-Type': 'video/webm' } });
};

// Width of the timeline hover preview frame
const THUMBNAIL_WIDTH = 240;
// Previews follow the mouse, so only the latest one per client is worth decoding
const activeThumbnails = new Map<string, ChildProcess>();

// JPEG of the keyframe at (or right after) `time`: only keyframes are decoded, so it's fast even for 4K
const thumbnailResponse = (filePath: string, time: number, clientId: string): Promise<Response> => new Promise((resolve) => {
    const previous = activeThumbnails.get(clientId);
    if (previous && previous.exitCode === null) previous.kill('SIGKILL');
    const ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-skip_frame', 'nokey', '-noaccurate_seek',
        '-ss', String(time),
        '-i', filePath,
        '-map', '0:v:0', '-frames:v', '1',
        '-vf', `scale=${THUMBNAIL_WIDTH}:-2`, '-pix_fmt', 'yuvj420p',
        '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1',
    ], { windowsHide: true });
    activeThumbnails.set(clientId, ffmpeg);

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on('error', () => resolve(new Response(null, { status: 500 })));
    ffmpeg.on('close', (code) => {
        if (activeThumbnails.get(clientId) === ffmpeg) activeThumbnails.delete(clientId);
        // Killed by a newer preview or failed
        if (code !== 0 || !chunks.length) { resolve(new Response(null, { status: 204 })); return; }
        resolve(new Response(Buffer.concat(chunks), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' },
        }));
    });
});

const fileResponse = async (filePath: string, rangeHeader: string | null): Promise<Response> => {
    let size: number;
    try {
        size = (await fsp.stat(filePath)).size;
    } catch {
        return new Response('File not found', { status: 404 });
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(rangeHeader ?? '');

    if (!range) {
        const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
        return new Response(body, {
            status: 200,
            headers: { 'Content-Type': contentType, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
        });
    }

    const start = range[1] ? parseInt(range[1], 10) : Math.max(0, size - parseInt(range[2], 10));
    const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }

    const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;
    return new Response(body, {
        status: 206,
        headers: {
            'Content-Type': contentType,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
        },
    });
};

// ?path=<encoded path>                              - raw file with HTTP Range support (needed for seeking)
// ?path=<encoded path>&transcode=1&start=<s>&audio=<n>[&video=h264] - audio (and video) transcoded via ffmpeg
// ?path=<encoded path>&thumb=<s>                    - JPEG preview frame for the timeline
// Served as media://local/ to the app window and as /media to browsers (webServer.ts)
export const mediaResponse = (params: URLSearchParams, rangeHeader: string | null, clientId: string): Promise<Response> | Response => {
    const filePath = params.get('path');
    if (!filePath) return new Response('Path not specified', { status: 400 });

    if (params.has('thumb')) {
        return thumbnailResponse(filePath, Math.max(0, parseFloat(params.get('thumb') ?? '0') || 0), clientId);
    }

    if (params.get('transcode') === '1') {
        const start = Math.max(0, parseFloat(params.get('start') ?? '0') || 0);
        const audioTrack = Math.max(0, parseInt(params.get('audio') ?? '0', 10) || 0);
        return transcodeResponse(filePath, start, audioTrack, params.get('video') === 'h264', clientId);
    }
    return fileResponse(filePath, rangeHeader);
};

// Poster image from the metadata folder; served as poster://local/<file name> and /poster/<file name>
export const posterResponse = (fileName: string): Promise<Response> | Response => {
    // File name only, so it can't be used to read files outside the posters folder
    if (!fileName || path.basename(fileName) !== fileName) return new Response('Bad poster name', { status: 400 });
    return net.fetch(pathToFileURL(path.join(getPostersFolder(), fileName)).href);
};

export const registerMediaProtocol = () => {
    protocol.handle(MEDIA_SCHEME, (request) =>
        mediaResponse(new URL(request.url).searchParams, request.headers.get('range'), LOCAL_CLIENT_ID));

    // poster://local/<file name>?v=<mtime> (file:// is blocked for the dev server page)
    protocol.handle(POSTER_SCHEME, (request) =>
        posterResponse(decodeURIComponent(new URL(request.url).pathname.slice(1))));
};

app.on('will-quit', () => {
    [...activeTranscodes.keys()].forEach(stopTranscode);
    activeThumbnails.forEach(ffmpeg => ffmpeg.kill('SIGKILL'));
});
