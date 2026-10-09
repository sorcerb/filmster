import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, Language, MessageKey, translate, TranslateParams } from '../../shared/i18n';

interface I18nContextValue {
    language: Language;
    setLanguage: (language: Language) => Promise<void>;
    t: (key: MessageKey, params?: TranslateParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    // null until the saved language is loaded, so the UI doesn't flash in English first
    const [language, setLanguageState] = useState<Language | null>(null);

    useEffect(() => {
        window.electron.getLanguage()
            .catch(error => {
                console.error('Error reading language setting:', error);
                return DEFAULT_LANGUAGE;
            })
            .then(setLanguageState);
    }, []);

    useEffect(() => {
        if (language) document.documentElement.lang = language;
    }, [language]);

    const setLanguage = useCallback(async (next: Language) => {
        setLanguageState(next);
        await window.electron.setLanguage(next);
    }, []);

    const t = useCallback(
        (key: MessageKey, params?: TranslateParams) => translate(language ?? DEFAULT_LANGUAGE, key, params),
        [language]
    );

    if (!language) return null;

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = (): I18nContextValue => {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n must be used inside I18nProvider');
    return context;
};
