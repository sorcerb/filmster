import { net } from 'electron';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { getApiSettings } from '../renderer/stores/ApiSettingsStore';
import { getLanguage } from '../renderer/stores/LanguageStore';
import { getDefaultProvider, getProviderApiKey, METADATA_PROVIDERS, MetadataApiError, MetadataProvider } from '../shared/metadataApi';
import { findKinopoiskFilm, searchKinopoiskFilms } from '../shared/kinopoisk';
import { findTmdbFilm, searchTmdbFilms } from '../shared/tmdb';

// Metadata API requests go through the main process: no CORS in the renderer, and the API keys stay here

export const getDefaultMetadataProvider = (): MetadataProvider => getDefaultProvider(getApiSettings());

// Providers with an API key, the default one first
const getProviderOrder = (): MetadataProvider[] => {
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
