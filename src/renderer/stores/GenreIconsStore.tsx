import Store from 'electron-store';
import { GenreIcons } from '../models/GenreIcons';

const storeName = 'GenreIcons';
const store = new Store<{ GenreIcons: GenreIcons }>({ defaults: { GenreIcons: {} } });

export const getGenreIcons = (): GenreIcons => {
    return store.get(storeName, {});
};

export const setGenreIcons = (icons: GenreIcons): void => {
    store.set(storeName, icons);
};
