import { MediaFileModel } from '../models/MediaFileModel';

const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбюё';

const swapLayout = (text: string): string => Array.from(text, char => {
    const en = EN_LAYOUT.indexOf(char);
    if (en >= 0) return RU_LAYOUT[en];
    const ru = RU_LAYOUT.indexOf(char);
    return ru >= 0 ? EN_LAYOUT[ru] : char;
}).join('');

const normalize = (text: string): string =>
    text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const getSearchWords = (item: MediaFileModel): string[] => {
    const files = [item, ...(item.episodes ?? [])];
    return normalize(files.flatMap(file => [
        file.metadata?.title,
        file.metadata?.originalTitle,
        file.parsedName,
        file.groupName,
        file.fileName,
    ]).filter(Boolean).join(' ')).split(' ');
};

const matchesWord = (words: string[], queryWord: string) =>
    /^\d+$/.test(queryWord) ? words.includes(queryWord) : words.some(word => word.startsWith(queryWord));

export const createSearchMatcher = (query: string): ((item: MediaFileModel) => boolean) | null => {
    const raw = query.toLowerCase().trim();
    if (!raw) return null;
    // The layout swap works on the raw query: normalize() would drop the keys that are punctuation in English ([;',.)
    const variants = [normalize(raw), normalize(swapLayout(raw))]
        .filter(Boolean)
        .map(variant => variant.split(' '));
    return (item) => {
        const words = getSearchWords(item);
        return variants.some(queryWords => queryWords.every(queryWord => matchesWord(words, queryWord)));
    };
};
