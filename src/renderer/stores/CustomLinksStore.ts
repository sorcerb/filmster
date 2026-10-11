import Store from 'electron-store';
import { CustomLink, isCustomLinkUrl } from '../models/CustomLink';

const store = new Store<{ links: CustomLink[] }>({ name: 'CustomLinks', defaults: { links: [] } });

export const getCustomLinks = (): CustomLink[] => store.get('links');

// Only http(s) links: they become hrefs, also in a browser on the network
export const setCustomLinks = (links: CustomLink[]): void => {
    store.set('links', links
        .filter(link => typeof link?.name === 'string' && typeof link.url === 'string' && isCustomLinkUrl(link.url))
        .map(link => ({ name: link.name.trim(), url: link.url.trim() })));
};
