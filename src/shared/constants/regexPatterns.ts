import { RegexPatterns } from '../../renderer/models/MediaFileModel';

// Patterns are applied case-insensitively. Boundaries are written as (?<![a-z\d]) / (?![a-z\d])
// instead of \b, so that "_", "(" and "[" count as separators and Cyrillic names work too.
export const DEFAULT_REGEX_PATTERNS: RegexPatterns = {
    seasonEpisode: '(?<![a-z\\d])S(\\d{1,2})[ ._-]?E(\\d{1,3})(?!\\d)',
    episodeOnly: '^(?:ep?|episode)?[ ._-]?(\\d{1,3})(?=[ ._-]|$)',
    seasonInFolder: '(?<![a-zа-яё\\d])(?:S|Season[ ._]?|Сезон[ ._]?)(\\d{1,2})(?!\\d)|(?<![a-zа-яё\\d])(\\d{1,2})[ ._]?(?:Season|Сезон)',
    year: '(?<![a-z\\d])((?:19|20)\\d{2})(?:-(?:19|20)\\d{2})?(?![a-z\\d])',
    resolution: '(?<!\\d)(\\d{3,4}[pi]|[48]K)(?![a-z\\d])',
    quality: '(?<![a-z\\d])(WEB-DLRip|WEB-DL|WEBRip|WEB|BDRemux|Remux|BluRay|BDRip|BRRip|UHDRip|HDRip|HDTVRip|HDTV|DVDRip|CAMRip|IPTV|TS|TC)(?![a-z])',
    custom: '',
    separator: '[._]'
} as const;

// Previous defaults: a stored value equal to one of these is replaced with the current default
export const LEGACY_REGEX_PATTERNS: Partial<RegexPatterns>[] = [
    {
        seasonEpisode: 'S(\\d{1,2})[ .]?E?(\\d{1,2})',
        episodeOnly: '^(?:e?)(\\d{1,2})(?=[._\\-\\s]|$)',
        seasonInFolder: '(?:S\\d{1,2}|Season\\s\\d{1,2}|\\[Season\\s\\d{1,2}\\]|Сезон\\s\\d{1,2}|\\[Сезон\\s\\d{1,2}\\])',
        year: '(?<=[.\\-\\s]|^)(19\\d{2}|20\\d{2})(?=[.\\-\\s]|$)',
        resolution: '(?<=[.\\-\\s]|^)(2160p|1080p|720p|480p|4K|8K)(?=[.\\-\\s]|$)',
        quality: '(?<=[.\\-\\s]|^)\\b(WEB-DL|WEBRip|BluRay|BDRip|HDRip|DVDRip|HDTV|WEB|BRRip|CAMRip|TS|TC|IPTV|hdr)\\b(?=[.\\-\\s]|$)',
        separator: '[\\._]'
    }
];
