import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CustomLink, getCustomLinkUrl, isCustomLinkUrl } from '../models/CustomLink';

export const LINK_PILL_CLASS = 'flex items-center gap-1.5 px-3 py-1 bg-neutral-900/60 border border-white/15 backdrop-blur-md text-neutral-200 rounded-full text-xs hover:border-white/40 hover:text-white transition-colors';

interface CustomLinkButtonsProps {
    title: string;
}

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
