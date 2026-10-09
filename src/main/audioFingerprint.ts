// Audio fingerprints for finding the intro and the credits shared by episodes of a series.
// Every frame gets 32 bits: whether the energy difference of neighbouring frequency bands grew or fell
// since the previous frame (Haitsma & Kalker). The same music gives nearly the same bits in every episode,
// even with a different encoding, while unrelated audio differs in about half of them.

export const SAMPLE_RATE = 5512;
const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
export const FRAME_SECONDS = HOP_SIZE / SAMPLE_RATE;
// 33 bands give 32 differences, one bit each
const BAND_COUNT = 33;
const MIN_FREQUENCY = 300;
const MAX_FREQUENCY = 2000;
// RMS of 16-bit samples below which a frame is silence: silence matches silence, which says nothing
const SILENCE_RMS = 100;

export interface Fingerprint {
    codes: Uint32Array;
    // 1 for silent frames, never counted as a match
    silent: Uint8Array;
}

// In-place radix-2 FFT
const fft = (re: Float64Array, im: Float64Array) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const angle = -2 * Math.PI / size;
        const half = size >> 1;
        for (let k = 0; k < half; k++) {
            const wr = Math.cos(angle * k);
            const wi = Math.sin(angle * k);
            for (let i = k; i < n; i += size) {
                const j = i + half;
                const tr = re[j] * wr - im[j] * wi;
                const ti = re[j] * wi + im[j] * wr;
                re[j] = re[i] - tr;
                im[j] = im[i] - ti;
                re[i] += tr;
                im[i] += ti;
            }
        }
    }
};

// Mono 16-bit PCM at SAMPLE_RATE
export const fingerprint = (samples: Int16Array): Fingerprint => {
    const frameCount = Math.max(0, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
    const codes = new Uint32Array(frameCount);
    const silent = new Uint8Array(frameCount);

    const window = new Float64Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME_SIZE - 1));
    // FFT bin where each band starts, log-spaced
    const bandEdges = Array.from({ length: BAND_COUNT + 1 }, (_, b) =>
        Math.round(MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, b / BAND_COUNT) * FRAME_SIZE / SAMPLE_RATE));

    const re = new Float64Array(FRAME_SIZE);
    const im = new Float64Array(FRAME_SIZE);
    let previous = new Float64Array(BAND_COUNT - 1);
    let current = new Float64Array(BAND_COUNT - 1);
    const energy = new Float64Array(BAND_COUNT);

    for (let frame = 0; frame < frameCount; frame++) {
        const offset = frame * HOP_SIZE;
        let sumSquares = 0;
        for (let i = 0; i < FRAME_SIZE; i++) {
            const sample = samples[offset + i];
            sumSquares += sample * sample;
            re[i] = sample * window[i];
            im[i] = 0;
        }
        silent[frame] = Math.sqrt(sumSquares / FRAME_SIZE) < SILENCE_RMS ? 1 : 0;
        fft(re, im);

        for (let b = 0; b < BAND_COUNT; b++) {
            let sum = 0;
            for (let bin = bandEdges[b]; bin < bandEdges[b + 1]; bin++) sum += re[bin] * re[bin] + im[bin] * im[bin];
            energy[b] = sum;
        }
        let code = 0;
        for (let b = 0; b < BAND_COUNT - 1; b++) {
            current[b] = energy[b] - energy[b + 1];
            if (frame > 0 && current[b] - previous[b] > 0) code |= 1 << b;
        }
        codes[frame] = code >>> 0;
        [previous, current] = [current, previous];
    }
    return { codes, silent };
};

const BIT_COUNTS = new Uint8Array(1 << 16);
for (let i = 1; i < BIT_COUNTS.length; i++) BIT_COUNTS[i] = (i & 1) + BIT_COUNTS[i >> 1];

// Frames match when at most this many of the 32 bits differ (unrelated audio: 16 on average)
const MAX_BIT_ERRORS = 10;
// A segment survives this many unmatched frames in a row (a short silence or a sound effect over the music)
const MAX_GAP_FRAMES = Math.round(1 / FRAME_SECONDS);
// Share of matched frames a segment needs
const MIN_DENSITY = 0.5;

export interface SharedSegment {
    // Frame indices in `a` and `b`, end exclusive
    startA: number;
    startB: number;
    length: number;
}

// Segments kept per comparison: the intro may be shorter than a music sting repeated mid-episode
const MAX_SEGMENTS = 10;

// Stretches of audio present in both fingerprints with a length within [minFrames, maxFrames], longest first,
// not overlapping in `a`. Tries every alignment of the two; longer matches (e.g. a recap of a previous episode) are ignored.
export const findSharedSegments = (a: Fingerprint, b: Fingerprint, minFrames: number, maxFrames: number): SharedSegment[] => {
    const found: SharedSegment[] = [];
    // Shift = index in a - index in b
    for (let shift = -(b.codes.length - 1); shift < a.codes.length; shift++) {
        const from = Math.max(0, shift);
        const to = Math.min(a.codes.length, b.codes.length + shift);
        let runStart = -1;
        let lastMatch = -1;
        let matches = 0;

        const closeRun = () => {
            if (runStart < 0) return;
            const length = lastMatch - runStart + 1;
            if (length >= minFrames && length <= maxFrames && matches >= length * MIN_DENSITY) {
                found.push({ startA: runStart, startB: runStart - shift, length });
            }
            runStart = -1;
            matches = 0;
        };

        for (let i = from; i < to; i++) {
            const j = i - shift;
            if (a.silent[i] || b.silent[j]) {
                if (runStart >= 0 && i - lastMatch > MAX_GAP_FRAMES) closeRun();
                continue;
            }
            const diff = a.codes[i] ^ b.codes[j];
            if (BIT_COUNTS[diff & 0xffff] + BIT_COUNTS[diff >>> 16] <= MAX_BIT_ERRORS) {
                if (runStart >= 0 && i - lastMatch > MAX_GAP_FRAMES) closeRun();
                if (runStart < 0) runStart = i;
                lastMatch = i;
                matches++;
            } else if (runStart >= 0 && i - lastMatch > MAX_GAP_FRAMES) {
                closeRun();
            }
        }
        closeRun();
    }

    // The same audio also matches at neighbouring alignments: keep the longest of overlapping ones
    const result: SharedSegment[] = [];
    for (const segment of found.sort((x, y) => y.length - x.length)) {
        if (result.length >= MAX_SEGMENTS) break;
        const overlapsKept = result.some(kept =>
            segment.startA < kept.startA + kept.length && kept.startA < segment.startA + segment.length);
        if (!overlapsKept) result.push(segment);
    }
    return result;
};
