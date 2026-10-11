import { AudioTrackInfo, SubtitleTrackInfo } from '../models/MediaInfo';
import { TrackSignature } from '../models/TrackPreference';

// Matched by title, not position: an episode may lack a translation and the rest shift.

const FORMAT_WORDS = new Set([
    'ac3', 'eac3', 'dd', 'ddp', 'dts', 'hd', 'ma', 'es', 'x', 'aac', 'he', 'lc', 'flac', 'mp3', 'opus', 'pcm', 'lpcm',
    'truehd', 'atmos', 'ch', 'kbps', 'kbit', 'srt', 'ass', 'ssa', 'vtt', 'sub', 'subs',
]);
const GENERIC_WORDS = new Set([
    'dub', 'dubbing', 'dubbed', 'mvo', 'dvo', 'avo', 'vo', 'voice', 'over', 'original', 'orig',
    'дубляж', 'дублированный', 'многоголосый', 'двухголосый', 'одноголосый', 'закадровый', 'профессиональный',
    'любительский', 'авторский', 'оригинал', 'оригинальная', 'дорожка', 'перевод', 'субтитры',
]);
const MIN_TITLE_SIMILARITY = 0.5;

const toWords = (title: string): string[] => title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word && !FORMAT_WORDS.has(word) && !/^\d+$/.test(word));

const wordSimilarity = (a: string[], b: string[]): number => {
    const common = a.filter(word => b.includes(word)).length;
    const all = new Set([...a, ...b]).size;
    return 0.9 * common / Math.min(a.length, b.length) + 0.1 * common / all;
};

const titleSimilarity = (a: string, b: string): number => {
    const wordsA = [...new Set(toWords(a))];
    const wordsB = [...new Set(toWords(b))];
    const namesA = wordsA.filter(word => !GENERIC_WORDS.has(word));
    const namesB = wordsB.filter(word => !GENERIC_WORDS.has(word));
    if (namesA.length && namesB.length) return wordSimilarity(namesA, namesB);
    const genericA = wordsA.filter(word => GENERIC_WORDS.has(word));
    const genericB = wordsB.filter(word => GENERIC_WORDS.has(word));
    if (genericA.length && genericB.length) return wordSimilarity(genericA, genericB);
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
};

const normalizeLanguage = (language?: string) => {
    const value = language?.trim().toLowerCase();
    return value && value !== 'und' ? value : undefined;
};

const rankTrack = (saved: TrackSignature, track: TrackSignature): number => {
    if (!!saved.isForced !== !!track.isForced) return 0;
    const savedLanguage = normalizeLanguage(saved.language);
    const language = normalizeLanguage(track.language);
    if (savedLanguage && language && savedLanguage !== language) return 0;
    let rank: number;
    if (saved.title?.trim() && track.title?.trim()) {
        const similarity = titleSimilarity(saved.title, track.title);
        if (similarity < MIN_TITLE_SIMILARITY) return 0;
        rank = 2 + similarity;
    } else if (savedLanguage && language) {
        rank = 2;
    } else if (!savedLanguage && !language && saved.index === track.index) {
        rank = 1;
    } else {
        return 0;
    }
    if (saved.index === track.index) rank += 0.01;
    if (saved.codec === track.codec && saved.channels === track.channels) rank += 0.005;
    if (!!saved.isExternal === !!track.isExternal) rank += 0.005;
    return rank;
};

export const findMatchingTrack = (saved: TrackSignature, tracks: TrackSignature[]): number | null => {
    let best: number | null = null;
    let bestRank = 0;
    tracks.forEach((track, index) => {
        const rank = rankTrack(saved, track);
        if (rank > bestRank) {
            best = index;
            bestRank = rank;
        }
    });
    return best;
};

export const getAudioSignature = (track: AudioTrackInfo): TrackSignature => ({
    index: track.index,
    language: track.language,
    title: track.title,
    codec: track.codec,
    channels: track.channels,
});

export const getSubtitleSignature = (track: SubtitleTrackInfo, index: number): TrackSignature => ({
    index,
    language: track.language,
    title: track.title,
    isExternal: !!track.filePath,
    isForced: track.isForced,
});
