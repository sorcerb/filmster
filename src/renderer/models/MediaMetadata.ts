export enum MoveDbMediaSource {
    IMDB = 'imdb',
    Kinopoisk = 'kinopoisk',
    TMDB = 'tmdb'
}

export interface Person {
    id: string;
    name: string;
    role: 'actor' | 'director' | 'writer' | 'producer';
    character?: string;
    photoUrl?: string;
    profileUrl?: string;
}

export interface Rating {
    source: MoveDbMediaSource;
    value: number;
    votesCount?: number;
}

export interface MovieMetadata {
    id: string;
    externalIds: {
        imdb?: string;
        kinopoisk?: string;
        tmdb?: number;
    };
    
    title: string | null;
    originalTitle?: string;
    year: number;
    releaseDate?: string;
    
    description?: string;
    shortDescription?: string;
    tagline?: string;
    
    genres: string[];
    countries: string[];
    
    ratings: Rating[];
    averageRating?: number;
    
    directors?: Person[];
    actors?: Person[];
    writers: Person[];
    producers: Person[];
    
    posterUrl?: string;
    posterUrlPreview?: string;
    backdropUrl?: string;
    noBackdrop?: boolean;
    // ms timestamp
    backdropCheckedAt?: number;
    trailerUrl?: string;
    
    numberOfSeasons?: number;
    numberOfEpisodes?: number;
    episodeRunTime?: number[];
    status?: 'Returning Series' | 'Ended' | 'Canceled' | 'In Production';
    
    runtime?: number;
    budget?: number;
    revenue?: number;
    
    type: 'movie' | 'series';
    contentRating?: string;
    language?: string;
    
    lastUpdated: Date;
    dataSource: MoveDbMediaSource;
    _updated?: Date;
}

export interface SeasonMetadata {
    seasonNumber: number;
    name?: string;
    overview?: string;
    posterUrl?: string;
    airDate?: string;
    episodeCount: number;
    episodes?: EpisodeMetadata[];
}

export interface EpisodeMetadata {
    id: string;
    episodeNumber: number;
    seasonNumber: number;
    name: string;
    overview?: string;
    airDate?: string;
    runtime?: number;
    stillUrl?: string; 
    rating?: number;
    guestStars?: Person[];
}

export interface MetadataSearchQuery {
    title: string;
    year?: number;
    type?: 'movie' | 'series';
    imdbId?: string;
}

export interface MetadataSearchResult {
    id: string;
    title: string;
    originalTitle?: string;
    year: number;
    type: 'movie' | 'series';
    posterUrl?: string;
    description?: string;
    relevanceScore: number; 
}
