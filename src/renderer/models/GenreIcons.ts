// Icons shown before and after a genre's button on the home page, by genre display name
// (see utils/genres.ts). Values are icon ids from utils/genreIcons.ts.
export type GenreIconPair = {
    start?: string
    end?: string
}

export type GenreIcons = Record<string, GenreIconPair>;
