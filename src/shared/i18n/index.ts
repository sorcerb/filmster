import en, { MessageKey, Messages } from './locales/en';
import ru from './locales/ru';
import lt from './locales/lt';
import lv from './locales/lv';
import tr from './locales/tr';
import de from './locales/de';
import fr from './locales/fr';
import it from './locales/it';
import es from './locales/es';
import et from './locales/et';
import uk from './locales/uk';
import pl from './locales/pl';
import ro from './locales/ro';
import nl from './locales/nl';
import cs from './locales/cs';
import pt from './locales/pt';

export type { MessageKey, Messages };

const locales = { en, ru, lt, lv, et, tr, de, fr, it, es, uk, pl, ro, nl, cs, pt };

export type Language = keyof typeof locales;

export const DEFAULT_LANGUAGE: Language = 'en';

// Sorted by code so Cyrillic names don't end up last
export const LANGUAGES: { code: Language; name: string }[] = [
    { code: 'cs', name: 'Čeština' },
    { code: 'de', name: 'Deutsch' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'et', name: 'Eesti' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'lt', name: 'Lietuvių' },
    { code: 'lv', name: 'Latviešu' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'pt', name: 'Português' },
    { code: 'ro', name: 'Română' },
    { code: 'ru', name: 'Русский' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'uk', name: 'Українська' },
];

const CYRILLIC_LANGUAGES: Language[] = ['ru', 'uk'];

export const isCyrillicLanguage = (language: Language): boolean => CYRILLIC_LANGUAGES.includes(language);

export const isLanguage =(value: unknown): value is Language =>
    typeof value === 'string' && value in locales;

export const resolveLanguage = (locale: string | undefined): Language => {
    const code = locale?.toLowerCase().split(/[-_]/)[0];
    return isLanguage(code) ? code : DEFAULT_LANGUAGE;
};

export type TranslateParams = Record<string, string | number>;

export const translate = (language: Language, key: MessageKey, params?: TranslateParams): string => {
    const message = locales[language]?.[key] ?? en[key];
    if (!params) return message;
    return message.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
};
