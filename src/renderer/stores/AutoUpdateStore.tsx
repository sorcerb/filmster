import Store from 'electron-store';

const storeName = 'AutoUpdate';
const store = new Store<{ AutoUpdate: boolean }>({ defaults: { AutoUpdate: true } });

export const getAutoUpdate = (): boolean => {
    return store.get(storeName, true as boolean);
};

export const setAutoUpdate = (enabled: boolean): void => {
    store.set(storeName, enabled);
};
