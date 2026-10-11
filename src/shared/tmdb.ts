import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { latinToCyrillic } from '../renderer/utils/transliteration';
import { FetchFn, MetadataApiError, NewsItem, NewsSection, PosterImage } from './metadataApi';

// The Movie DB API v3: https://developer.themoviedb.org/reference
const API_URL = 'https://api.themoviedb.org/3';
const IMAGE_URL = 'https://image.tmdb.org/t/p';

type MediaType = 'movie' | 'tv';

// The settings field takes either the v3 API key or the v4 read access token (a JWT, "eyJ...")
const request = async (apiPath: string, params: Record<string, string>, apiKey: string, fetchFn: FetchFn): Promise<any | null> => {
    const isToken = apiKey.startsWith('eyJ');
    const query = new URLSearchParams(isToken ? params : { ...params, api_key: apiKey });
    const headers: Record<string, string> = { accept: 'application/json' };
    if (isToken) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetchFn(`${API_URL}${apiPath}?${query}`, { method: 'GET', headers });
    if ([401, 403, 429].includes(response.status)) {
        throw new MetadataApiError('tmdb', response.status);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`TMDB request failed: ${response.status}`);
    }
    return JSON.parse(await response.text());
};

// Search results have genre ids only; the names (in the app language) are loaded once per language
const genreCache = new Map<string, Promise<Map<number, string>>>();

const getGenres = (language: string, apiKey: string, fetchFn: FetchFn): Promise<Map<number, string>> => {
    let genres = genreCache.get(language);
    if (!genres) {
        genres = Promise.all((['movie', 'tv'] as MediaType[]).map(type => request(`/genre/${type}/list`, { language }, apiKey, fetchFn)))
            .then(lists => new Map(lists.flatMap(list => list?.genres ?? []).map((genre: { id: number; name: string }) => [genre.id, genre.name])));
        genres.catch(() => genreCache.delete(language));
        genreCache.set(language, genres);
    }
    return genres;
};

// Search, find and details items -> the search result shape shared with Kinopoisk.
// nameRu holds the title in the app language, nameEn the original title.
const toSearchResult = (item: any, mediaType: MediaType, genres: Map<number, string>): MovieSearchResult => {
    const isMovie = mediaType === 'movie';
    const date: string | undefined = isMovie ? item.release_date : item.first_air_date;
    const genreNames: string[] = item.genres
        ? item.genres.map((genre: { name: string }) => genre.name)
        : (item.genre_ids ?? []).map((id: number) => genres.get(id)).filter(Boolean);
    return {
        source: 'tmdb',
        filmId: item.id,
        nameRu: (isMovie ? item.title : item.name) || null,
        nameEn: (isMovie ? item.original_title : item.original_name) || null,
        type: isMovie ? 'FILM' : 'TV_SERIES',
        year: date?.slice(0, 4) || '',
        description: item.overview || null,
        filmLength: item.runtime?.toString() || '',
        countries: (item.production_countries ?? []).map((country: { name: string }) => ({ country: country.name })),
        genres: genreNames.map(genre => ({ genre })),
        rating: item.vote_count ? Number(item.vote_average).toFixed(1) : 'null',
        ratingVoteCount: item.vote_count || 0,
        posterUrl: item.poster_path ? `${IMAGE_URL}/w780${item.poster_path}` : '',
        posterUrlPreview: item.poster_path ? `${IMAGE_URL}/w185${item.poster_path}` : '',
    };
};

// Movies and series in one list; people and entries without a poster are skipped
const searchMulti = async (query: string, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
    const data = await request('/search/multi', { query, language, include_adult: 'false', page: '1' }, apiKey, fetchFn);
    const results: any[] = (data?.results ?? []).filter((item: any) => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
    if (!results.length) return [];
    const genres = await getGenres(language, apiKey, fetchFn);
    return results.map(item => toSearchResult(item, item.media_type, genres));
};

// Results of the given year first (stable: TMDB's relevance order is kept otherwise)
const preferYear = (films: MovieSearchResult[], year: number | undefined): MovieSearchResult[] =>
    year ? [...films].sort((a, b) => Number(b.year === String(year)) - Number(a.year === String(year))) : films;

const getTrailingYear = (name: string): number | undefined => {
    const match = name.match(/\s((?:19|20)\d{2})$/);
    return match ? parseInt(match[1]) : undefined;
};

// Fallback chain: full name -> without trailing year -> transliterated name.
// TMDB search has no year in the query, so the year picks among the results.
export const findTmdbFilm = async (parsedName: string, year: number | undefined, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> => {
    const nameTrimmed = parsedName.trim();
    const nameWithoutTrailingYear = nameTrimmed.replace(/\s+(?:19|20)\d{2}$/, '');
    const hasExplicitYear = typeof year === 'number' && !Number.isNaN(year);
    const preferredYear = hasExplicitYear ? year : getTrailingYear(nameTrimmed);

    const names = [...new Set([nameTrimmed, nameWithoutTrailingYear, latinToCyrillic(nameWithoutTrailingYear)])].filter(Boolean);
    for (const name of names) {
        const films = await searchMulti(name, language, apiKey, fetchFn);
        if (films.length) return preferYear(films, preferredYear)[0];
    }
    return null;
};

const fetchDetails = async (mediaType: MediaType, id: string, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> => {
    const item = await request(`/${mediaType}/${id}`, { language }, apiKey, fetchFn);
    return item ? toSearchResult(item, mediaType, new Map()) : null;
};

const findByImdbId = async (imdbId: string, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
    const data = await request(`/find/${imdbId}`, { external_source: 'imdb_id', language }, apiKey, fetchFn);
    if (!data) return [];
    const genres = await getGenres(language, apiKey, fetchFn);
    return [
        ...(data.movie_results ?? []).map((item: any) => toSearchResult(item, 'movie', genres)),
        ...(data.tv_results ?? []).map((item: any) => toSearchResult(item, 'tv', genres)),
    ];
};

// Manual search: a TMDB link (themoviedb.org/movie/123, /tv/123) or IMDb ID/link (tt0133093) loads that title,
// otherwise fallback chain: full query -> without trailing year -> first word only
export const searchTmdbFilms = async (keyword: string, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
    const linkMatch = keyword.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (linkMatch) {
        const film = await fetchDetails(linkMatch[1] as MediaType, linkMatch[2], language, apiKey, fetchFn);
        return film ? [film] : [];
    }
    const imdbMatch = keyword.match(/\b(tt\d{5,})\b/);
    if (imdbMatch) {
        return findByImdbId(imdbMatch[1], language, apiKey, fetchFn);
    }

    const fullQuery = keyword.trim().replace(/\s+/g, ' ');
    const withoutYear = fullQuery.replace(/\s+(19|20)\d{2}$/, '').trim();
    const firstWord = withoutYear.split(' ')[0];
    const queries = [...new Set([fullQuery, withoutYear, firstWord])].filter(Boolean);

    for (const query of queries) {
        const films = await searchMulti(query, language, apiKey, fetchFn);
        if (films.length) return preferYear(films, getTrailingYear(fullQuery));
    }
    return [];
};

// All posters of the title: in the app language, English and without text (TMDB orders them by votes)
export const fetchTmdbPosters = async (film: MovieSearchResult, language: string, apiKey: string, fetchFn: FetchFn): Promise<PosterImage[]> => {
    const mediaType: MediaType = film.type === 'FILM' ? 'movie' : 'tv';
    const imageLanguage = [...new Set([language.split('-')[0], 'en', 'null'])].join(',');
    const data = await request(`/${mediaType}/${film.filmId}/images`, { include_image_language: imageLanguage }, apiKey, fetchFn);
    return (data?.posters ?? []).map((poster: { file_path: string }) => ({
        url: `${IMAGE_URL}/w780${poster.file_path}`,
        previewUrl: `${IMAGE_URL}/w185${poster.file_path}`,
    }));
};

// Full details of a title (genres and countries, which list items don't all have)
export const fetchTmdbDetails = (film: MovieSearchResult, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> =>
    fetchDetails(film.type === 'FILM' ? 'movie' : 'tv', String(film.filmId), language, apiKey, fetchFn);

const addDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Popular titles of the week; the upcoming list of TMDB is mostly films already out somewhere,
// so upcoming is the most awaited films of the next three months instead
const getNewsList = (section: NewsSection): { path: string; mediaType: MediaType; params?: Record<string, string> } => {
    switch (section) {
        case 'trending': return { path: '/trending/movie/week', mediaType: 'movie' };
        case 'nowPlaying': return { path: '/movie/now_playing', mediaType: 'movie' };
        case 'upcoming': return {
            path: '/discover/movie',
            mediaType: 'movie',
            params: { 'primary_release_date.gte': addDays(1), 'primary_release_date.lte': addDays(90), sort_by: 'popularity.desc' },
        };
        case 'series': return { path: '/trending/tv/week', mediaType: 'tv' };
    }
};

// First page (20 titles) of the list; titles without a poster are skipped
export const fetchTmdbNews = async (section: NewsSection, language: string, apiKey: string, fetchFn: FetchFn): Promise<NewsItem[]> => {
    const { path, mediaType, params } = getNewsList(section);
    const data = await request(path, { language, page: '1', include_adult: 'false', ...params }, apiKey, fetchFn);
    const results: any[] = (data?.results ?? []).filter((item: any) => item.poster_path);
    const genres = await getGenres(language, apiKey, fetchFn);
    const items: NewsItem[] = results.map(item => ({
        ...toSearchResult(item, mediaType, genres),
        releaseDate: (mediaType === 'movie' ? item.release_date : item.first_air_date) || undefined,
    }));
    return section === 'upcoming'
        ? items.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
        : items;
};
