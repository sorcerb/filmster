import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { LibraryFileProgress } from '../models/WatchProgressModel';

const FINISHED_PERCENT = 0.95;
const MIN_STARTED_POSITION = 60;
const TOP_GENRES = 8;
const RECENT_COUNT = 10;

export interface RecentEntry {
    file: MediaFileModel;
    progress: LibraryFileProgress;
    isFinished: boolean;
    percent: number;
}

export interface ProfileStats {
    library: { movies: number; series: number; files: number; bytes: number };
    watchedMovies: number;
    watchedEpisodes: number;
    hoursTotal: number;
    hoursThisMonth: number;
    genres: { genre: string; count: number }[];
    recent: RecentEntry[];
}

const isFinished = (progress: LibraryFileProgress) =>
    progress.isCompleted || (!!progress.duration && progress.position / progress.duration >= FINISHED_PERCENT);

const getWatchedSeconds = (progress: LibraryFileProgress) =>
    isFinished(progress) ? (progress.duration ?? 0) : progress.position;

// Kinopoisk genres are lower case ("комедия")
const formatGenre = (genre: string) => {
    const trimmed = genre.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const getTitleKey = (file: MediaFileModel) =>
    file.type === MediaType.Series ? `series:${file.parsedName}` : `movie:${file.metadataId || file.id}`;

export const getProfileStats = (files: MediaFileModel[], progress: Record<string, LibraryFileProgress>, now = new Date()): ProfileStats => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const movieKeys = new Set<string>();
    const seriesKeys = new Set<string>();
    const watchedMovieKeys = new Set<string>();
    let watchedEpisodes = 0;
    let secondsTotal = 0;
    let secondsThisMonth = 0;
    const genreTitles = new Map<string, Set<string>>();
    const recent: RecentEntry[] = [];

    for (const file of files) {
        (file.type === MediaType.Series ? seriesKeys : movieKeys).add(getTitleKey(file));

        const fileProgress = progress[file.fullPath];
        if (!fileProgress) continue;

        const finished = isFinished(fileProgress);
        if (finished) {
            if (file.type === MediaType.Series) watchedEpisodes++;
            else watchedMovieKeys.add(getTitleKey(file));
        }

        const seconds = getWatchedSeconds(fileProgress);
        secondsTotal += seconds;
        if (fileProgress.lastWatched >= monthStart) secondsThisMonth += seconds;

        if (finished || fileProgress.position >= MIN_STARTED_POSITION) {
            for (const genre of file.metadata?.genres ?? []) {
                const name = formatGenre(genre);
                if (!name) continue;
                if (!genreTitles.has(name)) genreTitles.set(name, new Set());
                genreTitles.get(name)!.add(getTitleKey(file));
            }
            recent.push({
                file,
                progress: fileProgress,
                isFinished: finished,
                percent: fileProgress.duration ? Math.min(100, Math.round(fileProgress.position / fileProgress.duration * 100)) : 0,
            });
        }
    }

    return {
        library: {
            movies: movieKeys.size,
            series: seriesKeys.size,
            files: files.length,
            bytes: files.reduce((sum, file) => sum + (file.fileSize ?? 0), 0),
        },
        watchedMovies: watchedMovieKeys.size,
        watchedEpisodes,
        hoursTotal: secondsTotal / 3600,
        hoursThisMonth: secondsThisMonth / 3600,
        genres: Array.from(genreTitles, ([genre, titles]) => ({ genre, count: titles.size }))
            .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
            .slice(0, TOP_GENRES),
        recent: recent
            .sort((a, b) => b.progress.lastWatched.localeCompare(a.progress.lastWatched))
            .slice(0, RECENT_COUNT),
    };
};
