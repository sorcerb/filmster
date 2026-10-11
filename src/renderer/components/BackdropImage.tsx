import { useEffect, useState } from 'react';

// Wide background picture of a title, shown once loaded (nothing if it fails). In a card (the card must be relative)
// it covers the top and fades into the card colour; fullScreen puts it behind the whole page, fading into the page colour.
const BackdropImage = ({ url, fullScreen = false }: { url?: string; fullScreen?: boolean }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => setIsLoaded(false), [url]);

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
                onLoad={() => setIsLoaded(true)}
                className={`w-full h-full object-cover object-top transition-opacity duration-700 ${isLoaded ? (fullScreen ? 'opacity-70' : 'opacity-40') : 'opacity-0'}`}
            />
            {fullScreen ? (
                <>
                    <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/10 via-neutral-900/40 to-neutral-900" />
                    <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/50 via-transparent to-neutral-900/50" />
                </>
            ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-800/0 via-neutral-800/60 to-neutral-800" />
            )}
        </div>
    );
};

export default BackdropImage;
