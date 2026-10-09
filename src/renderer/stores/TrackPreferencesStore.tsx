import Store from 'electron-store';
import { TrackPreference } from '../models/TrackPreference';

const storeName = 'TrackPreferences';

const store = new Store<{ data: Record<string, TrackPreference> }>({
    name: storeName,
    defaults: {
        data: {}
    }
});

export const getTrackPreference = (key: string): TrackPreference | undefined => {
    return store.get('data')[key];
};

// Updates only the given kinds (audio / subtitle), the other one stays as chosen before
export const saveTrackPreference = (key: string, preference: TrackPreference): void => {
    const data = store.get('data');
    data[key] = { ...data[key], ...preference };
    store.set('data', data);
};
