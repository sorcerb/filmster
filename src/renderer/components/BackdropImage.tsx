import { useState } from 'react';

const BackdropImage = ({ url, fullScreen = false }: { url?: string; fullScreen?: boolean }) => {
    // The URL that finished loading, not a flag reset in an effect: a cached picture can load before the effect runs,
    // and the reset would then hide it for good
    const [loadedUrl, setLoadedUrl] = useState<string>();
    const isLoaded = !!url && loadedUrl === url;

    if (!url) return null;

    return (
        <div
            className={fullScreen
                ? 'fixed inset-0 -z-10 pointer-events-none'
                : 'absolute inset-x-0 top-0 h-[28rem] overflow-hidden rounded-t-lg pointer-events-none'}
            aria-hidden
        >
            <img
                src={url}
                alt=""
                onLoad={() => setLoadedUrl(url)}
                className={`w-full h-full object-cover object-top transition-opacity duration-700 ${isLoaded ? (fullScreen ? 'opacity-90' : 'opacity-40') : 'opacity-0'}`}
            />
            {fullScreen ? (
                <>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-900/30 to-neutral-900" />
                    <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/80 via-neutral-900/30 to-transparent" />
                </>
            ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-800/0 via-neutral-800/60 to-neutral-800" />
            )}
        </div>
    );
};

export default BackdropImage;
