export interface CustomLink {
    name: string;
    url: string;
}

export const isCustomLinkUrl = (url: string): boolean => /^https?:\/\/\S+$/i.test(url.trim());

export const getCustomLinkUrl = (link: CustomLink, title: string): string => {
    const query = encodeURIComponent(title);
    return link.url.includes('{title}') ? link.url.split('{title}').join(query) : link.url + query;
};
