import Store from 'electron-store';
import { WatchProgress } from '../models/WatchProgressModel';

const storeName = 'WatchProgress';

const store = new Store<{ data: Record<string, WatchProgress> }>({
    name: storeName,
    defaults: {
        data: {}
    }
});

export const saveWatchProgress = (filePath: string, progress: Omit<WatchProgress, 'filePath'>): void => {
    const data = store.get('data');
    data[filePath] = { filePath, ...progress };
    store.set('data', data);
};

export const getWatchProgress = (filePath: string): WatchProgress | undefined => {
    const data = store.get('data');
    return data[filePath];
};

export const getAllWatchProgress = (): Record<string, WatchProgress> => {
    return store.get('data');
};

export const markAsCompleted = (filePath: string): void => {
    const data = store.get('data');
    if (data[filePath]) {
        data[filePath].isCompleted = true;
        data[filePath].percentage = 100;
        store.set('data', data);
    }
};

export const clearWatchProgress = (filePaths: string[]): void => {
    const data = store.get('data');
    filePaths.forEach(filePath => delete data[filePath]);
    store.set('data', data);
};
