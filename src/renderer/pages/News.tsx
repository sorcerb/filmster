import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Star } from 'lucide-react';
import { NEWS_SECTIONS, NewsItem, NewsSection, MetadataProvider } from '../../shared/metadataApi';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { GenreIcons } from '../models/GenreIcons';
import { MessageKey } from '../../shared/i18n';
import NewsItemModal, { getNewsItemTitle, getNewsItemUrl, isNewsItemMovie } from '../components/NewsItemModal';
import { CustomLink, getCustomLinkUrl, isCustomLinkUrl } from '../models/CustomLink';
import { useI18n } from '../i18n/I18nProvider';
import { isWebClient } from '../webApi';
import { getItemGenres } from '../utils/genres';
import { getGenreIconSrc } from '../utils/genreIcons';

const SECTION_TITLES: Record<NewsSection, MessageKey> = {
    trending: 'news.trending',
    nowPlaying: 'news.nowPlaying',
    upcoming: 'news.upcoming',
    series: 'news.series',
};

const normalizeTitle = (title: string) => title.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

// TMDB ids are per media type: a movie and a series may share one
const getIdKey = (source: MetadataProvider, id: string | number, isMovie: boolean) =>
    source === 'tmdb' ? `tmdb:${isMovie ? 'movie' : 'tv'}:${id}` : `kinopoisk:${id}`;

const getTitleKey = (title: string, year: number | string) => `title:${normalizeTitle(title)}:${parseInt(String(year)) || ''}`;

// Library files by the provider ids and title + year of their metadata (the title for metadata from the other provider)
const buildLibraryIndex = (files: MediaFileModel[]): Map<string, string> => {
    const index = new Map<string, string>();
    const add = (key: string, fileId: string) => { if (!index.has(key)) index.set(key, fileId); };
    for (const file of files) {
        const meta = file.metadata;
        if (!meta) continue;
        const isMovie = file.type === MediaType.Movie;
        if (meta.externalIds?.tmdb) add(getIdKey('tmdb', meta.externalIds.tmdb, isMovie), file.id);
        if (meta.externalIds?.kinopoisk) add(getIdKey('kinopoisk', meta.externalIds.kinopoisk, isMovie), file.id);
        if (meta.title) add(getTitleKey(meta.title, meta.year), file.id);
    }
    return index;
};

const findInLibrary = (index: Map<string, string>, item: NewsItem): string | undefined =>
    index.get(getIdKey(item.source ?? 'kinopoisk', item.filmId, isNewsItemMovie(item)))
    ?? [item.nameRu, item.nameEn].filter((name): name is string => !!name)
        .map(name => index.get(getTitleKey(name, item.year)))
        .find(Boolean);

const getNewsItemGenres = (item: NewsItem) => getItemGenres(item.genres.map(({ genre }) => genre));

// Same grid as the library. Collapsed, rows past the second get no height and are clipped,
// so the row gap is a card margin: hidden rows must not add gaps.
const GRID_CLASS = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-10 gap-x-3 md:gap-x-5';
const COLLAPSED_CLASS = 'grid-rows-[repeat(2,auto)] auto-rows-[0] overflow-hidden';
const CARD_MARGIN = 'mb-3 md:mb-5';

// Two rows of the narrowest grid fit without the button
const MIN_EXPANDABLE = 7;

const SKELETON_COUNT = 10;

// null while loading
type SectionState = NewsItem[] | null | 'error';

interface NewsRowProps {
    section: NewsSection;
    items: SectionState;
    libraryIndex: Map<string, string>;
    onSelect: (item: NewsItem, openCard: boolean) => void;
}

const NewsRow = ({ section, items, libraryIndex, onSelect }: NewsRowProps) => {
    const { t, language } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);

    // Release dates matter for what is in cinemas or coming; the year is enough for the rest
    const showDate = section === 'nowPlaying' || section === 'upcoming';
    const getSubtitle = (item: NewsItem) => showDate && item.releaseDate
        ? new Date(item.releaseDate).toLocaleDateString(language, { day: 'numeric', month: 'long' })
        : item.year;

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-neutral-100">{t(SECTION_TITLES[section])}</h2>
                {Array.isArray(items) && items.length >= MIN_EXPANDABLE && (
                    <button
                        className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? t('news.showLess') : t('news.showAll', { count: items.length })}
                    </button>
                )}
            </div>
            {items === 'error' ? (
                <p className="text-xs text-neutral-500">{t('news.loadError')}</p>
            ) : items?.length === 0 ? (
                <p className="text-xs text-neutral-500">{t('news.empty')}</p>
            ) : (
                <div className={`${GRID_CLASS} ${isExpanded ? '' : COLLAPSED_CLASS}`}>
                    {items === null
                        ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                            <div key={i} className={`${CARD_MARGIN} aspect-[2/3] rounded bg-neutral-800 animate-pulse`} />
                        ))
                        : items.map(item => {
                            const rating = parseFloat(item.rating);
                            const isInLibrary = !!findInLibrary(libraryIndex, item);
                            return (
                                <button
                                    key={`${item.source}:${item.type}:${item.filmId}`}
                                    className={`group ${CARD_MARGIN} min-w-0 text-left`}
                                    onClick={(e) => onSelect(item, e.ctrlKey)}
                                >
                                    <div className="relative aspect-[2/3] rounded overflow-hidden bg-neutral-800">
                                        {item.posterUrlPreview && (
                                            <img src={item.posterUrlPreview} alt="" loading="lazy" draggable={false}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        )}
                                        {rating > 0 && (
                                            <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-xs text-white">
                                                <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                                                {rating.toFixed(1)}
                                            </span>
                                        )}
                                        {isInLibrary && (
                                            <span className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-0.5" title={t('news.inLibrary')}>
                                                <CircleCheck className="h-5 w-5 text-green-400" />
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1.5 text-sm text-neutral-100 truncate">{item.nameRu || item.nameEn}</p>
                                    <p className="text-xs text-neutral-400 truncate">{getSubtitle(item)}</p>
                                </button>
                            );
                        })}
                </div>
            )}
        </div>
    );
};

const GENRE_STORAGE_KEY = 'newsGenre';

// What a click on a title opens: the card, a provider ('tmdb', 'kinopoisk') or a custom link ('link:' + its URL)
const CLICK_ACTION_STORAGE_KEY = 'newsClickAction';
const CARD_ACTION = 'card';
const LINK_ACTION_PREFIX = 'link:';

const News = () => {
    const { t } = useI18n();
    // Providers with an API key, the default one first; undefined while loading
    const [providers, setProviders] = useState<MetadataProvider[]>();
    // The default provider when the page opens, then the one picked here
    const [provider, setProvider] = useState<MetadataProvider | null>();
    const [sections, setSections] = useState<Record<NewsSection, SectionState>>(
        () => Object.fromEntries(NEWS_SECTIONS.map(section => [section, null])) as Record<NewsSection, SectionState>);
    const [libraryIndex, setLibraryIndex] = useState(new Map<string, string>());
    const [genreIcons, setGenreIcons] = useState<GenreIcons>({});
    // One genre or all; kept for the session, so it survives opening a film and coming back
    const [genre, setGenre] = useState<string | null>(() => sessionStorage.getItem(GENRE_STORAGE_KEY));
    const [selected, setSelected] = useState<NewsItem | null>(null);
    const closeModal = useCallback(() => setSelected(null), []);
    const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
    const [clickAction, setClickAction] = useState(() => localStorage.getItem(CLICK_ACTION_STORAGE_KEY) ?? CARD_ACTION);

    useEffect(() => {
        window.electron.getMetadataProviders()
            .then(loaded => {
                setProviders(loaded);
                setProvider(loaded[0] ?? null);
            })
            .catch(error => {
                console.error('Error loading metadata providers:', error);
                setProviders([]);
                setProvider(null);
            });
        window.electron.getMediaFiles()
            .then(files => setLibraryIndex(buildLibraryIndex(files)))
            .catch(error => console.error('Error loading media files:', error));
        window.electron.getGenreIcons()
            .then(setGenreIcons)
            .catch(error => console.error('Error loading genre icons:', error));
        window.electron.getCustomLinks()
            .then(links => setCustomLinks(links.filter(link => isCustomLinkUrl(link.url))))
            .catch(error => console.error('Error loading custom links:', error));
    }, []);

    useEffect(() => {
        if (!provider) return;
        // A list of the provider switched away from may still arrive
        let isCurrent = true;
        setSections(Object.fromEntries(NEWS_SECTIONS.map(section => [section, null])) as Record<NewsSection, SectionState>);
        NEWS_SECTIONS.forEach(section => window.electron.getNews(provider, section)
            .then(items => isCurrent && setSections(current => ({ ...current, [section]: items })))
            .catch(error => {
                console.error(`Error loading news (${section}):`, error);
                if (isCurrent) setSections(current => ({ ...current, [section]: 'error' }));
            }));
        return () => { isCurrent = false; };
    }, [provider]);

    useEffect(() => {
        if (genre) sessionStorage.setItem(GENRE_STORAGE_KEY, genre);
        else sessionStorage.removeItem(GENRE_STORAGE_KEY);
    }, [genre]);

    // Titles per genre over all sections; a title in two sections counts once
    const genreCounts = useMemo(() => {
        const titlesByGenre = new Map<string, Set<string>>();
        for (const items of Object.values(sections)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                for (const itemGenre of getNewsItemGenres(item)) {
                    if (!titlesByGenre.has(itemGenre)) titlesByGenre.set(itemGenre, new Set());
                    titlesByGenre.get(itemGenre)!.add(`${item.type}:${item.filmId}`);
                }
            }
        }
        return [...titlesByGenre]
            .map(([name, titles]) => [name, titles.size] as const)
            .sort(([a], [b]) => a.localeCompare(b));
    }, [sections]);

    // Providers only with an API key; a removed link or key falls back to the card
    const clickOptions = [
        { value: CARD_ACTION, label: t('news.clickCard') },
        ...(providers ?? []).map(item => ({ value: item, label: t(item === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk') })),
        ...customLinks.map(link => ({ value: LINK_ACTION_PREFIX + link.url, label: link.name || link.url })),
    ];
    const currentClickAction = clickOptions.some(option => option.value === clickAction) ? clickAction : CARD_ACTION;

    const handleClickActionChange = (value: string) => {
        setClickAction(value);
        localStorage.setItem(CLICK_ACTION_STORAGE_KEY, value);
    };

    // Ctrl+click always opens the card
    const handleSelect = (item: NewsItem, openCard: boolean) => {
        const link = customLinks.find(link => LINK_ACTION_PREFIX + link.url === currentClickAction);
        const url = openCard || currentClickAction === CARD_ACTION ? null
            : link ? getCustomLinkUrl(link, getNewsItemTitle(item))
            : getNewsItemUrl(item, currentClickAction as MetadataProvider);
        if (url) window.open(url, '_blank', 'noreferrer');
        else setSelected(item);
    };

    const filterItems = (items: SectionState): SectionState =>
        genre && Array.isArray(items) ? items.filter(item => getNewsItemGenres(item).includes(genre)) : items;

    return (
        <>
            <div className="h-12 flex items-center gap-3">
                <h1 className="text-xl text-neutral-100">{t('nav.news')}</h1>
                {providers && providers.length > 0 && (
                    <div className="flex rounded bg-neutral-800 p-0.5 text-xs">
                        {providers.map(item => (
                            <button
                                key={item}
                                className={`px-2 py-0.5 rounded transition-colors ${item === provider ? 'bg-neutral-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                                onClick={() => setProvider(item)}
                                disabled={providers.length === 1}
                            >
                                {t(item === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk')}
                            </button>
                        ))}
                    </div>
                )}
                {provider && (
                    <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400" title={t('news.clickActionHint')}>
                        {t('news.clickAction')}
                        <select
                            value={currentClickAction}
                            onChange={(e) => handleClickActionChange(e.target.value)}
                            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 border border-neutral-700 focus:border-blue-500 focus:outline-none"
                        >
                            {clickOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {provider === null && (
                <div className="mt-4 text-sm text-neutral-400">
                    <p>{t('news.noKey')}</p>
                    {!isWebClient && (
                        <Link to="/settings" className="inline-block mt-3 px-4 py-1.5 bg-neutral-700 text-neutral-200 rounded hover:bg-neutral-600 transition-colors">
                            {t('news.openSettings')}
                        </Link>
                    )}
                </div>
            )}

            {genreCounts.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                        className={`px-3 py-1 text-xs rounded ${!genre ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                        onClick={() => setGenre(null)}
                    >
                        {t('home.allGenres')}
                    </button>
                    {genreCounts.map(([name, count]) => {
                        const startIcon = getGenreIconSrc(genreIcons[name]?.start);
                        const endIcon = getGenreIconSrc(genreIcons[name]?.end);
                        return (
                            <button
                                key={name}
                                className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${genre === name ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                                onClick={() => setGenre(genre === name ? null : name)}
                                title={t('home.genreItems', { count })}
                            >
                                {startIcon && <img src={startIcon} alt="" className="w-4 h-4 object-contain" />}
                                <span>{name} ({count})</span>
                                {endIcon && <img src={endIcon} alt="" className="w-4 h-4 object-contain" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {provider && NEWS_SECTIONS.map(section => (
                <NewsRow
                    key={section}
                    section={section}
                    items={filterItems(sections[section])}
                    libraryIndex={libraryIndex}
                    onSelect={handleSelect}
                />
            ))}

            {selected && (
                <NewsItemModal item={selected} libraryFileId={findInLibrary(libraryIndex, selected)} onClose={closeModal} />
            )}
        </>
    );
};

export default News;
