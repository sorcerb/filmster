import Store from 'electron-store';
import { app } from 'electron';
import { isLanguage, Language, resolveLanguage } from '../../shared/i18n';

const storeName = 'Language';
const store = new Store<{ Language?: Language }>();

export const getLanguage = (): Language => {
    const saved = store.get(storeName);
    return isLanguage(saved) ? saved : resolveLanguage(app.getLocale());
};

export const setLanguage = (language: Language): void => {
    store.set(storeName, language);
};
