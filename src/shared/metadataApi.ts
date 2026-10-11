import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { ApiSettings } from '../renderer/models/ApiSettings';
import { MoveDbMediaSource, MovieMetadata, Person } from '../renderer/models/MediaMetadata';

export type MetadataProvider = 'tmdb' | 'kinopoisk';

export const METADATA_PROVIDERS: MetadataProvider[] = ['tmdb', 'kinopoisk'];

export type NewsSection = 'trending' | 'nowPlaying' | 'upcoming' | 'series';

export const NEWS_SECTIONS: NewsSection[] = ['trending', 'nowPlaying', 'upcoming', 'series'];

// releaseDate: YYYY-MM-DD
export interface NewsItem extends MovieSearchResult {
    releaseDate?: string;
}

export interface PosterImage {
    url: string;
    previewUrl: string;
}

export interface FilmCredits {
    directors: Person[];
    actors: Person[];
}

export const CAST_LIMIT = 20;

export interface FilmImages {
    posters: PosterImage[];
    backdrops: PosterImage[];
}

export type BackdropChange = { kind: 'movie' } | { kind: 'keep' } | { kind: 'image'; url: string } | { kind: 'none' };

export const isBackdropChange = (value: unknown): value is BackdropChange => {
    if (typeof value !== 'object' || value === null) return false;
    const { kind, url } = value as { kind?: unknown; url?: unknown };
    if (kind === 'image') return typeof url === 'string' && (/^https?:\/\//i.test(url) || url.startsWith('data:image/jpeg;base64,'));
    return kind === 'movie' || kind === 'keep' || kind === 'none';
};

export interface CustomPoster {
    poster: string;
    preview: string;
}

export const isCustomPoster = (value: unknown): value is CustomPoster => {
    const isJpeg = (url: unknown) => typeof url === 'string' && url.startsWith('data:image/jpeg;base64,');
    return typeof value === 'object' && value !== null && isJpeg((value as CustomPoster).poster) && isJpeg((value as CustomPoster).preview);
};

export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class MetadataApiError extends Error {
    constructor(public provider: MetadataProvider, public status: number) {
        super(`${provider} API error ${status}`);
    }
}

export const getProviderApiKey = (provider: MetadataProvider, settings: ApiSettings | undefined): string =>
    ((provider === 'tmdb' ? settings?.apiKeyTheMovieDb : settings?.apiKeyKinopoisk) ?? '').trim();

export const getDefaultProvider = (settings: ApiSettings | undefined): MetadataProvider => {
    if (settings?.defaultProvider && METADATA_PROVIDERS.includes(settings.defaultProvider)) return settings.defaultProvider;
    return !getProviderApiKey('kinopoisk', settings) && getProviderApiKey('tmdb', settings) ? 'tmdb' : 'kinopoisk';
};

export const getMediaType = (film: MovieSearchResult): MovieMetadata['type'] =>
    ['TV_SERIES', 'MINI_SERIES', 'TV_SHOW'].includes(film.type) ? 'series' : 'movie';

export const getProviderFilmUrl = (meta: MovieMetadata, fallbackType: MovieMetadata['type']): string | null => {
    const { kinopoisk, tmdb } = meta.externalIds ?? {};
    if (kinopoisk) return `https://www.kinopoisk.ru/film/${encodeURIComponent(kinopoisk)}/`;
    if (tmdb) return `https://www.themoviedb.org/${(meta.type ?? fallbackType) === 'series' ? 'tv' : 'movie'}/${encodeURIComponent(tmdb)}`;
    return null;
};

export const buildMetadataFromFilm =(metadataId: string, film: MovieSearchResult): MovieMetadata | null => {
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
    meta.type = getMediaType(film);
    meta.posterUrl = film.posterUrl;
    meta.posterUrlPreview = film.posterUrlPreview;
    return meta;
};
