// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import { LibraryFolderModel } from '../renderer/models/LibraryFolderModel';
import { MediaFileModel, RegexPatterns } from '../renderer/models/MediaFileModel';
import { MovieSearchResult } from '../renderer/models/MovieSearchResult';
import { MovieMetadata } from '../renderer/models/MediaMetadata';
import { ApiSettings } from '../renderer/models/ApiSettings';
import type { MetadataProvider } from '../shared/metadataApi';
import { LibraryFileProgress, WatchProgress } from '../renderer/models/WatchProgressModel';
import { MpcWatchEntry } from '../renderer/stores/MpcHistoryService';
import { MediaInfo, SubtitleCue, SubtitleRequest } from '../renderer/models/MediaInfo';
import { PlayerType } from '../renderer/models/PlayerType';
import { TrackPreference } from '../renderer/models/TrackPreference';
import { EpisodeMarkers } from '../renderer/models/EpisodeMarkers';
import { GenreIcons } from '../renderer/models/GenreIcons';
import { Language } from '../shared/i18n';
import type { WebServerSettings } from '../renderer/stores/WebServerStore';
import type { WebServerStatus } from '../main/webServer';
import type { UpdateStatus } from '../main/updater';

// One ipcRenderer listener per channel, fanned out to subscribers (every poster card subscribes)
const subscribe = <T extends unknown[]>(channel: string) => {
  const callbacks = new Set<(...args: T) => void>();
  ipcRenderer.on(channel, (_event, ...args) => callbacks.forEach(cb => cb(...(args as T))));
  return (callback: (...args: T) => void) => {
    callbacks.add(callback);
    return () => { callbacks.delete(callback); };
  };
};

const api = {
  selectFolder: async (): Promise<string | null> => ipcRenderer.invoke('dialog:select-folder'),
  openFolder: (folderPath: string) => ipcRenderer.send('open-folder', folderPath),
  scanFolder: async (folderPath: string): Promise<{ files: MediaFileModel[], error?: string }> => ipcRenderer.invoke('scan-folder', folderPath),

  getLibraryFolders: (): Promise<LibraryFolderModel[]> => ipcRenderer.invoke('get-library-folders'),
  addLibraryFolder: (folderPath: string): Promise<void> => ipcRenderer.invoke('add-library-folder', folderPath),
  removeLibraryFolder: (folderPath: string): Promise<void> => ipcRenderer.invoke('remove-library-folder', folderPath),

  getApiSettings: (): Promise<ApiSettings> => ipcRenderer.invoke('get-api-settings'),
  updateApiSettings: (settings: ApiSettings): Promise<void> => ipcRenderer.invoke('update-api-settings', settings),
  getDefaultMetadataProvider: (): Promise<MetadataProvider> => ipcRenderer.invoke('get-default-metadata-provider'),
  searchMetadata: (provider: MetadataProvider, keyword: string): Promise<MovieSearchResult[]> => ipcRenderer.invoke('metadata-search', provider, keyword),
  findMetadataFilm: (parsedName: string, year: number | undefined): Promise<MovieSearchResult | null> => ipcRenderer.invoke('metadata-find-film', parsedName, year),

  showFolderInExplorer: async (folderPath: string) => ipcRenderer.invoke('show-folder-in-explorer', folderPath),
  openDataFolder: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('open-data-folder'),

  scanMediaFiles: (): Promise<MediaFileModel[]> => ipcRenderer.invoke('scan-media-files'),
  getMediaFiles: (): Promise<MediaFileModel[]> => ipcRenderer.invoke('get-media-files'),
  getMediaFile: (id: string): Promise<MediaFileModel | null> => ipcRenderer.invoke('get-media-file', id),
  groupMediaFiles: (targetIds: string[], sourceIds: string[]): Promise<void> => ipcRenderer.invoke('group-media-files', targetIds, sourceIds),
  renameMediaGroup: (groupId: string, name: string): Promise<void> => ipcRenderer.invoke('rename-media-group', groupId, name),
  removeMediaGroup: (groupId: string): Promise<void> => ipcRenderer.invoke('remove-media-group', groupId),
  onMediaFilesChanged: subscribe<[]>('media-files-changed'),
  onMetadataUpdated: subscribe<[metadataId: string]>('metadata-updated'),

  getRegexPatterns: (): Promise<RegexPatterns> => ipcRenderer.invoke('get-regex-patterns'),
  updateRegexPatterns: (patterns: RegexPatterns): Promise<void> => ipcRenderer.invoke('update-regex-patterns', patterns),

  saveMetadata: (metadata: MovieMetadata, selectedMovie: MovieSearchResult | null): Promise<{ metadataPath: string; posterPaths: string[]; posterError?: string }> => ipcRenderer.invoke('save-metadata', metadata, selectedMovie),
  loadMetadata: (metadataId: string): Promise<MovieMetadata | null> => ipcRenderer.invoke('load-metadata', metadataId),
  openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('open-file', filePath),

  getAutoScan: (): Promise<boolean> => ipcRenderer.invoke('get-auto-scan'),
  getPlayerType: (): Promise<PlayerType> => ipcRenderer.invoke('get-player-type'),
  setPlayerType: (type: PlayerType): Promise<void> => ipcRenderer.invoke('set-player-type', type),
  setAutoScan: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-auto-scan', enabled),
  getLanguage: (): Promise<Language> => ipcRenderer.invoke('get-language'),
  setLanguage: (language: Language): Promise<void> => ipcRenderer.invoke('set-language', language),
  getGenreIcons: (): Promise<GenreIcons> => ipcRenderer.invoke('get-genre-icons'),
  setGenreIcons: (icons: GenreIcons): Promise<void> => ipcRenderer.invoke('set-genre-icons', icons),
  onConvertToCyrillic: (callback: (text: string) => void) => {
    ipcRenderer.on('convert-selection', (_event, text) => callback(text));
  },
  removeConvertListener: () => {
    ipcRenderer.removeAllListeners('convert-selection');
  },

  saveWatchProgress: (filePath: string, progress: WatchProgress): Promise<void> => ipcRenderer.invoke('save-watch-progress', filePath, progress),
  getWatchProgress: (filePath: string): Promise<WatchProgress | undefined> => ipcRenderer.invoke('get-watch-progress', filePath),
  getAllWatchProgress: (): Promise<Record<string, WatchProgress>> => ipcRenderer.invoke('get-all-watch-progress'),
  getTrackPreference: (key: string): Promise<TrackPreference | undefined> => ipcRenderer.invoke('get-track-preference', key),
  saveTrackPreference: (key: string, preference: TrackPreference): Promise<void> => ipcRenderer.invoke('save-track-preference', key, preference),
  getMpcHistory: (): Promise<Record<string, MpcWatchEntry>> => ipcRenderer.invoke('get-mpc-history'),
  getLibraryProgress: (player?: PlayerType): Promise<Record<string, LibraryFileProgress>> => ipcRenderer.invoke('get-library-progress', player),
  getFileDuration: (filePath: string): Promise<number | null> => ipcRenderer.invoke('get-file-duration', filePath),
  getMediaInfo: (filePath: string): Promise<MediaInfo | null> => ipcRenderer.invoke('get-media-info', filePath),
  getKeyframes: (filePath: string, time: number): Promise<number[]> => ipcRenderer.invoke('get-keyframes', filePath, time),
  stopTranscode: (): Promise<void> => ipcRenderer.invoke('stop-transcode'),
  getEpisodeMarkers: (filePath: string): Promise<EpisodeMarkers | null> => ipcRenderer.invoke('get-episode-markers', filePath),
  onEpisodeMarkersUpdated: subscribe<[filePath: string, markers: EpisodeMarkers]>('episode-markers-updated'),
  getAutoSkipIntro: (seriesName: string): Promise<boolean> => ipcRenderer.invoke('get-auto-skip-intro', seriesName),
  setAutoSkipIntro: (seriesName: string, enabled: boolean): Promise<void> => ipcRenderer.invoke('set-auto-skip-intro', seriesName, enabled),
  getAutoSkipIntroDefault: (): Promise<boolean> => ipcRenderer.invoke('get-auto-skip-intro-default'),
  setAutoSkipIntroDefault: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-auto-skip-intro-default', enabled),
  startSubtitles: (request: SubtitleRequest): Promise<void> => ipcRenderer.invoke('start-subtitles', request),
  stopSubtitles: (id: number): Promise<void> => ipcRenderer.invoke('stop-subtitles', id),
  onSubtitleCues: subscribe<[id: number, cues: SubtitleCue[]]>('subtitle-cues'),
  onSubtitleEnd: subscribe<[id: number, reachedUntil: boolean]>('subtitle-end'),

  getWebServerStatus: (): Promise<WebServerStatus> => ipcRenderer.invoke('get-web-server-status'),
  setWebServerSettings: (settings: WebServerSettings): Promise<WebServerStatus> => ipcRenderer.invoke('set-web-server-settings', settings),

  getAutoUpdate: (): Promise<boolean> => ipcRenderer.invoke('get-auto-update'),
  setAutoUpdate: (enabled: boolean): Promise<void> => ipcRenderer.invoke('set-auto-update', enabled),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  onUpdateStatus: subscribe<[status: UpdateStatus]>('update-status'),
}

contextBridge.exposeInMainWorld('electron', api);
export type ElectronAPI = typeof api & {
  onConvertToCyrillic: (callback: (text: string) => void) => void;
  removeConvertListener: () => void;
};