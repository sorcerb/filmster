import { dialog, shell } from 'electron';
import { handle } from './rpc';
import { LibraryFolderModel } from '../renderer/models/LibraryFolderModel';
import { MediaFileModel } from '../renderer/models/MediaFileModel';
import { mainWindow } from './main';
import path from 'path';
import { getMediaFiles, getMediaFile } from '../renderer/stores/MediaFilesStore';
import { groupMediaFiles, renameMediaGroup, removeMediaGroup } from '../renderer/stores/MediaGroupsStore';
import { getLibraryFolders, addLibraryFolder, removeLibraryFolder } from '../renderer/stores/LibraryFoldersStore';
import { updateRegexPatterns } from '../renderer/stores/RegexPatternsStore';
import { RegexPatterns } from '../renderer/models/MediaFileModel';
import { MovieMetadata } from '../renderer/models/MediaMetadata';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { loadMetadata, saveMetadata, SaveMetadataResult } from '../renderer/stores/metadataService';
import { existsSync } from 'fs';
import { ApiSettings } from '../renderer/models/ApiSettings';
import { getApiSettings, updateApiSettings } from '../renderer/stores/ApiSettingsStore';
import { getPatterns, scanMediaFile } from './scanFiles';
import { findFilm, getDefaultMetadataProvider, searchFilms } from './metadataProviders';
import { MetadataProvider } from '../shared/metadataApi';
import { getAutoScan, setAutoScan } from '../renderer/stores/AutoScanStore';
import { getPlayerType, setPlayerType } from '../renderer/stores/PlayerSettingsStore';
import { PlayerType } from '../renderer/models/PlayerType';
import { getLanguage, setLanguage } from '../renderer/stores/LanguageStore';
import { getGenreIcons, setGenreIcons } from '../renderer/stores/GenreIconsStore';
import { GenreIcons } from '../renderer/models/GenreIcons';
import { Language, translate } from '../shared/i18n';
import { updateAutoScan } from './autoScan';
import { enqueueMissingMetadata } from './autoMetadata';
import { flushJsonWriters } from './jsonWriter';
import { WatchProgress } from '../renderer/models/WatchProgressModel';
import { saveWatchProgress, getWatchProgress, getAllWatchProgress } from '../renderer/stores/WatchProgressStore';
import { TrackPreference } from '../renderer/models/TrackPreference';
import { getTrackPreference, saveTrackPreference } from '../renderer/stores/TrackPreferencesStore';
import { readMpcHistory, MpcWatchEntry } from '../renderer/stores/MpcHistoryService';
import { loadDurationCache, getCachedDuration, setCachedDuration, saveDurationCache } from '../renderer/stores/DurationCacheStore';
import { getLibraryProgress } from './libraryProgress';
import { execFile } from 'child_process';
import { app } from 'electron';
const ffprobePath: string = app.isPackaged
    ? path.join(process.resourcesPath, 'ffprobe.exe')
    : path.join(__dirname, '../../bin/ffprobe.exe');

loadDurationCache();


handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: translate(getLanguage(), 'main.selectFolderTitle'),
        buttonLabel: translate(getLanguage(), 'main.selectFolderButton'),
        properties: ['openDirectory'],
    });

    return result.filePaths[0] || null;
});


handle('get-library-folders', () => getLibraryFolders());

handle('add-library-folder', (_client, newObj: LibraryFolderModel | string) => addLibraryFolder(newObj));

handle('remove-library-folder', (_client, path: string) => removeLibraryFolder(path));

handle('get-api-settings', () => getApiSettings());

handle('update-api-settings', (_client, settings: ApiSettings): void => {
    updateApiSettings(settings);
    enqueueMissingMetadata();
});

handle('get-default-metadata-provider', (): MetadataProvider => getDefaultMetadataProvider());

handle('metadata-search', (_client, provider: MetadataProvider, keyword: string): Promise<MovieSearchResult[]> =>
    searchFilms(provider, keyword));

handle('metadata-find-film', (_client, parsedName: string, year: number | undefined): Promise<MovieSearchResult | null> =>
    findFilm(parsedName, year));


handle('show-folder-in-explorer', async (_client, folderPath) => {
    try {
        if (folderPath && path.isAbsolute(folderPath)) {
            await shell.openPath(folderPath);
            return { success: true };
        } else {
            return { success: false, error: 'Invalid folder path' };
        }
    } catch (error) {
        console.error('Error opening folder in Explorer:', error);
        return { success: false, error: (error as Error)?.message };
    }
});

// Settings, scan cache, metadata and posters
handle('open-data-folder', async () => {
    flushJsonWriters();
    const error = await shell.openPath(app.getPath('userData'));
    return error ? { success: false, error } : { success: true };
});

handle('get-regex-patterns', (): RegexPatterns => getPatterns());

handle('update-regex-patterns', (_client, patterns: RegexPatterns): void => updateRegexPatterns(patterns));


handle('open-file', async (_client, filePath: string) => {
    try {
        if (filePath && existsSync(filePath)) {
            await shell.openPath(filePath);
            return { success: true };
        } else {
            return { success: false, error: 'File not found' };
        }
    } catch (error) {
        console.error('Error opening file:', error);
        return { success: false, error: String(error) };
    }
});

handle('scan-media-files', async () => scanMediaFile());

handle('get-auto-scan', () => getAutoScan());

handle('set-auto-scan', (_client, enabled: boolean) => {
    setAutoScan(enabled);
    updateAutoScan(enabled);
    return true;
});

handle('get-player-type', () => getPlayerType());

handle('set-player-type', (_client, type: PlayerType) => setPlayerType(type));

handle('get-language', () => getLanguage());

handle('set-language', (_client, language: Language) => setLanguage(language));

handle('get-genre-icons', () => getGenreIcons());

handle('set-genre-icons', (_client, icons: GenreIcons) => setGenreIcons(icons));

handle('get-media-files', async () => getMediaFiles());

handle('get-media-file', async (_client, id: string): Promise<MediaFileModel | null> => getMediaFile(id));

handle('group-media-files', (_client, targetIds: string[], sourceIds: string[]): void => groupMediaFiles(targetIds, sourceIds));

handle('rename-media-group', (_client, groupId: string, name: string): void => renameMediaGroup(groupId, name));

handle('remove-media-group', (_client, groupId: string): void => removeMediaGroup(groupId));

handle('save-metadata', async (_client, metadata: MovieMetadata, selectedMovie: MovieSearchResult | null): Promise<SaveMetadataResult> => saveMetadata(metadata, selectedMovie));

handle('load-metadata', async (_client, metadataId: string): Promise<MovieMetadata | null> => loadMetadata(metadataId));

handle('save-watch-progress', async (_client, filePath: string, progress: WatchProgress): Promise<void> => {
    saveWatchProgress(filePath, progress);
});

handle('get-watch-progress', async (_client, filePath: string): Promise<WatchProgress | undefined> => {
    return getWatchProgress(filePath);
});

handle('get-all-watch-progress', async (): Promise<Record<string, WatchProgress>> => {
    return getAllWatchProgress();
});

handle('get-track-preference', (_client, key: string): TrackPreference | undefined => getTrackPreference(key));

handle('save-track-preference', (_client, key: string, preference: TrackPreference): void => saveTrackPreference(key, preference));

handle('get-mpc-history', async (): Promise<Record<string, MpcWatchEntry>> => {
    return readMpcHistory();
});

handle('get-library-progress', (_client, player?: PlayerType) => getLibraryProgress(player));

handle('get-file-duration', async (_client, filePath: string): Promise<number | null> => {
    const cached = getCachedDuration(filePath);
    if (cached !== undefined) return cached;
    return new Promise((resolve) => {
        execFile(
            ffprobePath,
            ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
            { timeout: 8000, encoding: 'utf8' },
            (err, stdout) => {
                if (err) { resolve(null); return; }
                try {
                    const data = JSON.parse(stdout);
                    const sec = parseFloat(data.format?.duration || '0');
                    if (sec > 0) {
                        const ms = Math.round(sec * 1000);
                        setCachedDuration(filePath, ms);
                        saveDurationCache();
                        resolve(ms);
                    } else {
                        resolve(null);
                    }
                } catch { resolve(null); }
            }
        );
    });
});

