import { net } from 'electron';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { getApiSettings } from '../renderer/stores/ApiSettingsStore';
import { getLanguage } from '../renderer/stores/LanguageStore';
import { FilmImages, getDefaultProvider, getProviderApiKey, METADATA_PROVIDERS, MetadataApiError, MetadataProvider, NewsItem, NewsSection } from '../shared/metadataApi';
import { fetchKinopoiskDetails, fetchKinopoiskImages, fetchKinopoiskNews, findKinopoiskFilm, searchKinopoiskFilms } from '../shared/kinopoisk';
import { fetchTmdbDetails, fetchTmdbImages, fetchTmdbNews, findTmdbFilm, searchTmdbFilms } from '../shared/tmdb';

// Metadata API requests go through the main process: no CORS in the renderer, and the API keys stay here

// Providers with an API key, the default one first
export const getProviderOrder = (): MetadataProvider[] => {
    const settings = getApiSettings();
    const first = getDefaultProvider(settings);
    return [first, ...METADATA_PROVIDERS.filter(provider => provider !== first)]
        .filter(provider => getProviderApiKey(provider, settings));
};

export const searchFilms = (provider: MetadataProvider, keyword: string): Promise<MovieSearchResult[]> => {
    const apiKey = getProviderApiKey(provider, getApiSettings());
    return provider === 'tmdb'
        ? searchTmdbFilms(keyword, getLanguage(), apiKey, net.fetch)
        : searchKinopoiskFilms(keyword, apiKey, net.fetch);
};

// Kinopoisk keyword search results have no source
export const getFilmImages = (film: MovieSearchResult): Promise<FilmImages> => {
    const provider: MetadataProvider = film.source === 'tmdb' ? 'tmdb' : 'kinopoisk';
    const apiKey = getProviderApiKey(provider, getApiSettings());
    return provider === 'tmdb'
        ? fetchTmdbImages(film, getLanguage(), apiKey, net.fetch)
        : fetchKinopoiskImages(film, apiKey, net.fetch);
};

const findFilmWith = (provider: MetadataProvider, parsedName: string, year: number | undefined): Promise<MovieSearchResult | null> => {
    const apiKey = getProviderApiKey(provider, getApiSettings());
    return provider === 'tmdb'
        ? findTmdbFilm(parsedName, year, getLanguage(), apiKey, net.fetch)
        : findKinopoiskFilm(parsedName, year, apiKey, net.fetch);
};

// Default provider first, the other one if it finds nothing. A provider that fails with a bad key or
// exceeded quota is added to failedProviders and skipped from then on; once all of them failed, the error is thrown.
export const findFilm = async (parsedName: string, year: number | undefined, failedProviders = new Set<MetadataProvider>()): Promise<MovieSearchResult | null> => {
    const providers = getProviderOrder().filter(provider => !failedProviders.has(provider));
    let apiError: MetadataApiError | null = null;
    for (const provider of providers) {
        try {
            const film = await findFilmWith(provider, parsedName, year);
            if (film) return film;
        } catch (error) {
            if (!(error instanceof MetadataApiError)) throw error;
            failedProviders.add(provider);
            apiError = error;
        }
    }
    if (apiError && providers.every(provider => failedProviders.has(provider))) throw apiError;
    return null;
};

export const hasAnyProviderKey = (): boolean => getProviderOrder().length > 0;

// Kinopoisk keyword search results have no source
export const getFilmDetails = (film: MovieSearchResult): Promise<MovieSearchResult | null> => {
    const provider: MetadataProvider = film.source === 'tmdb' ? 'tmdb' : 'kinopoisk';
    const apiKey = getProviderApiKey(provider, getApiSettings());
    return provider === 'tmdb'
        ? fetchTmdbDetails(film, getLanguage(), apiKey, net.fetch)
        : fetchKinopoiskDetails(film.filmId, apiKey, net.fetch);
};

// The lists change slowly, and Kinopoisk keys have a daily quota: one request per list for a few hours
const NEWS_CACHE_MS = 6 * 60 * 60 * 1000;
const newsCache = new Map<string, { time: number; items: Promise<NewsItem[]> }>();

// Empty for a provider without a key
export const getNews = (provider: MetadataProvider, section: NewsSection): Promise<NewsItem[]> => {
    const apiKey = getProviderApiKey(provider, getApiSettings());
    if (!apiKey) return Promise.resolve([]);
    const language = getLanguage();
    const cacheKey = `${provider}:${apiKey}:${language}:${section}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.time < NEWS_CACHE_MS) return cached.items;

    const items = provider === 'tmdb'
        ? fetchTmdbNews(section, language, apiKey, net.fetch)
        : fetchKinopoiskNews(section, apiKey, net.fetch);
    items.catch(() => newsCache.delete(cacheKey));
    newsCache.set(cacheKey, { time: Date.now(), items });
    return items;
};
