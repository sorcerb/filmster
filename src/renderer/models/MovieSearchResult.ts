import type { MetadataProvider } from '../../shared/metadataApi';

export interface MovieSearchResult {
    // Missing in Kinopoisk keyword search results
    source?: MetadataProvider;
    filmId: number;
    // Kinopoisk: Russian / English title; TMDB: title in the app language / original title
    nameRu: string | null;
    nameEn: string | null;
    type: 'FILM' | 'TV_SHOW' | 'VIDEO' | 'MINI_SERIES' | 'TV_SERIES' | 'UNKNOWN';
    year: string;
    description: string | null;
    filmLength: string;
    countries: Array<{ country: string }>;
    genres: Array<{ genre: string }>;
    rating: string;
    ratingVoteCount: number;
    posterUrl: string;
    posterUrlPreview: string;
    // Wide background picture: TMDB backdrop, Kinopoisk cover (details only, keyword search results have none)
    backdropUrl?: string;
}