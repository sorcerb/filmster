import Store from 'electron-store';

// Whether the player skips the intro by itself: chosen per series (by parsed name) with the button in the player,
// series without a choice follow the default from Settings
const store = new Store<{ defaultEnabled: boolean; choices: Record<string, boolean>; series?: string[] }>({
    name: 'AutoSkipIntro',
    defaults: {
        defaultEnabled: false,
        choices: {}
    }
});

// The first version kept only the series it was turned on for
const legacySeries = store.get('series');
if (legacySeries) {
    store.set('choices', { ...Object.fromEntries(legacySeries.map(name => [name, true])), ...store.get('choices') });
    store.delete('series');
}

export const getAutoSkipIntro = (seriesName: string): boolean =>
    store.get('choices')[seriesName] ?? store.get('defaultEnabled');

export const setAutoSkipIntro = (seriesName: string, enabled: boolean): void => {
    store.set('choices', { ...store.get('choices'), [seriesName]: enabled });
};

export const getAutoSkipIntroDefault = (): boolean => store.get('defaultEnabled');

export const setAutoSkipIntroDefault = (enabled: boolean): void => {
    store.set('defaultEnabled', enabled);
};
