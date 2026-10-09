import { getAllMediaFiles } from './scanFiles';
import { getAllWatchProgress } from '../renderer/stores/WatchProgressStore';
import { readMpcHistory } from '../renderer/stores/MpcHistoryService';
import { getCachedDuration } from '../renderer/stores/DurationCacheStore';
import { LibraryFileProgress } from '../renderer/models/WatchProgressModel';
import { PlayerType } from '../renderer/models/PlayerType';

const getFileName = (filePath: string) => filePath.split('\\').pop()?.toLowerCase() || '';

// Progress of every library file that was played, keyed by full path. Without `player` both players count:
// the built-in player's progress and MPC-HC history; the more recent one wins.
export const getLibraryProgress = async (player?: PlayerType): Promise<Record<string, LibraryFileProgress>> => {
    const internal = player === 'external' ? {} : getAllWatchProgress();
    // MPC history paths may differ (mapped drive vs UNC), so match by file name
    const mpcHistory = player === 'internal' ? {} : await readMpcHistory();
    const mpcByName = new Map(Object.values(mpcHistory).map(entry => [getFileName(entry.filename), entry]));

    const result: Record<string, LibraryFileProgress> = {};
    for (const file of getAllMediaFiles()) {
        const candidates: LibraryFileProgress[] = [];

        const watched = internal[file.fullPath];
        if (watched?.lastWatched) {
            candidates.push({
                position: watched.lastPosition,
                duration: watched.totalDuration || undefined,
                lastWatched: watched.lastWatched,
                isCompleted: watched.isCompleted,
            });
        }

        const mpc = mpcByName.get(getFileName(file.fullPath));
        if (mpc?.lastOpened) {
            const durationMs = getCachedDuration(file.fullPath);
            candidates.push({
                position: mpc.filePosition / 1000,
                duration: durationMs ? durationMs / 1000 : undefined,
                lastWatched: mpc.lastOpened,
                // MPC-HC resets the position when a file is played to the end
                isCompleted: mpc.filePosition === 0,
            });
        }

        // ISO dates compare as strings
        const latest = candidates.sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))[0];
        if (latest) result[file.fullPath] = latest;
    }
    return result;
};
