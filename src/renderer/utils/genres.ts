// The genre buttons' counts and the filtering use the same normalization, so a button's count
// is the number of cards it shows.

const CARTOON_GENRES = ['мультфильм', 'мультик', 'анимация', 'детский', 'детская', 'для детей'];

const CARTOON_GENRE = 'Мультфильм';

export const normalizeGenre = (genre: string): string | null => {
    const trimmed = genre.trim();
    if (!trimmed) return null;
    if (CARTOON_GENRES.includes(trimmed.toLowerCase())) return CARTOON_GENRE;
    // Kinopoisk names are lower case ("комедия"); TMDB ones keep their casing ("Sci-Fi & Fantasy")
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export const getItemGenres = (genres: string[] | undefined): string[] =>
    Array.from(new Set((genres ?? []).map(normalizeGenre).filter((genre): genre is string => !!genre)));
