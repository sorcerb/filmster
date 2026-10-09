import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { latinToCyrillic } from '../renderer/utils/transliteration';
import { FetchFn, MetadataApiError } from './metadataApi';

const SEARCH_URL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
const FILM_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';

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
