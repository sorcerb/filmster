import Store from 'electron-store';
import { PlayerType } from '../models/PlayerType';

const storeName = 'PlayerType';
const store = new Store<{ PlayerType: PlayerType }>({ defaults: { PlayerType: 'external' } });

export const getPlayerType = (): PlayerType => {
    return store.get(storeName, 'external');
};

export const setPlayerType = (type: PlayerType): void => {
    store.set(storeName, type);
};
