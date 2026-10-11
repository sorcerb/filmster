import { MediaType, RegexPatterns } from '../renderer/models/MediaFileModel';

export interface ParsedMediaName {
    parsedName: string;
    type: MediaType;
    year?: number;
    season?: number;
    episode?: number;
    episodeTitle?: string;
    resolution?: string;
    quality?: string;
}

interface CompiledPatterns {
    seasonEpisode: RegExp;
    episodeOnly: RegExp;
    seasonInFolder: RegExp;
    year: RegExp;
    resolution: RegExp;
    quality: RegExp;
    custom: RegExp | null;
    separator: RegExp;
}

const TECH_TAGS = /(?<![a-z\d])(?:HDR\d*|SDR|HEVC|AVC|[xh]\.?26[45]|\d{1,2} ?bits?|UHD|Remux|Rus|Eng|Ukr|AMZN|NF|DSNP|ATVP|IVI)(?![a-z])/gi;
const SERIES_FOLDER = /(?<![a-zа-яё])(?:tv|series|tv ?shows?|сериалы?)(?![a-zа-яё])/i;
const NEVER = /(?!)/g;

const compile = (pattern: string, flags = 'gi'): RegExp => {
    try {
        return new RegExp(pattern, flags);
    } catch (error) {
        console.error('Invalid regex pattern, it will be ignored:', pattern, error);
        return NEVER;
    }
};

let compiledKey = '';
let compiled: CompiledPatterns | null = null;

const getCompiled = (patterns: RegexPatterns): CompiledPatterns => {
    const key = JSON.stringify(patterns);
    if (compiled && compiledKey === key) return compiled;
    compiledKey = key;
    compiled = {
        seasonEpisode: compile(patterns.seasonEpisode),
        episodeOnly: compile(patterns.episodeOnly),
        seasonInFolder: compile(patterns.seasonInFolder),
        year: compile(patterns.year),
        resolution: compile(patterns.resolution),
        quality: compile(patterns.quality),
        custom: patterns.custom ? compile(patterns.custom) : null,
        separator: compile(patterns.separator || '[._]', 'g')
    };
    return compiled;
};

// matchAll results always have an index
type Match = RegExpExecArray;

const all = (re: RegExp, text: string): Match[] =>
    Array.from(text.matchAll(re)).filter(m => m[0] !== '');

const first = (re: RegExp, text: string): Match | undefined => all(re, text)[0];

const value = (m: RegExpMatchArray): string => m.slice(1).find(Boolean) ?? m[0];

const toNumber = (m: RegExpMatchArray | undefined, group: number): number | undefined => {
    const n = m?.[group] ? parseInt(m[group], 10) : NaN;
    return isNaN(n) ? undefined : n;
};

const firstTagIndex = (text: string, p: CompiledPatterns): number => {
    const indexes = [p.quality, p.resolution, TECH_TAGS]
        .flatMap(re => all(re, text).map(m => m.index))
        .filter(i => i > 0);
    return indexes.length ? Math.min(...indexes) : Infinity;
};

// The release year: the last year before the release tags ("Blade.Runner.2049.2017.1080p" -> 2017,
// "Ralph.2018.2160p.BT.2020" -> 2018). A year at the very start is a title ("1917.2019") unless it is the only one.
const findYear = (text: string, p: CompiledPatterns): { year: number; index: number } | undefined => {
    const matches = all(p.year, text);
    if (!matches.length) return undefined;
    const tagIndex = firstTagIndex(text, p);
    let candidates = matches.filter(m => m.index < tagIndex);
    if (!candidates.length) candidates = matches;
    if (candidates.length > 1) candidates = candidates.filter(m => m.index > 0);
    const m = candidates[candidates.length - 1];
    const year = parseInt(value(m), 10);
    return isNaN(year) ? undefined : { year, index: m.index };
};

const cleanTitle = (text: string, p: CompiledPatterns): string => {
    const cuts: number[] = [];
    const se = first(p.seasonEpisode, text);
    if (se) cuts.push(se.index);
    const season = first(p.seasonInFolder, text);
    if (season) cuts.push(season.index);
    const year = findYear(text, p);
    if (year && year.index > 0) {
        cuts.push(year.index);
    } else {
        cuts.push(firstTagIndex(text, p));
    }

    let name = text.slice(0, Math.min(...cuts));
    name = name
        .replace(/^\d{1,3}\.\s+(?=\S)/, '')
        .replace(/[([][^)\]]*[)\]]/g, ' ')
        .replace(/[([].*$/, ' ') // unclosed bracket left by the cut
        .replace(p.separator, ' ');
    if (p.custom) name = name.replace(p.custom, '');
    return name
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—.,:;_]+|[\s\-–—.,:;_]+$/g, '');
};

const isSeasonFolder = (folder: string, p: CompiledPatterns) => !!first(p.seasonInFolder, folder);

const seasonFromFolders = (folders: string[], p: CompiledPatterns): number | undefined => {
    for (let i = folders.length - 1; i >= 0; i--) {
        const m = first(p.seasonInFolder, folders[i]);
        if (!m) continue;
        const n = parseInt(m.slice(1).find(Boolean) ?? m[0].replace(/\D+/g, ''), 10);
        if (!isNaN(n)) return n;
    }
    return undefined;
};

const canonical = (tag: string, re: RegExp): string => {
    const i = re.source.toLowerCase().indexOf(tag.toLowerCase());
    return i >= 0 ? re.source.substr(i, tag.length) : tag;
};

const findTag = (re: RegExp, fileName: string, folders: string[]): string | undefined => {
    for (const text of [fileName, ...folders.slice().reverse()]) {
        const m = first(re, text);
        if (m) return value(m);
    }
    return undefined;
};

const parseResolution = (fileName: string, folders: string[], p: CompiledPatterns): string | undefined =>
    findTag(p.resolution, fileName, folders)?.replace(/[PI]$/, c => c.toLowerCase()).replace(/k$/, 'K');

const parseQuality = (fileName: string, folders: string[], p: CompiledPatterns): string | undefined => {
    const tag = findTag(p.quality, fileName, folders);
    return tag && canonical(tag, p.quality);
};

export const parseMediaName = (fileName: string, parentFolder: string, patterns: RegexPatterns): ParsedMediaName => {
    const p = getCompiled(patterns);
    const folders = parentFolder ? parentFolder.split('/').filter(Boolean) : [];
    const lastFolder = folders[folders.length - 1] ?? '';

    let season: number | undefined;
    let episode: number | undefined;
    let episodeOnly = false;
    let episodeEnd: number | undefined;
    const se = first(p.seasonEpisode, fileName);
    if (se && se[1] && se[2]) {
        season = toNumber(se, 1);
        episode = toNumber(se, 2);
        episodeEnd = se.index + se[0].length;
    } else {
        // "01.mkv", "E05 - Title" - trusted only inside a season folder or when the name is just the number,
        // otherwise "1. Madagascar (2005)" or "21 Jump Street" would become episodes
        const ep = first(p.episodeOnly, fileName);
        const onlyNumber = ep && !fileName.replace(ep[0], '').replace(/[\s._-]/g, '');
        if (ep && (isSeasonFolder(lastFolder, p) || onlyNumber)) {
            episode = parseInt(value(ep), 10);
            season = seasonFromFolders(folders, p) ?? 1;
            episodeOnly = true;
            episodeEnd = ep.index + ep[0].length;
        }
    }

    const isSeries = episode !== undefined ||
        folders.some(f => isSeasonFolder(f, p)) ||
        SERIES_FOLDER.test(parentFolder);

    let year = findYear(fileName, p)?.year;
    for (let i = folders.length - 1; year === undefined && i >= 0; i--) {
        year = findYear(folders[i], p)?.year;
    }

    // "05 - Pilot" holds the episode title, so the show name comes from the folders.
    let parsedName = episodeOnly && folders.length ? '' : cleanTitle(fileName, p);
    for (let i = folders.length - 1; !parsedName && i >= 0; i--) {
        parsedName = cleanTitle(folders[i], p);
    }

    if (!isSeries && lastFolder) {
        const numbered = parsedName.match(/^(.+?)\s+1$/);
        if (numbered && numbered[1].toLowerCase() === cleanTitle(lastFolder, p).toLowerCase()) {
            parsedName = numbered[1];
        }
    }

    const episodeTitle = episodeEnd !== undefined ? cleanTitle(fileName.slice(episodeEnd), p) : '';

    return {
        parsedName: parsedName || fileName,
        type: isSeries ? MediaType.Series : MediaType.Movie,
        year,
        season,
        episode,
        episodeTitle: episodeTitle || undefined,
        resolution: parseResolution(fileName, folders, p),
        quality: parseQuality(fileName, folders, p)
    };
};
