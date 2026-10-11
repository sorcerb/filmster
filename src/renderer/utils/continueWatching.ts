import { MediaFileModel } from '../models/MediaFileModel';
import { LibraryFileProgress } from '../models/WatchProgressModel';

export interface ContinueWatchingEntry {
    item: MediaFileModel;
    file: MediaFileModel;
    progress?: LibraryFileProgress;
    isNext: boolean;
    lastWatched: string;
}

// Seconds
const MIN_POSITION = 60;
const FINISHED_PERCENT = 0.95;
const MAX_ENTRIES = 20;

const isFinished = (progress: LibraryFileProgress) =>
    progress.isCompleted || (!!progress.duration && progress.position / progress.duration >= FINISHED_PERCENT);

const isWatched = (progress: LibraryFileProgress | undefined): progress is LibraryFileProgress =>
    !!progress && (isFinished(progress) || progress.position >= MIN_POSITION);

const getPlayOrder = (item: MediaFileModel): MediaFileModel[] => {
    if (!item.episodes?.length) return [item];
    if (item.groupId) return item.episodes;
    return [...item.episodes].sort((a, b) =>
        (a.season ?? 0) - (b.season ?? 0)
        || (a.episode ?? 0) - (b.episode ?? 0)
        || a.fullPath.localeCompare(b.fullPath));
};

export const getContinueWatching = (items: MediaFileModel[], progress: Record<string, LibraryFileProgress>): ContinueWatchingEntry[] => {
    const entries: ContinueWatchingEntry[] = [];

    for (const item of items) {
        const files = getPlayOrder(item);

        let latestIndex = -1;
        files.forEach((file, index) => {
            const fileProgress = progress[file.fullPath];
            if (isWatched(fileProgress) && (latestIndex < 0 || fileProgress.lastWatched > progress[files[latestIndex].fullPath].lastWatched)) {
                latestIndex = index;
            }
        });
        if (latestIndex < 0) continue;

        const latest = progress[files[latestIndex].fullPath];
        if (!isFinished(latest)) {
            entries.push({ item, file: files[latestIndex], progress: latest, isNext: false, lastWatched: latest.lastWatched });
        } else if (latestIndex + 1 < files.length) {
            const next = files[latestIndex + 1];
            const nextProgress = progress[next.fullPath];
            entries.push({
                item,
                file: next,
                progress: nextProgress && !isFinished(nextProgress) ? nextProgress : undefined,
                isNext: true,
                lastWatched: latest.lastWatched,
            });
        }
    }

    return entries
        .sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))
        .slice(0, MAX_ENTRIES);
};
