import Store from 'electron-store';
import { RegexPatterns } from '../models/MediaFileModel';
import { DEFAULT_REGEX_PATTERNS } from '../../shared/constants/regexPatterns';

const storeName = 'RegexPatterns';
const store = new Store<{ [storeName]: RegexPatterns }>({
    defaults: { [storeName]: DEFAULT_REGEX_PATTERNS }
});

export const getRegexPatterns = (): RegexPatterns => {
    return store.get(storeName, DEFAULT_REGEX_PATTERNS);
};

export const updateRegexPatterns = (patterns: RegexPatterns): void => {
    store.set(storeName, patterns);
};

export const resetRegexPatterns = (): void => {
    store.set(storeName, DEFAULT_REGEX_PATTERNS);
};

