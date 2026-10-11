import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { latinToCyrillic } from '../renderer/utils/transliteration';
import { FetchFn, MetadataApiError, NewsItem, NewsSection, PosterImage } from './metadataApi';

const SEARCH_URL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
const FILM_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const COLLECTIONS_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/collections';
const PREMIERES_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/premieres';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const searchByKeyword = async (keyword: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> => {
    const response = await fetchFn(`${SEARCH_URL}?keyword=${encodeURIComponent(keyword)}&page=1`, {
        method: 'GET',
        headers: {
            'X-API-KEY': apiKey,
            'accept': 'application/json',
        },
    });
    if ([401, 402, 403, 429].includes(response.status)) {
        throw new MetadataApiError('kinopoisk', response.status);
    }
    if (!response.ok) return null;

    try {
        const data = JSON.parse(await response.text());
        return data.films?.length > 0 ? data.films[0] : null;
    } catch (e) {
        console.error('Failed to parse JSON response:', e);
        return null;
    }
};

// Fallback chain: name + year -> without year -> transliterated name (with/without trailing year)
export const findKinopoiskFilm = async (parsedName: string, year: number | undefined, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> => {
    const nameTrimmed = parsedName.trim();
    const nameWithoutTrailingYear = nameTrimmed.replace(/\s+(?:19|20)\d{2}$/, '');
    const nameHasTrailingYear = nameWithoutTrailingYear !== nameTrimmed;
    const hasExplicitYear = typeof year === 'number' && !Number.isNaN(year);
    const withYear = (name: string) => hasExplicitYear ? `${name} ${year}` : name;

    let film = await searchByKeyword(withYear(nameTrimmed), apiKey, fetchFn);

    if (!film && (hasExplicitYear || nameHasTrailingYear)) {
        await delay(200);
        film = await searchByKeyword(nameHasTrailingYear ? nameWithoutTrailingYear : nameTrimmed, apiKey, fetchFn);
    }

    if (!film) {
        film = await searchByKeyword(withYear(latinToCyrillic(nameTrimmed)), apiKey, fetchFn);
    }

    if (!film && nameHasTrailingYear) {
        film = await searchByKeyword(withYear(latinToCyrillic(nameWithoutTrailingYear)), apiKey, fetchFn);
    }

    return film;
};

const fetchFilmById = async (id: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> => {
    const response = await fetchFn(`${FILM_URL}/${id}`, {
        method: 'GET',
        headers: {
            'X-API-KEY': apiKey,
            'accept': 'application/json',
        },
    });

    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error('Error loading movie by id');
    }

    const film = JSON.parse(await response.text());
    return {
        source: 'kinopoisk',
        filmId: film.kinopoiskId,
        nameRu: film.nameRu,
        nameEn: film.nameEn || film.nameOriginal,
        type: film.type,
        year: film.year?.toString() || '',
        description: film.description,
        filmLength: film.filmLength?.toString() || '',
        countries: film.countries || [],
        genres: film.genres || [],
        rating: film.ratingKinopoisk?.toString() || 'null',
        ratingVoteCount: film.ratingKinopoiskVoteCount || 0,
        posterUrl: film.posterUrl,
        posterUrlPreview: film.posterUrlPreview,
    };
};

// Manual search: Kinopoisk ID or link loads that film, otherwise
// fallback chain: full query -> without trailing year -> first word only
export const searchKinopoiskFilms = async (keyword: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
    // Kinopoisk ID or link (kinopoisk.ru/film/123/, /series/123/) -> load by ID
    const idMatch = keyword.trim().match(/^(\d+)$|kinopoisk\.ru\/(?:film|series)\/(\d+)/);
    if (idMatch) {
        const film = await fetchFilmById(idMatch[1] || idMatch[2], apiKey, fetchFn);
        return film ? [film] : [];
    }

    const fullQuery = keyword.trim().replace(/\s+/g, ' ');
    const withoutYear = fullQuery.replace(/\s+(19|20)\d{2}$/, '').trim();
    const firstWord = withoutYear.split(' ')[0];
    const queries = [...new Set([fullQuery, withoutYear, firstWord])].filter(Boolean);

    for (const query of queries) {
        const response = await fetchFn(`${SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`, {
            method: 'GET',
            headers: {
                'X-API-KEY': apiKey,
                'accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Error searching for movies');
        }

        const films: MovieSearchResult[] = JSON.parse(await response.text()).films || [];
        if (films.length > 0) {
            return films;
        }
    }
    return [];
};

// Posters of the film, first page only (20): each page is a request out of the key's daily quota
export const fetchKinopoiskPosters = async (filmId: number, apiKey: string, fetchFn: FetchFn): Promise<PosterImage[]> => {
    const response = await fetchFn(`${FILM_URL}/${filmId}/images?type=POSTER&page=1`, {
        method: 'GET',
        headers: {
            'X-API-KEY': apiKey,
            'accept': 'application/json',
        },
    });
    if ([401, 402, 403, 429].includes(response.status)) {
        throw new MetadataApiError('kinopoisk', response.status);
    }
    if (response.status === 404) return [];
    if (!response.ok) {
        throw new Error(`Kinopoisk request failed: ${response.status}`);
    }
    const data = JSON.parse(await response.text());
    return (data.items ?? []).map((item: { imageUrl: string; previewUrl: string }) => ({ url: item.imageUrl, previewUrl: item.previewUrl || item.imageUrl }));
};

// Full details of a film (the description, which list items don't have)
export const fetchKinopoiskDetails = (filmId: number, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult | null> =>
    fetchFilmById(String(filmId), apiKey, fetchFn);

const requestJson = async (url: string, apiKey: string, fetchFn: FetchFn): Promise<any> => {
    const response = await fetchFn(url, {
        method: 'GET',
        headers: {
            'X-API-KEY': apiKey,
            'accept': 'application/json',
        },
    });
    if ([401, 402, 403, 429].includes(response.status)) {
        throw new MetadataApiError('kinopoisk', response.status);
    }
    if (!response.ok) {
        throw new Error(`Kinopoisk request failed: ${response.status}`);
    }
    return JSON.parse(await response.text());
};

// Collection and premiere items -> the search result shape
const toNewsItem = (film: any): NewsItem => ({
    source: 'kinopoisk',
    filmId: film.kinopoiskId,
    nameRu: film.nameRu || null,
    nameEn: film.nameEn || film.nameOriginal || null,
    type: film.type || 'FILM',
    year: film.year?.toString() || '',
    description: film.description || null,
    filmLength: (film.duration ?? film.filmLength)?.toString() || '',
    countries: film.countries || [],
    genres: film.genres || [],
    rating: film.ratingKinopoisk?.toString() || 'null',
    ratingVoteCount: film.ratingKinopoiskVoteCount || 0,
    posterUrl: film.posterUrl,
    posterUrlPreview: film.posterUrlPreview,
    releaseDate: film.premiereRu || undefined,
});

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// Russian premieres of the month (offset from the current one)
const fetchPremieres = async (monthOffset: number, apiKey: string, fetchFn: FetchFn): Promise<NewsItem[]> => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthOffset);
    const data = await requestJson(`${PREMIERES_URL}?year=${date.getFullYear()}&month=${MONTHS[date.getMonth()]}`, apiKey, fetchFn);
    return (data.items ?? []).map(toNewsItem);
};

const fetchCollection = async (type: string, apiKey: string, fetchFn: FetchFn): Promise<NewsItem[]> => {
    const data = await requestJson(`${COLLECTIONS_URL}?type=${type}&page=1`, apiKey, fetchFn);
    return (data.items ?? []).map(toNewsItem);
};

// In cinemas: premieres of this and the last month that already happened, newest first;
// upcoming: those of this and the next month still ahead, nearest first
export const fetchKinopoiskNews = async (section: NewsSection, apiKey: string, fetchFn: FetchFn): Promise<NewsItem[]> => {
    if (section === 'trending') return fetchCollection('TOP_POPULAR_MOVIES', apiKey, fetchFn);
    if (section === 'series') return fetchCollection('POPULAR_SERIES', apiKey, fetchFn);

    const today = new Date().toISOString().slice(0, 10);
    const isUpcoming = section === 'upcoming';
    const months = await Promise.all((isUpcoming ? [0, 1] : [-1, 0]).map(offset => fetchPremieres(offset, apiKey, fetchFn)));
    return months.flat()
        .filter(item => item.posterUrlPreview && item.releaseDate && (isUpcoming ? item.releaseDate > today : item.releaseDate <= today))
        .sort((a, b) => isUpcoming ? a.releaseDate!.localeCompare(b.releaseDate!) : b.releaseDate!.localeCompare(a.releaseDate!));
};
