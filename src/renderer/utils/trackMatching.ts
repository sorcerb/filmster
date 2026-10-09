import { AudioTrackInfo, SubtitleTrackInfo } from '../models/MediaInfo';
import { TrackSignature } from '../models/TrackPreference';

// A track chosen in one episode is looked up in the next one by its title (the studio / translation name),
// not by its position: an episode may lack one of the translations and the rest shift. Titles of the same
// translation differ a bit between releases ("MVO | LostFilm", "LostFilm.TV [AC3 5.1]"), so they are compared
// by words, without the format ones. Language and position only decide when there are no titles to compare.

// Codec, channel and bitrate words: "Dub [AC3 5.1]" is the same translation as "Dub"
const FORMAT_WORDS = new Set([
    'ac3', 'eac3', 'dd', 'ddp', 'dts', 'hd', 'ma', 'es', 'x', 'aac', 'he', 'lc', 'flac', 'mp3', 'opus', 'pcm', 'lpcm',
    'truehd', 'atmos', 'ch', 'kbps', 'kbit', 'srt', 'ass', 'ssa', 'vtt', 'sub', 'subs',
]);
// Kinds of translation: they say nothing about whose it is ("MVO | LostFilm" vs "MVO | NewStudio")
const GENERIC_WORDS = new Set([
    'dub', 'dubbing', 'dubbed', 'mvo', 'dvo', 'avo', 'vo', 'voice', 'over', 'original', 'orig',
    'дубляж', 'дублированный', 'многоголосый', 'двухголосый', 'одноголосый', 'закадровый', 'профессиональный',
    'любительский', 'авторский', 'оригинал', 'оригинальная', 'дорожка', 'перевод', 'субтитры',
]);
// Titles at least this similar are taken for the same translation
const MIN_TITLE_SIMILARITY = 0.5;

const toWords = (title: string): string[] => title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word && !FORMAT_WORDS.has(word) && !/^\d+$/.test(word));

// A word set repeated with extra words ("LostFilm" / "LostFilm TV") is the same translation; the exact one still
// wins ("Rus" picks "Rus" over "Rus Forced")
const wordSimilarity = (a: string[], b: string[]): number => {
    const common = a.filter(word => b.includes(word)).length;
    const all = new Set([...a, ...b]).size;
    return 0.9 * common / Math.min(a.length, b.length) + 0.1 * common / all;
};

// 0..1. Studio and author names count first; the generic words only when one of the titles has nothing else
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

// How well `track` matches the saved one; 0 - it's a different track
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
    // Ties: the same position, format and kind
    if (saved.index === track.index) rank += 0.01;
    if (saved.codec === track.codec && saved.channels === track.channels) rank += 0.005;
    if (!!saved.isExternal === !!track.isExternal) rank += 0.005;
    return rank;
};

// Position of the track matching the saved one, null - none of them does
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
