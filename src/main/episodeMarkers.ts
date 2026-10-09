import { app } from 'electron';
import { execFile, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Worker } from 'worker_threads';
import createFingerprintWorker from './fingerprintWorker?nodeWorker';
import type { FingerprintTask } from './fingerprintWorker';
import { Fingerprint, FRAME_SECONDS, SAMPLE_RATE, SharedSegment } from './audioFingerprint';
import { createJsonWriter } from './jsonWriter';
import { ffmpegPath, ffprobePath } from './mediaProtocol';
import { broadcast, handle } from './rpc';
import { getAllMediaFiles } from './scanFiles';
import { MediaFileModel, MediaType } from '../renderer/models/MediaFileModel';
import { EpisodeMarkers, TimeRange } from '../renderer/models/EpisodeMarkers';
import { getAutoSkipIntro, getAutoSkipIntroDefault, setAutoSkipIntro, setAutoSkipIntroDefault } from '../renderer/stores/AutoSkipIntroStore';

// Intro and credits of series episodes, found by comparing an episode with other episodes of the series:
// the intro is a stretch of audio (4 s - 2.5 min) its beginning shares with theirs, wherever it starts
// (episodes open with scenes of different length). A music sting repeated mid-episode is shared too,
// so the intro has to be confirmed by two comparisons (see pickIntro). The credits are audio its end shares with theirs (a closing song),
// otherwise the last long run of black frames (text on black). An episode is analyzed when it is played,
// then the next one, so its markers are ready by the time it starts. Results go to episode-markers.json.
// Client event: 'episode-markers-updated' (filePath, markers).

// 2: intros from 8 s (version 1 missed short ones); 3: from 4 s, and with two episodes the earliest shared stretch
const MARKERS_VERSION = 3;
// Beginning searched for the intro: a share of the episode, at most INTRO_SEARCH_MAX seconds
const INTRO_SEARCH_SHARE = 0.3;
const INTRO_SEARCH_MAX = 600;
const INTRO_MIN_SECONDS = 4;
const INTRO_MAX_SECONDS = 150;
// End searched for the credits
const CREDITS_SEARCH_SHARE = 0.25;
const CREDITS_SEARCH_MAX = 360;
const CREDITS_MIN_SECONDS = 15;
// Black credits may be followed by studio logos for this long
const CREDITS_MAX_TAIL = 60;
// Share of black pixels in a frame of black credits (white text takes the rest)
const BLACK_FRAME_PERCENT = 85;
// Episodes compared with; two that agree are enough
const MAX_COMPARISONS = 3;
// Fingerprints of recently analyzed episodes, reused when their neighbours are analyzed
const FINGERPRINT_CACHE_SIZE = 20;

interface MarkersFile {
    version: number;
    files: Record<string, EpisodeMarkers>;
}

let markersFile: MarkersFile | null = null;

const getMarkersPath = () => path.join(app.getPath('userData'), 'episode-markers.json');

const loadMarkers = (): MarkersFile => {
    if (markersFile) return markersFile;
    try {
        const p = getMarkersPath();
        if (existsSync(p)) {
            const data = JSON.parse(readFileSync(p, 'utf-8')) as MarkersFile;
            if (data?.version === MARKERS_VERSION && data.files) markersFile = data;
        }
    } catch (error) {
        console.error('Error loading episode markers:', error);
    }
    if (!markersFile) markersFile = { version: MARKERS_VERSION, files: {} };
    return markersFile;
};

const markersWriter = createJsonWriter(getMarkersPath, () => markersFile, 1000);

// Drops markers of files that are no longer in the library (see garbageCollector.ts)
export const pruneEpisodeMarkers = (libraryPaths: Set<string>) => {
    const files = loadMarkers().files;
    const stale = Object.keys(files).filter(filePath => !libraryPaths.has(filePath));
    stale.forEach(filePath => delete files[filePath]);
    if (stale.length) markersWriter.schedule();
};

// --- Fingerprint worker ---

let worker: Worker | null = null;
let nextTaskId = 0;
const pendingTasks = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();

const rejectPendingTasks = (error: Error) => {
    pendingTasks.forEach(task => task.reject(error));
    pendingTasks.clear();
};

const runTask = <T>(task: FingerprintTask, transfer: ArrayBuffer[] = []): Promise<T> => {
    if (!worker) {
        const created = createFingerprintWorker({});
        created.on('message', ({ id, result, error }: { id: number; result?: unknown; error?: string }) => {
            const pending = pendingTasks.get(id);
            pendingTasks.delete(id);
            if (error) pending?.reject(new Error(error));
            else pending?.resolve(result);
        });
        created.on('error', (error) => {
            if (worker === created) worker = null;
            rejectPendingTasks(error);
        });
        worker = created;
    }
    const id = nextTaskId++;
    return new Promise<T>((resolve, reject) => {
        pendingTasks.set(id, { resolve: resolve as (result: unknown) => void, reject });
        worker!.postMessage({ id, task }, transfer);
    });
};

const stopWorker = () => {
    worker?.terminate();
    worker = null;
    rejectPendingTasks(new Error('Fingerprint worker stopped'));
};

// --- ffmpeg ---

// Analysis runs in the background: playback and the app come first
const lowerPriority = (pid: number | undefined) => {
    try {
        if (pid) os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
        // Not critical
    }
};

const getDuration = (filePath: string): Promise<number | null> => new Promise((resolve) => {
    execFile(
        ffprobePath,
        ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
        { timeout: 15000, encoding: 'utf8' },
        (err, stdout) => {
            const duration = parseFloat(stdout);
            resolve(err || !(duration > 0) ? null : duration);
        }
    );
});

// First audio track from `start` for `length` seconds as mono 16-bit PCM at SAMPLE_RATE; null if it can't be read
const decodeAudio = (filePath: string, start: number, length: number): Promise<Int16Array | null> => new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-ss', start.toFixed(2), '-t', length.toFixed(2),
        '-i', filePath,
        '-map', '0:a:0', '-ac', '1', '-ar', String(SAMPLE_RATE),
        '-f', 's16le', 'pipe:1',
    ], { windowsHide: true });
    lowerPriority(ffmpeg.pid);
    const chunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.on('error', () => resolve(null));
    ffmpeg.on('close', (code) => {
        const data = Buffer.concat(chunks);
        if (code !== 0 || !data.length) { resolve(null); return; }
        // Own buffer: Buffer memory may be unaligned for 16-bit access, and it is transferred to the worker
        const samples = new Int16Array(data.length >> 1);
        Buffer.from(samples.buffer).set(data.subarray(0, samples.length * 2));
        resolve(samples);
    });
});

// Start of the last long run of mostly black frames near the end (credits as text on black), or null.
// Only keyframes are decoded, a few seconds apart: the run starts at the first black one, so the credits
// are found a bit late rather than early.
const findBlackCredits = (filePath: string, from: number, duration: number): Promise<number | null> => new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-nostats',
        '-skip_frame', 'nokey',
        '-ss', from.toFixed(2),
        '-i', filePath,
        '-map', '0:v:0',
        '-vf', 'scale=320:-2,blackframe=amount=0:threshold=32',
        '-f', 'null', '-',
    ], { windowsHide: true });
    lowerPriority(ffmpeg.pid);
    let log = '';
    ffmpeg.stderr.on('data', (data: Buffer) => { log += data.toString(); });
    ffmpeg.on('error', () => resolve(null));
    ffmpeg.on('close', () => {
        const frames = [...log.matchAll(/pblack:(\d+) pts:\S+ t:([\d.]+)/g)]
            .map(match => ({ time: from + parseFloat(match[2]), isBlack: parseInt(match[1], 10) >= BLACK_FRAME_PERCENT }))
            .sort((a, b) => a.time - b.time);

        let creditsStart: number | null = null;
        let runStart: number | null = null;
        const closeRun = (end: number) => {
            if (runStart !== null && end - runStart >= CREDITS_MIN_SECONDS && end >= duration - CREDITS_MAX_TAIL) creditsStart = runStart;
            runStart = null;
        };
        for (const frame of frames) {
            if (frame.isBlack) runStart ??= frame.time;
            else closeRun(frame.time);
        }
        closeRun(duration);
        resolve(creditsStart);
    });
});

// --- Analysis ---

interface EpisodePrints {
    intro: Fingerprint;
    // Where `credits` starts in the episode
    creditsFrom: number;
    credits: Fingerprint;
    duration: number;
}

const fingerprintCache = new Map<string, EpisodePrints>();

const getEpisodePrints = async (filePath: string): Promise<EpisodePrints | null> => {
    const cached = fingerprintCache.get(filePath);
    if (cached) {
        // Most recently used last
        fingerprintCache.delete(filePath);
        fingerprintCache.set(filePath, cached);
        return cached;
    }

    const duration = await getDuration(filePath);
    if (!duration) return null;
    const introLength = Math.min(INTRO_SEARCH_MAX, duration * INTRO_SEARCH_SHARE);
    const creditsLength = Math.min(CREDITS_SEARCH_MAX, duration * CREDITS_SEARCH_SHARE);
    const creditsFrom = duration - creditsLength;

    const introSamples = await decodeAudio(filePath, 0, introLength);
    const creditsSamples = introSamples && await decodeAudio(filePath, creditsFrom, creditsLength);
    if (!introSamples || !creditsSamples) return null;

    const [intro, credits] = await Promise.all([
        runTask<Fingerprint>({ type: 'fingerprint', samples: introSamples }, [introSamples.buffer as ArrayBuffer]),
        runTask<Fingerprint>({ type: 'fingerprint', samples: creditsSamples }, [creditsSamples.buffer as ArrayBuffer]),
    ]);
    const prints = { intro, creditsFrom, credits, duration };
    fingerprintCache.set(filePath, prints);
    if (fingerprintCache.size > FINGERPRINT_CACHE_SIZE) fingerprintCache.delete(fingerprintCache.keys().next().value!);
    return prints;
};

const findShared = (a: Fingerprint, b: Fingerprint, minSeconds: number, maxSeconds: number) =>
    runTask<SharedSegment[]>({
        type: 'match', a, b,
        minFrames: Math.round(minSeconds / FRAME_SECONDS),
        maxFrames: Math.round(maxSeconds / FRAME_SECONDS),
    });

const overlaps = (a: TimeRange, b: TimeRange) =>
    Math.min(a.end, b.end) - Math.max(a.start, b.start) >= Math.min(a.end - a.start, b.end - b.start) / 2;

// Of the ranges found by each comparison: the one most other comparisons also found, the longest of equals
const pickAgreed = (comparisons: TimeRange[][]): { range: TimeRange; agreeing: number } | null => {
    let best: { range: TimeRange; agreeing: number } | null = null;
    comparisons.forEach((ranges, index) => {
        for (const range of ranges) {
            const agreeing = comparisons.filter((other, otherIndex) =>
                otherIndex !== index && other.some(otherRange => overlaps(range, otherRange))).length;
            if (!best || agreeing > best.agreeing
                || (agreeing === best.agreeing && range.end - range.start > best.range.end - best.range.start)) {
                best = { range, agreeing };
            }
        }
    });
    return best;
};

// Confirmed by another comparison. With nothing else to compare with (two episodes) the earliest shared stretch:
// the intro comes near the start, music stings later
const pickIntro = (comparisons: TimeRange[][]): TimeRange | null => {
    if (comparisons.length === 1) {
        return [...comparisons[0]].sort((a, b) => a.start - b.start)[0] ?? null;
    }
    const best = pickAgreed(comparisons);
    return best && best.agreeing > 0 ? best.range : null;
};

const getSeriesEpisodes = (file: MediaFileModel) =>
    getAllMediaFiles().filter(other => other.type === MediaType.Series && other.parsedName === file.parsedName);

const isSameEpisode = (a: MediaFileModel, b: MediaFileModel) => a.season === b.season && a.episode === b.episode;

// Other episodes of the series, closest first: same season, the next episode before the previous one
const getComparisonEpisodes = (file: MediaFileModel): MediaFileModel[] => {
    const distance = (other: MediaFileModel) => {
        const seasonDiff = Math.abs((other.season ?? 0) - (file.season ?? 0));
        const episodeDiff = (other.episode ?? 0) - (file.episode ?? 0);
        return seasonDiff * 10000 + Math.abs(episodeDiff) * 2 - (episodeDiff > 0 ? 1 : 0);
    };
    return getSeriesEpisodes(file)
        // Another copy of the same episode (other quality) shares all of its audio
        .filter(other => !isSameEpisode(other, file))
        .sort((a, b) => distance(a) - distance(b));
};

const getNextEpisode = (file: MediaFileModel): MediaFileModel | undefined =>
    getSeriesEpisodes(file)
        .filter(other => (other.season ?? 0) > (file.season ?? 0)
            || ((other.season ?? 0) === (file.season ?? 0) && (other.episode ?? 0) > (file.episode ?? 0)))
        .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0))[0];

const toRange = (segment: SharedSegment, offset: number): TimeRange => ({
    start: offset + segment.startA * FRAME_SECONDS,
    end: offset + (segment.startA + segment.length) * FRAME_SECONDS,
});

const analyzeEpisode = async (file: MediaFileModel): Promise<EpisodeMarkers | null> => {
    const prints = await getEpisodePrints(file.fullPath);
    if (!prints) return null;

    // Per comparison
    const intros: TimeRange[][] = [];
    const credits: TimeRange[][] = [];
    let compared = 0;
    for (const other of getComparisonEpisodes(file)) {
        if (compared >= MAX_COMPARISONS) break;
        const otherPrints = await getEpisodePrints(other.fullPath);
        if (!otherPrints) continue;
        compared++;

        const shared = await findShared(prints.intro, otherPrints.intro, INTRO_MIN_SECONDS, INTRO_MAX_SECONDS);
        intros.push(shared.map(segment => toRange(segment, 0)));
        const closing = await findShared(prints.credits, otherPrints.credits, CREDITS_MIN_SECONDS, CREDITS_SEARCH_MAX);
        credits.push(closing.map(segment => toRange(segment, prints.creditsFrom)));

        if (compared >= 2 && (pickAgreed(intros)?.agreeing ?? 0) > 0) break;
    }

    const creditsStart = pickAgreed(credits)?.range.start
        ?? await findBlackCredits(file.fullPath, prints.creditsFrom, prints.duration);
    return {
        fileSize: file.fileSize ?? 0,
        episodeCount: getSeriesEpisodes(file).length,
        intro: pickIntro(intros),
        creditsStart,
    };
};

// Stored markers that are still valid: same file, and if no intro was found, no episodes were added since
const getValidMarkers = (file: MediaFileModel): EpisodeMarkers | null => {
    const markers = loadMarkers().files[file.fullPath];
    if (!markers || markers.fileSize !== (file.fileSize ?? 0)) return null;
    if (!markers.intro && getSeriesEpisodes(file).length > markers.episodeCount) return null;
    return markers;
};

// --- Queue ---

const queue: string[] = [];
// Files that couldn't be read in this session (e.g. a drive went offline); not retried until restart
const failedPaths = new Set<string>();
let isProcessing = false;

const enqueue = (filePath: string, first: boolean) => {
    if (failedPaths.has(filePath)) return;
    const index = queue.indexOf(filePath);
    if (index >= 0) {
        if (!first) return;
        queue.splice(index, 1);
    }
    if (first) queue.unshift(filePath);
    else queue.push(filePath);
    processQueue();
};

const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        while (queue.length) {
            const filePath = queue.shift()!;
            const file = getAllMediaFiles().find(f => f.fullPath === filePath);
            if (!file || getValidMarkers(file)) continue;
            try {
                const markers = await analyzeEpisode(file);
                if (!markers) {
                    failedPaths.add(filePath);
                    continue;
                }
                loadMarkers().files[filePath] = markers;
                markersWriter.schedule();
                broadcast('episode-markers-updated', filePath, markers);
            } catch (error) {
                console.error(`Error analyzing ${filePath}:`, error);
                failedPaths.add(filePath);
            }
        }
    } finally {
        isProcessing = false;
        stopWorker();
    }
};

app.on('will-quit', stopWorker);

// Markers of an episode being played; null while it is analyzed ('episode-markers-updated' follows) or not a series.
// Also queues the next episode.
handle('get-episode-markers', (_client, filePath: string): EpisodeMarkers | null => {
    const file = getAllMediaFiles().find(f => f.fullPath === filePath);
    if (!file || file.type !== MediaType.Series) return null;
    const markers = getValidMarkers(file);
    if (!markers) enqueue(filePath, true);
    const next = getNextEpisode(file);
    if (next && !getValidMarkers(next)) enqueue(next.fullPath, false);
    return markers;
});

handle('get-auto-skip-intro', (_client, seriesName: string): boolean => getAutoSkipIntro(seriesName));

handle('set-auto-skip-intro', (_client, seriesName: string, enabled: boolean): void => setAutoSkipIntro(seriesName, enabled));

handle('get-auto-skip-intro-default', (): boolean => getAutoSkipIntroDefault());

handle('set-auto-skip-intro-default', (_client, enabled: boolean): void => setAutoSkipIntroDefault(enabled));
