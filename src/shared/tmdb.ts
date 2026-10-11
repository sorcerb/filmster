import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { latinToCyrillic } from '../renderer/utils/transliteration';
import { Person } from '../renderer/models/MediaMetadata';
import { CAST_LIMIT, FetchFn, FilmCredits, FilmImages, MetadataApiError, NewsItem, NewsSection } from './metadataApi';

const API_URL = 'https://api.themoviedb.org/3';
const IMAGE_URL = 'https://image.tmdb.org/t/p';
const PERSON_URL = 'https://www.themoviedb.org/person';

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
        backdropUrl: item.backdrop_path ? `${IMAGE_URL}/w1280${item.backdrop_path}` : undefined,
    };
};

const searchMulti = async (query: string, language: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
    const data = await request('/search/multi', { query, language, include_adult: 'false', page: '1' }, apiKey, fetchFn);
    const results: any[] = (data?.results ?? []).filter((item: any) => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);
    if (!results.length) return [];
    const genres = await getGenres(language, apiKey, fetchFn);
    return results.map(item => toSearchResult(item, item.media_type, genres));
};

// Stable sort: TMDB's relevance order is kept otherwise
const preferYear = (films: MovieSearchResult[], year: number | undefined): MovieSearchResult[] =>
    year ? [...films].sort((a, b) => Number(b.year === String(year)) - Number(a.year === String(year))) : films;

const getTrailingYear = (name: string): number | undefined => {
    const match = name.match(/\s((?:19|20)\d{2})$/);
    return match ? parseInt(match[1]) : undefined;
};

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

export const fetchTmdbImages = async (film: MovieSearchResult, language: string, apiKey: string, fetchFn: FetchFn): Promise<FilmImages> => {
    const mediaType: MediaType = film.type === 'FILM' ? 'movie' : 'tv';
    const imageLanguage = [...new Set([language.split('-')[0], 'en', 'null'])].join(',');
    const data = await request(`/${mediaType}/${film.filmId}/images`, { include_image_language: imageLanguage }, apiKey, fetchFn);
    type Image = { file_path: string; iso_639_1: string | null };
    const backdrops: Image[] = [...(data?.backdrops ?? [])].sort((a: Image, b: Image) => Number(a.iso_639_1 != null) - Number(b.iso_639_1 != null));
    return {
        posters: (data?.posters ?? []).map((poster: Image) => ({
            url: `${IMAGE_URL}/w780${poster.file_path}`,
            previewUrl: `${IMAGE_URL}/w185${poster.file_path}`,
        })),
        backdrops: backdrops.map(backdrop => ({
            url: `${IMAGE_URL}/w1280${backdrop.file_path}`,
            previewUrl: `${IMAGE_URL}/w300${backdrop.file_path}`,
        })),
    };
};

// Directors only for movies: series have one per episode
export const fetchTmdbCredits = async (film: MovieSearchResult, language: string, apiKey: string, fetchFn: FetchFn): Promise<FilmCredits> => {
    const isMovie = film.type === 'FILM';
    const data = await request(isMovie ? `/movie/${film.filmId}/credits` : `/tv/${film.filmId}/aggregate_credits`, { language }, apiKey, fetchFn);
    const toPerson = (person: any, role: Person['role'], character?: string): Person => ({
        id: String(person.id),
        name: person.name,
        role,
        character: character || undefined,
        photoUrl: person.profile_path ? `${IMAGE_URL}/w185${person.profile_path}` : undefined,
        profileUrl: `${PERSON_URL}/${person.id}`,
    });
    return {
        directors: isMovie ? (data?.crew ?? []).filter((person: any) => person.job === 'Director').map((person: any) => toPerson(person, 'director')) : [],
        actors: (data?.cast ?? []).slice(0, CAST_LIMIT).map((person: any) => toPerson(person, 'actor', person.character ?? person.roles?.[0]?.character)),
    };
};

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
