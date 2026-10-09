import Store from 'electron-store';
import { ApiSettings } from '../models/ApiSettings';

const storeName = 'ApiSettings';
const store = new Store<{ data: ApiSettings }>({ defaults: { data: {} as ApiSettings } });

export const getApiSettings = (): ApiSettings => {
    return store.get(storeName, {} as ApiSettings);
};

export const updateApiSettings = (settings: ApiSettings): void => {
    store.set(storeName, settings);
};

