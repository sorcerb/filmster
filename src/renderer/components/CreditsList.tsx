import { useEffect, useRef } from 'react';
import { Person } from '../models/MediaMetadata';
import { useI18n } from '../i18n/I18nProvider';
import { LINK_PILL_CLASS } from './CustomLinkButtons';

const PersonLink = ({ person, className, children }: { person: Person; className: string; children: React.ReactNode }) =>
    person.profileUrl
        ? <a href={person.profileUrl} target="_blank" rel="noreferrer" title={person.name} className={className}>{children}</a>
        : <span title={person.name} className={className}>{children}</span>;

const PersonPhoto = ({ person, className }: { person: Person; className: string }) => (
    <div className={`${className} rounded-full overflow-hidden bg-neutral-700 border-2 border-transparent group-hover:border-blue-500 transition-colors flex items-center justify-center text-neutral-400`}>
        {person.photoUrl
            ? <img src={person.photoUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            : person.name.charAt(0)}
    </div>
);

const CreditsList = ({ genres = [], directors = [], actors = [], layout = 'row' }: { genres?: string[]; directors?: Person[]; actors?: Person[]; layout?: 'row' | 'column' }) => {
    const { t } = useI18n();
    const castRowRef = useRef<HTMLDivElement>(null);

    // A native listener: React's wheel handlers are passive and can't stop the page from scrolling.
    useEffect(() => {
        const row = castRowRef.current;
        if (!row) return;
        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
            const maxScroll = row.scrollWidth - row.clientWidth;
            const canScroll = e.deltaY < 0 ? row.scrollLeft > 0 : row.scrollLeft < maxScroll - 1;
            if (!canScroll) return;
            e.preventDefault();
            row.scrollLeft += e.deltaY;
        };
        row.addEventListener('wheel', handleWheel, { passive: false });
        return () => row.removeEventListener('wheel', handleWheel);
    }, [actors.length]);

    if (layout === 'column') {
        if (!genres.length && !directors.length && !actors.length) return null;
        return (
            <div className="h-full flex flex-col gap-4 bg-neutral-900/75 backdrop-blur-md p-4 rounded-lg">
                {genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {genres.map(genre => (
                            <span key={genre} className="px-3 py-1 bg-white/5 border border-white/10 text-neutral-200 rounded-full text-xs">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
                {directors.length > 0 && (
                    <div>
                        <h3 className="text-sm text-neutral-400 mb-2">{t('details.directors')}</h3>
                        <div className="flex flex-wrap gap-2 text-sm">
                            {directors.map(person => (
                                <PersonLink key={person.id} person={person} className={LINK_PILL_CLASS}>
                                    {person.name}
                                </PersonLink>
                            ))}
                        </div>
                    </div>
                )}
                {actors.length > 0 && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <h3 className="text-sm text-neutral-400 mb-2">{t('details.cast')}</h3>
                        <div className="thin-scrollbar flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 space-y-1">
                            {actors.map(person => (
                                <PersonLink key={person.id} person={person} className="group flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-white/5">
                                    <PersonPhoto person={person} className="w-10 h-10 shrink-0 text-sm" />
                                    <div className="min-w-0">
                                        <p className="text-sm text-neutral-200 group-hover:text-white truncate">{person.name}</p>
                                        {person.character && (
                                            <p className="text-xs text-neutral-400 truncate" title={person.character}>{person.character}</p>
                                        )}
                                    </div>
                                </PersonLink>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (!directors.length && !actors.length) return null;

    return (
        <div className="mt-4 space-y-3 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
            {directors.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-neutral-300">{t('details.directors')}</span>
                    {directors.map(person => (
                        <PersonLink key={person.id} person={person} className={LINK_PILL_CLASS}>
                            {person.name}
                        </PersonLink>
                    ))}
                </div>
            )}
            {actors.length > 0 && (
                <div>
                    <h3 className="text-sm text-neutral-300 mb-2">{t('details.cast')}</h3>
                    <div ref={castRowRef} className="thin-scrollbar flex gap-3 overflow-x-auto pb-2">
                        {actors.map(person => (
                            <PersonLink key={person.id} person={person} className="group w-20 shrink-0 text-center">
                                <PersonPhoto person={person} className="w-16 h-16 mx-auto text-lg" />
                                <p className="mt-1 text-xs text-neutral-200 group-hover:text-white line-clamp-2">{person.name}</p>
                                {person.character && (
                                    <p className="text-[11px] text-neutral-400 truncate" title={person.character}>{person.character}</p>
                                )}
                            </PersonLink>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreditsList;
