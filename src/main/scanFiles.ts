import { app } from 'electron';
import { EventEmitter } from 'events';
import { Dirent, existsSync, readdirSync, readFileSync, statSync } from "fs";
import path, { join } from 'path';
import { MediaFileModel, RegexPatterns } from "../renderer/models/MediaFileModel";
import { getLibraryFolders } from "../renderer/stores/LibraryFoldersStore";
import { getRegexPatterns } from "../renderer/stores/RegexPatternsStore";
import { DEFAULT_REGEX_PATTERNS, LEGACY_REGEX_PATTERNS } from "../shared/constants/regexPatterns";
import { createJsonWriter } from "./jsonWriter";
import { parseMediaName } from "./mediaNameParser";

const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts'];

// Folder structure cache: a directory is re-read only when its mtime changes
// (NTFS updates a folder's mtime when entries are added, removed or renamed in it).
// It is also the only storage of the media file list (see getAllMediaFiles).
interface DirCacheEntry {
    mtimeMs: number;
    subDirs: string[];
    files: MediaFileModel[];
}

interface ScanCache {
    version: number;
    patternsKey: string;
    dirs: Record<string, DirCacheEntry>;
}

const SCAN_CACHE_VERSION = 1;
let scanCache: ScanCache | null = null;
// Files that appeared since the previous scan
let addedFiles: MediaFileModel[] = [];

// "changed" ({ added: MediaFileModel[] }) is emitted after a scan that updated the stored media list
export const scanEvents = new EventEmitter();

const getScanCachePath = () => join(app.getPath('userData'), 'scan-cache.json');

const loadScanCache = (): ScanCache => {
    if (scanCache) return scanCache;
    try {
        const p = getScanCachePath();
        if (existsSync(p)) {
            const data = JSON.parse(readFileSync(p, 'utf-8')) as ScanCache;
            if (data?.version === SCAN_CACHE_VERSION && data.dirs) {
                // JSON keeps dates as strings
                Object.values(data.dirs).forEach(entry => entry.files.forEach(file => {
                    file.modifiedDate = new Date(file.modifiedDate);
                    if (file.dateAdded) file.dateAdded = new Date(file.dateAdded);
                }));
                scanCache = data;
            }
        }
    } catch (error) {
        console.error('Error loading scan cache:', error);
    }
    if (!scanCache) {
        scanCache = { version: SCAN_CACHE_VERSION, patternsKey: '', dirs: {} };
    }
    return scanCache;
};

// While a series is downloading the cache changes every auto-scan tick, so writes are batched
const scanCacheWriter = createJsonWriter(getScanCachePath, () => scanCache, 3000);

const withTrailingSep = (p: string) => p.endsWith(path.sep) ? p : p + path.sep;

const isInsideFolder = (dir: string, root: string) => dir === root || dir.startsWith(withTrailingSep(root));

const createMediaFile = (fullPath: string, baseFolder: string, parentFolder: string, stats: { mtime: Date; size: number }, patterns: RegexPatterns, dateAdded?: Date): MediaFileModel => {
    const ext = path.extname(fullPath);
    const fileName = path.basename(fullPath, ext);
    const parsed = parseMediaName(fileName, parentFolder, patterns);

    return {
        id: fullPath,
        fileName: fileName,
        modifiedDate: stats.mtime,
        parsedName: parsed.parsedName,
        metadataId: parsed.parsedName.replace(/\s/g, '_'),
        folderPath: baseFolder,
        subFolder: parentFolder,
        fullPath: fullPath,
        type: parsed.type,
        year: parsed.year,
        season: parsed.season,
        episode: parsed.episode,
        resolution: parsed.resolution,
        quality: parsed.quality,
        fileSize: stats.size,
        dateAdded: dateAdded ?? new Date()
    };
};

const isDirectoryEntry = (entry: Dirent, fullPath: string): boolean => {
    if (entry.isDirectory()) return true;
    if (!entry.isSymbolicLink()) return false;
    try {
        return statSync(fullPath).isDirectory();
    } catch {
        return false;
    }
};

// Reads one directory (no recursion). Files known from the previous entry are not re-parsed.
const readDirectory = (dirPath: string, baseFolder: string, parentFolder: string, mtimeMs: number, patterns: RegexPatterns, previous: DirCacheEntry | undefined, reparse: boolean): DirCacheEntry => {
    const entry: DirCacheEntry = { mtimeMs, subDirs: [], files: [] };
    const previousFiles = new Map((previous?.files || []).map(f => [f.id, f]));

    for (const item of readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = join(dirPath, item.name);
        try {
            if (isDirectoryEntry(item, fullPath)) {
                entry.subDirs.push(item.name);
                continue;
            }
            if (!videoExtensions.includes(path.extname(item.name).toLowerCase())) continue;

            const stats = statSync(fullPath);
            if (!stats.isFile()) continue;

            const prev = previousFiles.get(fullPath);
            if (prev && !reparse) {
                entry.files.push({ ...prev, fileSize: stats.size, modifiedDate: stats.mtime });
            } else {
                const mediaFile = createMediaFile(fullPath, baseFolder, parentFolder, stats, patterns, prev?.dateAdded);
                entry.files.push(mediaFile);
                if (!prev) {
                    addedFiles.push(mediaFile);
                }
            }
        } catch (error) {
            console.error(`Error reading ${fullPath}:`, error);
        }
    }

    return entry;
};

// Walks a library folder. With force=false only directories whose mtime changed are re-read,
// the rest costs one stat() per directory. Returns true when something changed.
const scanLibraryFolder = (rootPath: string, patterns: RegexPatterns, force: boolean): boolean => {
    const cache = loadScanCache();
    const patternsKey = JSON.stringify(patterns);
    const reparse = cache.patternsKey !== patternsKey;

    const visited = new Set<string>();
    let changed = false;

    const walk = (dirPath: string, parentFolder: string) => {
        visited.add(dirPath);
        let entry = cache.dirs[dirPath];
        try {
            const mtimeMs = statSync(dirPath).mtimeMs;
            if (force || reparse || !entry || entry.mtimeMs !== mtimeMs) {
                entry = readDirectory(dirPath, rootPath, parentFolder, mtimeMs, patterns, entry, reparse);
                cache.dirs[dirPath] = entry;
                changed = true;
            }
        } catch (error) {
            console.error(`Error scanning directory ${dirPath}:`, error);
            return;
        }

        for (const sub of entry.subDirs) {
            walk(join(dirPath, sub), parentFolder ? `${parentFolder}/${sub}` : sub);
        }
    };

    walk(rootPath, '');

    // Drop entries of directories that no longer exist under this library folder
    for (const dir of Object.keys(cache.dirs)) {
        if (isInsideFolder(dir, rootPath) && !visited.has(dir)) {
            delete cache.dirs[dir];
            changed = true;
        }
    }

    if (changed) scanCacheWriter.schedule();
    return changed;
};

// Marks the cache as built with the given patterns (after all library folders were walked)
const commitPatterns = (patterns: RegexPatterns) => {
    const patternsKey = JSON.stringify(patterns);
    if (scanCache && scanCache.patternsKey !== patternsKey) {
        scanCache.patternsKey = patternsKey;
        scanCacheWriter.schedule();
    }
};

const emitChanged = () => {
    const added = addedFiles;
    addedFiles = [];
    scanEvents.emit('changed', { added });
};

// Full scan ("Scan" button): re-reads every directory, unchanged files are not re-parsed
export const scanMediaFile = () => {
    try {
        const libraryFolders = getLibraryFolders();
        const patterns = getPatterns();

        for (const folder of libraryFolders) {
            if (!existsSync(folder.path)) continue;
            scanLibraryFolder(folder.path, patterns, true);
        }

        // Forget folders that were removed from the library
        const cache = loadScanCache();
        for (const dir of Object.keys(cache.dirs)) {
            if (!libraryFolders.some(folder => isInsideFolder(dir, folder.path))) {
                delete cache.dirs[dir];
                scanCacheWriter.schedule();
            }
        }

        commitPatterns(patterns);
        emitChanged();
        return getAllMediaFiles();
    } catch (error) {
        console.error('Error scanning media files:', error);
        throw new Error('Unable to scan media files.');
    }
};

// Incremental scan (auto-scan): stats directories and re-reads only the changed ones.
// Returns true when the media list changed.
export const scanMediaFilesIncremental = (): boolean => {
    const patterns = getPatterns();
    let changed = false;

    for (const folder of getLibraryFolders()) {
        if (!existsSync(folder.path)) continue;
        if (scanLibraryFolder(folder.path, patterns, false)) {
            changed = true;
        }
    }

    commitPatterns(patterns);
    if (changed) emitChanged();
    return changed;
};

// Media files of the current library folders, as of the last scan.
// Folders that are temporarily unavailable (e.g. a disconnected drive) keep their files.
export const getAllMediaFiles = (): MediaFileModel[] => {
    const cache = loadScanCache();
    const libraryFolders = getLibraryFolders();
    return Object.entries(cache.dirs)
        .filter(([dir]) => libraryFolders.some(folder => isInsideFolder(dir, folder.path)))
        .flatMap(([, entry]) => entry.files);
};

// Stored values equal to a previous default are upgraded to the current default
export const getPatterns = (): RegexPatterns => {
    try {
        const patterns: RegexPatterns = { ...DEFAULT_REGEX_PATTERNS, ...getRegexPatterns() };
        for (const key of Object.keys(DEFAULT_REGEX_PATTERNS) as (keyof RegexPatterns)[]) {
            if (LEGACY_REGEX_PATTERNS.some(legacy => legacy[key] === patterns[key])) {
                patterns[key] = DEFAULT_REGEX_PATTERNS[key];
            }
        }
        return patterns;
    } catch (error) {
        console.error('Error loading regex patterns, using defaults:', error);
        return DEFAULT_REGEX_PATTERNS;
    }
};
