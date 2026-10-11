import type { ElectronAPI } from '../preload/preload';
import { isLanguage, Language, resolveLanguage } from '../shared/i18n';

export const isWebClient = !window.electron;

// crypto.randomUUID needs a secure context (https), which a LAN address isn't.
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

export const MEDIA_URL_BASE = isWebClient ? `/media?client=${clientId}&` : 'media://local/?';

let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => { unauthorizedHandler = handler; };

const POSTER_PREFIX = 'poster://local/';
const reviveJson = (_key: string, value: unknown) =>
    typeof value === 'string' && value.startsWith(POSTER_PREFIX) ? `/poster/${value.slice(POSTER_PREFIX.length)}` : value;

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const data = JSON.parse(await response.text(), reviveJson);
    if (response.status === 401) {
        unauthorizedHandler?.();
    }
    if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
    return data.result as T;
};

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => request<T>(`/api/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId },
    body: JSON.stringify(args),
});

export const getAuthState = () => request<{ required: boolean; authorized: boolean }>('/api/auth');

export const login = (pin: string) => request<boolean>('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([pin]),
});

const listeners = new Map<string, Set<(...args: any[]) => void>>();
let eventSource: EventSource | null = null;

// Started once authorized, so the server knows the tab before its player asks for subtitles
export const connectEvents = () => {
    if (eventSource) return;
    eventSource = new EventSource(`/api/events?client=${clientId}`);
    eventSource.onmessage = (event) => {
        const { channel, args } = JSON.parse(event.data, reviveJson);
        listeners.get(channel)?.forEach(callback => callback(...args));
    };
};

const subscribe = <T extends unknown[]>(channel: string) => (callback: (...args: T) => void) => {
    connectEvents();
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(callback as (...args: any[]) => void);
    return () => { listeners.get(channel)?.delete(callback as (...args: any[]) => void); };
};

const notAvailable = (): Promise<never> => Promise.reject(new Error('Not available over the network'));

const LANGUAGE_STORAGE_KEY = 'language';

const webApi: ElectronAPI = {
    selectFolder: notAvailable,
    openFolder: () => undefined,
    scanFolder: notAvailable,

    getLibraryFolders: () => Promise.resolve([]),
    addLibraryFolder: notAvailable,
    removeLibraryFolder: notAvailable,

    getApiSettings: notAvailable,
    updateApiSettings: notAvailable,
    getMetadataProviders: () => call('get-metadata-providers'),
    getFilmImages: (film) => call('metadata-images', film),
    loadMissingDetails: (metadataId) => call('metadata-load-missing', metadataId),
    getFilmCredits: (film) => call('metadata-credits', film),
    searchMetadata: (provider, keyword) => call('metadata-search', provider, keyword),
    findMetadataFilm: (parsedName, year) => call('metadata-find-film', parsedName, year),
    getFilmDetails: (film) => call('metadata-film-details', film),
    getNews: (provider, section) => call('metadata-news', provider, section),

    showFolderInExplorer: notAvailable,
    openDataFolder: notAvailable,

    scanMediaFiles: () => call('scan-media-files'),
    getMediaFiles: () => call('get-media-files'),
    getMediaFile: (id) => call('get-media-file', id),
    groupMediaFiles: (targetIds, sourceIds) => call('group-media-files', targetIds, sourceIds),
    renameMediaGroup: (groupId, name) => call('rename-media-group', groupId, name),
    removeMediaGroup: (groupId) => call('remove-media-group', groupId),
    onMediaFilesChanged: subscribe<[]>('media-files-changed'),
    onMetadataUpdated: subscribe<[metadataId: string]>('metadata-updated'),

    getRegexPatterns: notAvailable,
    updateRegexPatterns: notAvailable,

    saveMetadata: (metadata, selectedMovie, customPoster, backdrop) => call('save-metadata', metadata, selectedMovie, customPoster, backdrop),
    loadMetadata: (metadataId) => call('load-metadata', metadataId),
    openFile: notAvailable,

    getAutoScan: () => Promise.resolve(false),
    getPlayerType: () => Promise.resolve('internal'),
    setPlayerType: () => Promise.resolve(),
    setAutoScan: notAvailable,
    getLanguage: async (): Promise<Language> => {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(saved)) return saved;
        return call<Language>('get-language').catch(() => resolveLanguage(navigator.language));
    },
    setLanguage: async (language) => { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); },
    getGenreIcons: () => call('get-genre-icons'),
    setGenreIcons: notAvailable,
    getCustomLinks: () => call('get-custom-links'),
    setCustomLinks: notAvailable,
    onConvertToCyrillic: () => undefined,
    removeConvertListener: () => undefined,

    saveWatchProgress: (filePath, progress) => call('save-watch-progress', filePath, progress),
    getWatchProgress: (filePath) => call('get-watch-progress', filePath),
    getAllWatchProgress: () => call('get-all-watch-progress'),
    getTrackPreference: (key) => call('get-track-preference', key),
    saveTrackPreference: (key, preference) => call('save-track-preference', key, preference),
    getMpcHistory: () => Promise.resolve({}),
    getLibraryProgress: (player) => call('get-library-progress', player),
    getFileDuration: (filePath) => call('get-file-duration', filePath),
    getMediaInfo: (filePath) => call('get-media-info', filePath),
    getKeyframes: (filePath, time) => call('get-keyframes', filePath, time),
    stopTranscode: () => call('stop-transcode'),
    getEpisodeMarkers: (filePath) => call('get-episode-markers', filePath),
    onEpisodeMarkersUpdated: subscribe('episode-markers-updated'),
    getAutoSkipIntro: (seriesName) => call('get-auto-skip-intro', seriesName),
    setAutoSkipIntro: (seriesName, enabled) => call('set-auto-skip-intro', seriesName, enabled),
    getAutoSkipIntroDefault: notAvailable,
    setAutoSkipIntroDefault: notAvailable,
    startSubtitles: (subtitleRequest) => call('start-subtitles', subtitleRequest),
    stopSubtitles: (id) => call('stop-subtitles', id),
    onSubtitleCues: subscribe('subtitle-cues'),
    onSubtitleEnd: subscribe('subtitle-end'),

    getWebServerStatus: notAvailable,
    setWebServerSettings: notAvailable,

    getAutoUpdate: notAvailable,
    setAutoUpdate: notAvailable,
    getUpdateStatus: notAvailable,
    checkForUpdates: notAvailable,
    downloadUpdate: notAvailable,
    installUpdate: notAvailable,
    onUpdateStatus: () => () => undefined,
};

if (isWebClient) {
    window.electron = webApi;
    // Not in index.html: there it would replace the app window title (which has the version)
    document.title = 'Filmster';
}
