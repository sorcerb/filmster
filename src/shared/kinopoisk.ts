import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { latinToCyrillic } from '../renderer/utils/transliteration';
import { Person } from '../renderer/models/MediaMetadata';
import { CAST_LIMIT, FetchFn, FilmCredits, FilmImages, MetadataApiError, NewsItem, NewsSection, PosterImage } from './metadataApi';

const SEARCH_URL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
const FILM_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
const COLLECTIONS_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/collections';
const PREMIERES_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/premieres';
const STAFF_URL = 'https://kinopoiskapiunofficial.tech/api/v1/staff';

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
        backdropUrl: film.coverUrl || undefined,
    };
};

export const searchKinopoiskFilms = async (keyword: string, apiKey: string, fetchFn: FetchFn): Promise<MovieSearchResult[]> => {
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

// First page only: each page is a request out of the key's daily quota
const fetchImagesOfType = async (filmId: number, type: 'POSTER' | 'WALLPAPER', apiKey: string, fetchFn: FetchFn): Promise<PosterImage[]> => {
    const response = await fetchFn(`${FILM_URL}/${filmId}/images?type=${type}&page=1`, {
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

export const fetchKinopoiskImages = async (film: MovieSearchResult, apiKey: string, fetchFn: FetchFn): Promise<FilmImages> => {
    const [posters, backdrops] = await Promise.all([
        fetchImagesOfType(film.filmId, 'POSTER', apiKey, fetchFn),
        fetchKinopoiskBackdrops(film, apiKey, fetchFn, false),
    ]);
    return { posters, backdrops };
};

export const fetchKinopoiskBackdrops = async (film: MovieSearchResult, apiKey: string, fetchFn: FetchFn, firstOnly: boolean): Promise<PosterImage[]> => {
    const fetchCover = () => film.backdropUrl
        ? Promise.resolve(film.backdropUrl)
        : fetchFilmById(String(film.filmId), apiKey, fetchFn).then(details => details?.backdropUrl, () => undefined);
    const fetchWallpapers = () => fetchImagesOfType(film.filmId, 'WALLPAPER', apiKey, fetchFn).catch(() => [] as PosterImage[]);

    const [coverUrl, wallpapers] = firstOnly
        ? await fetchCover().then(async url => [url, url ? [] : await fetchWallpapers()] as const)
        : await Promise.all([fetchCover(), fetchWallpapers()]);
    const cover: PosterImage[] = coverUrl ? [{ url: coverUrl, previewUrl: coverUrl }] : [];
    return [...cover, ...wallpapers.filter(wallpaper => wallpaper.url !== coverUrl)];
};

// The staff list is in billing order
export const fetchKinopoiskCredits = async (filmId: number, apiKey: string, fetchFn: FetchFn): Promise<FilmCredits> => {
    const staff: any[] = await requestJson(`${STAFF_URL}?filmId=${filmId}`, apiKey, fetchFn);
    const toPerson = (person: any, role: Person['role']): Person => ({
        id: String(person.staffId),
        name: person.nameRu || person.nameEn,
        role,
        character: person.description || undefined,
        photoUrl: person.posterUrl || undefined,
        profileUrl: `https://www.kinopoisk.ru/name/${person.staffId}/`,
    });
    const withName = (person: any) => person.nameRu || person.nameEn;
    return {
        directors: staff.filter(person => person.professionKey === 'DIRECTOR' && withName(person)).map(person => toPerson(person, 'director')),
        actors: staff.filter(person => person.professionKey === 'ACTOR' && withName(person)).slice(0, CAST_LIMIT).map(person => toPerson(person, 'actor')),
    };
};

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
    backdropUrl: film.coverUrl || undefined,
    releaseDate: film.premiereRu || undefined,
});

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

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
