import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CustomLink, getCustomLinkUrl, isCustomLinkUrl } from '../models/CustomLink';

// Links are outlined, unlike the filled genre and quality tags
export const LINK_PILL_CLASS = 'flex items-center gap-1.5 px-3 py-1 border border-neutral-600 text-neutral-300 rounded-full text-xs hover:border-neutral-400 hover:text-white transition-colors';

interface CustomLinkButtonsProps {
    title: string;
}

// The links from Settings, searching for the title
const CustomLinkButtons = ({ title }: CustomLinkButtonsProps) => {
    const [links, setLinks] = useState<CustomLink[]>([]);

    useEffect(() => {
        window.electron.getCustomLinks()
            .then(setLinks)
            .catch(error => console.error('Error reading custom links:', error));
    }, []);

    if (!title) return null;
    return (
        <>
            {links.filter(link => isCustomLinkUrl(link.url)).map((link, index) => (
                <a
                    key={index}
                    href={getCustomLinkUrl(link, title)}
                    target="_blank"
                    rel="noreferrer"
                    className={LINK_PILL_CLASS}
                >
                    {link.name || link.url.replace(/^https?:\/\//i, '').split('/')[0]}
                    <ExternalLink className="h-3 w-3 text-neutral-500" />
                </a>
            ))}
        </>
    );
};

export default CustomLinkButtons;
