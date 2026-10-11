import type { ElectronAPI } from '../preload/preload';
import { isLanguage, Language, resolveLanguage } from '../shared/i18n';

// In a browser on the local network (the app served by main/webServer.ts) there is no preload:
// window.electron is replaced by the same API over HTTP. Actions on the host (settings, library
// folders, opening files) are not available there; the server refuses them anyway.

export const isWebClient = !window.electron;

// Identifies this tab to the server: its events, player transcode and subtitles.
// crypto.randomUUID needs a secure context (https), which a LAN address isn't.
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

// Media URL prefix, followed by the query (path=...)
export const MEDIA_URL_BASE = isWebClient ? `/media?client=${clientId}&` : 'media://local/?';

// Called when the server asks for the PIN (e.g. it was changed on the host)
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => { unauthorizedHandler = handler; };

// Poster URLs from the host point at its poster:// protocol
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

// --- Events: one EventSource per tab, fanned out like the preload's subscribe ---

const listeners = new Map<string, Set<(...args: any[]) => void>>();
let eventSource: EventSource | null = null;

// Started once authorized, so the server knows the tab before its player asks for subtitles
export const connectEvents = () => {
    if (eventSource) return;
    // Reconnects by itself after network errors
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

// The language is per browser
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
    getFilmPosters: (film) => call('metadata-posters', film),
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

    saveMetadata: (metadata, selectedMovie, customPoster) => call('save-metadata', metadata, selectedMovie, customPoster),
    loadMetadata: (metadataId) => call('load-metadata', metadataId),
    openFile: notAvailable,

    getAutoScan: () => Promise.resolve(false),
    // Videos can only be played in the browser
    getPlayerType: () => Promise.resolve('internal'),
    setPlayerType: () => Promise.resolve(),
    setAutoScan: notAvailable,
    getLanguage: async (): Promise<Language> => {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(saved)) return saved;
        // The host's language, or the browser's before the PIN is entered
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
    // Cues come as events
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
    // Tab and bookmark name; not in index.html, where it would replace the app window title (it has the version)
    document.title = 'Filmster';
}
