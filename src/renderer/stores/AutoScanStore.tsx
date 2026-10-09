import Store from 'electron-store';

const storeName = 'AutoScan';
const store = new Store<{ value: boolean }>({ defaults: { value: false } });

export const getAutoScan = (): boolean => {
    return store.get(storeName, false as boolean);
};

export const setAutoScan = (enabled: boolean): void => {
    store.set(storeName, enabled);
};
