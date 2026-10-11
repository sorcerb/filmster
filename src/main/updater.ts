import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getAutoUpdate } from '../renderer/stores/AutoUpdateStore';
import { broadcast } from './rpc';

export type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';

export interface UpdateStatus {
    state: UpdateState;
    currentVersion: string;
    version?: string;
    percent?: number;
    error?: string;
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', currentVersion: app.getVersion() };
let checkInterval: NodeJS.Timeout | null = null;

const setStatus = (next: Partial<UpdateStatus>) => {
    status = { ...status, ...next };
    broadcast('update-status', status);
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', error: undefined }));
autoUpdater.on('update-not-available', () => setStatus({ state: 'latest' }));
autoUpdater.on('update-available', info => {
    setStatus({ state: 'available', version: info.version });
    if (getAutoUpdate()) downloadUpdate();
});
autoUpdater.on('download-progress', progress => setStatus({ state: 'downloading', percent: Math.floor(progress.percent) }));
autoUpdater.on('update-downloaded', info => setStatus({ state: 'downloaded', version: info.version }));
autoUpdater.on('error', error => setStatus({ state: 'error', error: error.message }));

export const getUpdateStatus = (): UpdateStatus => status;

export const checkForUpdates = async (): Promise<UpdateStatus> => {
    // Busy or already found: a new check would only reset the state
    if (status.state === 'unsupported' || status.state === 'checking' || status.state === 'downloading' || status.state === 'downloaded') return status;
    try {
        await autoUpdater.checkForUpdates();
    } catch {
        // Reported by the 'error' event
    }
    return status;
};

export const downloadUpdate = async (): Promise<void> => {
    if (status.state !== 'available' && status.state !== 'error') return;
    if (!status.version) return;
    setStatus({ state: 'downloading', percent: 0, error: undefined });
    try {
        await autoUpdater.downloadUpdate();
    } catch {
        // Reported by the 'error' event
    }
};

export const installUpdate = () => {
    if (status.state === 'downloaded') autoUpdater.quitAndInstall(true, true);
};

export const updateAutoUpdate = (enabled: boolean) => {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    if (!enabled || !app.isPackaged) return;

    checkForUpdates();
    checkInterval = setInterval(checkForUpdates, CHECK_INTERVAL_MS);
    checkInterval.unref();
};

export const initAutoUpdate = () => updateAutoUpdate(getAutoUpdate());
