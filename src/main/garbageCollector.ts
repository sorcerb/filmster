import Store from 'electron-store';
import path from 'path';
import { getMetadataIdOfFile, listMetadataFiles, removeMetadataFile } from '../renderer/stores/metadataService';
import { pruneDurationCache } from '../renderer/stores/DurationCacheStore';
import { pruneEpisodeMarkers } from './episodeMarkers';
import { getAllMediaFiles, scanEvents } from './scanFiles';

// Removes what was saved for files that left the library: metadata, posters and backdrops of titles no file uses any more,
// durations and episode markers of files that are gone. Runs on startup and after scans that changed something.
// Metadata is kept for a week after it became unused: a library folder removed by mistake or renamed files
// get their posters and hand-made corrections back when they return.

const METADATA_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;
const AFTER_SCAN_DELAY_MS = 10 * 1000;

// Lower-cased metadata file name -> when it was first seen unused
const store = new Store<{ unusedSince: Record<string, number> }>({
    name: 'GarbageCollector',
    defaults: {
        unusedSince: {}
    }
});

const collectGarbage = () => {
    const files = getAllMediaFiles();
    // Nothing scanned (yet): no way to tell what is unused
    if (!files.length) return;

    const usedIds = new Set(files.map(file => file.metadataId.toLowerCase()));
    const isUsed = (name: string) => usedIds.has(name) || usedIds.has(getMetadataIdOfFile(name));

    const now = Date.now();
    const unusedSince = store.get('unusedSince');
    const stillKept: Record<string, number> = {};
    for (const fileName of listMetadataFiles()) {
        const name = path.basename(fileName, path.extname(fileName)).toLowerCase();
        if (isUsed(name)) continue;
        const key = fileName.toLowerCase();
        const since = unusedSince[key] ?? now;
        if (now - since < METADATA_KEEP_MS) {
            stillKept[key] = since;
            continue;
        }
        try {
            removeMetadataFile(fileName);
        } catch (error) {
            console.error(`Error removing ${fileName}:`, error);
            stillKept[key] = since;
        }
    }
    store.set('unusedSince', stillKept);

    const libraryPaths = new Set(files.map(file => file.fullPath));
    pruneDurationCache(libraryPaths);
    pruneEpisodeMarkers(libraryPaths);
};

let timer: NodeJS.Timeout | null = null;

const scheduleGarbageCollection = (delayMs: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        try {
            collectGarbage();
        } catch (error) {
            console.error('Error collecting garbage:', error);
        }
    }, delayMs);
};

export const initGarbageCollector = () => {
    scheduleGarbageCollection(STARTUP_DELAY_MS);
    scanEvents.on('changed', () => scheduleGarbageCollection(AFTER_SCAN_DELAY_MS));
};
