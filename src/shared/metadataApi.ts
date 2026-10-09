import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { ApiSettings } from '../renderer/models/ApiSettings';
import { MoveDbMediaSource, MovieMetadata } from '../renderer/models/MediaMetadata';

export type MetadataProvider = 'tmdb' | 'kinopoisk';

export const METADATA_PROVIDERS: MetadataProvider[] = ['tmdb', 'kinopoisk'];

// Used by the main process with net.fetch (the renderer goes through IPC)
export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Errors that won't go away on the next query (bad key, quota exceeded)
export class MetadataApiError extends Error {
    constructor(public provider: MetadataProvider, public status: number) {
        super(`${provider} API error ${status}`);
    }
}

export const getProviderApiKey = (provider: MetadataProvider, settings: ApiSettings | undefined): string =>
    ((provider === 'tmdb' ? settings?.apiKeyTheMovieDb : settings?.apiKeyKinopoisk) ?? '').trim();

// Not chosen yet: Kinopoisk (as before TMDB support), unless only the TMDB key is set
export const getDefaultProvider = (settings: ApiSettings | undefined): MetadataProvider => {
    if (settings?.defaultProvider && METADATA_PROVIDERS.includes(settings.defaultProvider)) return settings.defaultProvider;
    return !getProviderApiKey('kinopoisk', settings) && getProviderApiKey('tmdb', settings) ? 'tmdb' : 'kinopoisk';
};

export const buildMetadataFromFilm = (metadataId: string, film: MovieSearchResult): MovieMetadata | null => {
    const title = film.nameRu || film.nameEn;
    if (!title || !film.posterUrl) return null;

    const isTmdb = film.source === 'tmdb';
    const meta = {} as MovieMetadata;
    meta.id = metadataId;
    meta.externalIds = isTmdb ? { tmdb: film.filmId } : { kinopoisk: String(film.filmId) };
    meta.title = title;
    meta.year = parseInt(film.year) || 0;
    meta.description = film.description || '';
    meta.genres = film.genres?.map((genre) => genre.genre) || [];
    meta.countries = film.countries?.map(c => c.country) || [];
    meta.ratings = [
        {
            source: isTmdb ? MoveDbMediaSource.TMDB : MoveDbMediaSource.Kinopoisk,
            value: parseFloat(film.rating) || 0,
            votesCount: film.ratingVoteCount || 0
        }
    ];
    meta.dataSource = isTmdb ? MoveDbMediaSource.TMDB : MoveDbMediaSource.Kinopoisk;
    meta.posterUrl = film.posterUrl;
    meta.posterUrlPreview = film.posterUrlPreview;
    return meta;
};
