import { existsSync, readFileSync } from 'fs';
import { app } from 'electron';
import path from 'path';
import { createJsonWriter } from '../../main/jsonWriter';

let cachePath: string | null = null;
let _cache: Record<string, number> = {};

const getCachePath = (): string => {
    if (!cachePath) {
        cachePath = path.join(app.getPath('userData'), 'duration-cache.json');
    }
    return cachePath;
};

export const loadDurationCache = (): void => {
    try {
        const p = getCachePath();
        if (existsSync(p)) {
            _cache = JSON.parse(readFileSync(p, 'utf-8'));
        }
    } catch {
        _cache = {};
    }
};

// Opening a series asks for many durations in a row: save them in one write
const writer = createJsonWriter(getCachePath, () => _cache, 2000);

export const saveDurationCache = (): void => {
    writer.schedule();
};

export const getCachedDuration = (filePath: string): number | undefined => {
    return _cache[filePath];
};

export const setCachedDuration = (filePath: string, duration: number): void => {
    _cache[filePath] = duration;
};

export const getDurationCache = (): Record<string, number> => _cache;
