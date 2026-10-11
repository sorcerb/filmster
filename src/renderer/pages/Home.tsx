import { useEffect, useRef, useState } from "react";
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import MovieListCard from '../components/MovieListCard';
import ContinueWatching from '../components/ContinueWatching';
import { Download, RefreshCcw, Search, X } from "lucide-react";
import { MovieMetadata } from "../models/MediaMetadata";
import { buildMetadataFromFilm } from '../../shared/metadataApi';
import { useFlipAnimation } from '../utils/useFlipAnimation';
import { useI18n } from '../i18n/I18nProvider';
import { compareGroupMembers, getMediaTitle } from '../utils/mediaGroups';
import { createSearchMatcher } from '../utils/mediaSearch';
import { getItemGenres } from '../utils/genres';
import { getGenreIconSrc } from '../utils/genreIcons';
import { GenreIcons } from '../models/GenreIcons';

// Stable across reloads: a series card takes the id of one of its episodes, which may change
const getItemKey = (item: MediaFileModel) =>
    item.groupId ? `group:${item.groupId}` : item.type === MediaType.Series ? `series:${item.parsedName}` : item.id;

// Grouping by drag and drop needs a mouse
const canDragCards = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// A mixed group (movies and series) is shown under both filters
const isOfType = (item: MediaFileModel, type: MediaType) => (item.groupTypes ?? [item.type]).includes(type);

const Home = () => {
    const { t } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingAutoLoad, setIsLoadingAutoLoad] = useState(false);
    const [filter, setFilter] = useState<'all' | MediaType>(() => {
        const savedFilter = localStorage.getItem('selectedFilter');
        return (savedFilter === 'movie' || savedFilter === 'series') ? savedFilter as MediaType : 'all';
    });

    const [selectedGenre, setSelectedGenre] = useState<string>(() => {
        return localStorage.getItem('selectedGenre') || 'all';
    });
    const [genreMode, setGenreMode] = useState<'single' | 'multi'>(() => {
        const saved = localStorage.getItem('genreMode') || 'multi';
        return saved === 'single' || saved === 'multi' ? saved : 'multi';
    });
    const [includedGenres, setIncludedGenres] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('includedGenres');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    return new Set(parsed);
                }
            } catch (e) {
                console.error('Error parsing includedGenres from localStorage:', e);
            }
        }
        return new Set();
    });
    const [sortBy, setSortBy] = useState<
        'date-desc' | 'date-asc' |
        'name-asc' | 'name-desc' |
        'year-desc' | 'year-asc'
    >(() => {
        const savedSort = localStorage.getItem('selectedSort');
        return (savedSort && [
            'date-desc', 'date-asc',
            'name-asc', 'name-desc',
            'year-desc', 'year-asc'
        ].includes(savedSort)) ? savedSort as any : 'date-desc';
    });

    useEffect(() => {
        if (filter === 'all') {
            localStorage.removeItem('selectedFilter');
        } else {
            localStorage.setItem('selectedFilter', filter);
        }
    }, [filter]);

    useEffect(() => {
        if (selectedGenre === 'all') {
            localStorage.removeItem('selectedGenre');
        } else {
            localStorage.setItem('selectedGenre', selectedGenre);
        }
    }, [selectedGenre]);

    useEffect(() => {
        // Nothing chosen yet (first open on this device): the empty initial set would be read back
        // by loadAndGroupFiles as "all genres off"; it turns all genres on instead
        if (includedGenres.size === 0 && localStorage.getItem('includedGenres') === null) return;
        localStorage.setItem('includedGenres', JSON.stringify(Array.from(includedGenres)));
    }, [includedGenres]);

    useEffect(() => {
        localStorage.setItem('genreMode', genreMode);
    }, [genreMode]);
    // Kept for the session, so it survives opening a movie and coming back
    const [search, setSearch] = useState(() => sessionStorage.getItem('homeSearch') ?? '');
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        sessionStorage.setItem('homeSearch', search);
    }, [search]);

    // Ctrl+F focuses the search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'KeyF') {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const [displayItems, setDisplayItems] = useState<MediaFileModel[]>([]);
    const gridRef = useFlipAnimation([displayItems.map(getItemKey).join('|')]);
    const [groupedItems, setGroupedItems] = useState<MediaFileModel[]>([]);
    const [movieCount, setMovieCount] = useState(0);
    const [seriesCount, setSeriesCount] = useState(0);
    const [genreCounts, setGenreCounts] = useState<Record<string, number>>({});
    const [genreIcons, setGenreIcons] = useState<GenreIcons>({});

    useEffect(() => {
        window.electron.getGenreIcons()
            .then(setGenreIcons)
            .catch(error => console.error('Error reading genre icons:', error));
    }, []);

    // silent: background refresh without the full-page spinner, keeps the current list on error
    const loadMediaFiles = async (silent = false): Promise<MediaFileModel[] | null> => {
        if (!silent) setIsLoading(true);
        try {
            return await window.electron.getMediaFiles();
        } catch (error) {
            console.error('Error scanning media files:', error);
            return silent ? null : [];
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    // Number of cards per genre (same normalization as the filter, see utils/genres.ts)
    const getAllGenres = (items: MediaFileModel[]): Record<string, number> => {
        const counts: Record<string, number> = {};
        items.forEach(item => {
            getItemGenres(item.metadata?.genres).forEach(genre => {
                counts[genre] = (counts[genre] || 0) + 1;
            });
        });
        return counts;
    };

    // Genre selection for the genres of the whole library (not only the current type filter, or switching
    // to series would hide series-only genres). Genres that appeared since the last load (knownGenres) are
    // turned on if all genres were on, otherwise a new genre would hide its movies until turned on by hand.
    const restoreIncludedGenres = (libraryGenres: string[]): Set<string> => {
        const parse = (key: string): string[] | null => {
            try {
                const value = JSON.parse(localStorage.getItem(key) ?? 'null');
                return Array.isArray(value) ? value : null;
            } catch {
                return null;
            }
        };
        const saved = parse('includedGenres');
        const known = parse('knownGenres');
        localStorage.setItem('knownGenres', JSON.stringify(libraryGenres));

        if (!saved) return new Set(libraryGenres);
        const included = new Set(saved.filter(genre => libraryGenres.includes(genre)));
        if (known && known.every(genre => saved.includes(genre))) {
            libraryGenres.filter(genre => !known.includes(genre)).forEach(genre => included.add(genre));
        }
        return included;
    };

    const loadAndGroupFiles = async (silent?: unknown) => {
        const files = await loadMediaFiles(silent === true);
        if (!files) return;

        const groupedFiles = files.reduce((acc, file) => {
            if (file.groupId || file.type === MediaType.Series) {
                const key = file.groupId ? `group:${file.groupId}` : `series:${file.parsedName}`;
                if (!acc[key]) {
                    acc[key] = {
                        ...file,
                        episodes: [],
                        seasons: new Set<number>(),
                        types: new Set<MediaType>(),
                        modifiedDate: file.modifiedDate
                    };
                } else {
                    if (file.modifiedDate > acc[key].modifiedDate) {
                        acc[key].modifiedDate = file.modifiedDate;
                    }
                }
                if (file.season !== undefined) {
                    acc[key].seasons.add(file.season);
                }
                acc[key].types.add(file.type);
                acc[key].episodes.push(file);
            } else {
                acc[file.id] = file;
            }
            return acc;
        }, {} as Record<string, any>);

        const grouped = Object.values(groupedFiles).map(({ types, ...item }) => {
            if (!item.groupId) {
                return { ...item, seasons: item.seasons ? Array.from(item.seasons) : undefined };
            }
            // The group card is its earliest member (poster, year, genres), named after it unless renamed
            const groupTypes = Array.from(types as Set<MediaType>);
            const episodes = [...item.episodes].sort(compareGroupMembers);
            const cover = episodes[0];
            const groupName = cover.groupName || getMediaTitle(cover);
            return {
                ...cover,
                parsedName: groupName,
                groupName,
                episodes,
                modifiedDate: item.modifiedDate,
                type: groupTypes.length === 1 ? groupTypes[0] : cover.type,
                groupTypes,
                seasons: Array.from(item.seasons)
            };
        }) as MediaFileModel[];
        setGroupedItems(grouped);

        const movies = grouped.filter(f => isOfType(f, MediaType.Movie));
        const series = grouped.filter(f => isOfType(f, MediaType.Series));
        setMovieCount(movies.length);
        setSeriesCount(series.length);

        const savedFilter = localStorage.getItem('selectedFilter') as MediaType | null;
        const savedGenre = localStorage.getItem('selectedGenre') || 'all';
        const savedGenreMode = localStorage.getItem('genreMode') || 'multi';

        if (savedFilter === 'movie' || savedFilter === 'series') {
            setFilter(savedFilter);
        }
        if (savedGenre) {
            setSelectedGenre(savedGenre);
        }
        setGenreMode(savedGenreMode === 'single' || savedGenreMode === 'multi' ? savedGenreMode : 'multi');

        const currentFilter = savedFilter === 'movie' || savedFilter === 'series' ? savedFilter : 'all';
        const itemsForGenreCount = currentFilter === 'all'
            ? grouped
            : currentFilter === MediaType.Movie ? movies : series;

        const counts = getAllGenres(itemsForGenreCount);
        setGenreCounts(counts);

        const restoredGenres = restoreIncludedGenres(Object.keys(getAllGenres(grouped)));
        setIncludedGenres(restoredGenres);

        setTimeout(() => {
            applyFilters(grouped, currentFilter, savedGenre, savedGenreMode === 'single' || savedGenreMode === 'multi' ? savedGenreMode : 'multi', restoredGenres);
        }, 0);
    };

    useEffect(() => {
        loadAndGroupFiles();
    }, []);

    // New files found by auto-scan and metadata loaded for them in the background
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadAndGroupFiles(true), 500);
        };
        const unsubscribeFiles = window.electron.onMediaFilesChanged(refresh);
        const unsubscribeMetadata = window.electron.onMetadataUpdated(refresh);
        return () => {
            clearTimeout(timer);
            unsubscribeFiles();
            unsubscribeMetadata();
        };
    }, []);

    const sortItems = (items: MediaFileModel[]) => {
        return [...items].sort((a, b) => {
            if (sortBy.startsWith('name')) {
                const comparison = a.parsedName.localeCompare(b.parsedName);
                return sortBy === 'name-asc' ? comparison : -comparison;
            } else if (sortBy.startsWith('year')) {
                const yearA = a.metadata?.year || 0;
                const yearB = b.metadata?.year || 0;
                if (yearA !== yearB) {
                    return sortBy === 'year-desc' ? yearB - yearA : yearA - yearB;
                }
                return a.parsedName.localeCompare(b.parsedName);
            } else {
                const dateA = new Date(a.modifiedDate).getTime();
                const dateB = new Date(b.modifiedDate).getTime();
                return sortBy === 'date-desc' ? dateB - dateA : dateA - dateB;
            }
        });
    };

    useEffect(() => {
        localStorage.setItem('selectedSort', sortBy);
        if (groupedItems.length > 0) {
            applyFilters(groupedItems, filter, selectedGenre, genreMode, includedGenres);
        }
    }, [sortBy, groupedItems, filter, selectedGenre, genreMode, includedGenres, search]);

    const applyFilters = (
        items: MediaFileModel[],
        typeFilter: typeof filter,
        genre: string,
        mode: 'single' | 'multi',
        includeSet: Set<string>
    ) => {
        // Search looks through the whole library, regardless of the type and genre filters
        const matchesSearch = createSearchMatcher(search);
        let filtered = [...items];
        if (matchesSearch) {
            filtered = filtered.filter(matchesSearch);
        } else {
            if (typeFilter !== 'all') {
                filtered = filtered.filter(f => isOfType(f, typeFilter));
            }

            if (mode === 'single' && genre !== 'all') {
                filtered = filtered.filter(item => getItemGenres(item.metadata?.genres).includes(genre));
            } else if (mode === 'multi') {
                filtered = filtered.filter(item => {
                    const genres = getItemGenres(item.metadata?.genres);
                    if (genres.length === 0) return true;
                    return genres.every(g => includeSet.has(g));
                });
            }
        }

        setDisplayItems(sortItems(filtered));

        if (typeFilter !== 'all') {
            const filteredByType = items.filter(f => isOfType(f, typeFilter));
            setGenreCounts(getAllGenres(filteredByType));
        } else {
            setGenreCounts(getAllGenres(items));
        }
    };

    const handleFilterChange = (newFilter: typeof filter) => {
        setFilter(newFilter);
        setSelectedGenre('all');
        setGenreMode('multi');
        const itemsForGenreCount = newFilter === 'all'
            ? groupedItems
            : groupedItems.filter(f => isOfType(f, newFilter));
        const counts = getAllGenres(itemsForGenreCount);
        setGenreCounts(counts);
    };

    const handleGenreClick = (genre: string) => {
        // Clicking the button switches to single-genre mode
        setSelectedGenre(genre);
        setGenreMode(genre === 'all' ? 'multi' : 'single');
        if (genre === 'all') {
            // All genres of the library, also those hidden by the type filter
            setIncludedGenres(new Set(Object.keys(getAllGenres(groupedItems))));
        } else {
            setIncludedGenres(new Set([genre]));
        }
    };

    const handleGenreCheckboxChange = (genre: string, checked: boolean) => {
        if (includedGenres.size === 0 && checked) {
            setGenreMode('single');
            setSelectedGenre(genre);
            setIncludedGenres(new Set([genre]));
            return;
        }

        setSelectedGenre('all');
        setGenreMode('multi');
        setIncludedGenres(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(genre);
            } else {
                next.delete(genre);
            }
            return next;
        });
    };

    // Drag and drop: a card dropped onto another one joins its group (or forms a new group with it)
    const [draggedKey, setDraggedKey] = useState<string | null>(null);
    const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

    const getFileIds = (item: MediaFileModel) => (item.episodes?.length ? item.episodes : [item]).map(f => f.id);

    const handleDrop = async (target: MediaFileModel) => {
        const source = displayItems.find(item => getItemKey(item) === draggedKey);
        setDraggedKey(null);
        setDropTargetKey(null);
        if (!source || source === target) return;

        try {
            await window.electron.groupMediaFiles(getFileIds(target), getFileIds(source));
        } catch (error) {
            console.error('Error grouping media files:', error);
        }
        loadAndGroupFiles(true);
    };

    // Cards the "Load all metadata" button would load
    const missingMetadataCount = displayItems.filter(f => f.metadata == null).length;

    const autoLoadMetadata = async () => {
        setIsLoadingAutoLoad(true);
        try {
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            for (const file of displayItems.filter(f => f.metadata == null)) {
                if (file.metadata == null) {
                    const film = await window.electron.findMetadataFilm(file.parsedName, file.year);
                    const newMeta = film && buildMetadataFromFilm(file.metadataId, film);
                    if (!newMeta) {
                        continue;
                    }

                    await window.electron.saveMetadata(newMeta, film);
                    const newMetadata = await window.electron.loadMetadata(file.metadataId) as MovieMetadata;
                    if (newMetadata != null) {
                        file.metadata = { ...newMetadata };
                        file.metadata._updated = new Date();
                        setDisplayItems(prevItems =>
                            prevItems.map(item => {
                                if (item.id === file.id) {
                                    return file;
                                }
                                if (item.episodes) {
                                    return {
                                        ...item,
                                        episodes: item.episodes.map(ep =>
                                            ep.id === file.id ? file : ep
                                        )
                                    };
                                }
                                return item;
                            })
                        );
                    }

                    await delay(200);
                }
            }
        } catch (error) {
            console.error('Error loading metadata:', error);
        } finally {
            setIsLoadingAutoLoad(false);
        }
    };



    useEffect(() => {
        if (groupedItems.length > 0) {
            applyFilters(groupedItems, filter, selectedGenre, genreMode, includedGenres);
        }
    }, [filter, selectedGenre, groupedItems, genreMode, includedGenres]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-12 md:h-12 py-1 md:py-0 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <h1 className="text-xl text-neutral-100">{t('home.title')}</h1>
                    <button onClick={loadAndGroupFiles}><RefreshCcw className="h-5 w-5" /></button>
                    <div className="relative w-full md:w-auto md:ml-4 order-last md:order-none">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setSearch('');
                                    e.currentTarget.blur();
                                }
                            }}
                            placeholder={t('home.search')}
                            title={t('home.searchHint')}
                            className="w-full md:w-64 bg-neutral-800 text-white text-sm rounded pl-8 pr-7 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                        />
                        {search && (
                            <button
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-white"
                                onClick={() => {
                                    setSearch('');
                                    searchInputRef.current?.focus();
                                }}
                                title={t('home.searchClear')}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Only while some titles have no metadata */}
                    {(isLoadingAutoLoad || missingMetadataCount > 0) && (
                        <button
                            onClick={autoLoadMetadata}
                            disabled={isLoadingAutoLoad}
                            className="px-3 py-1 vertical-align-middle text-neutral-200 hover:text-white disabled:text-neutral-600 disabled:cursor-default"
                            title={t('home.loadAllMetadata')}
                        >
                            <Download className="h-5 w-5 inline mb-1" />
                            <span className="hidden md:inline"> {isLoadingAutoLoad ? t('common.loading') : t('home.loadAllMetadata')}</span>
                            {!isLoadingAutoLoad && <span> ({missingMetadataCount})</span>}
                        </button>
                    )}
                    <div className="inline-block md:ml-4">
                        <label htmlFor="sort" className="hidden md:inline text-sm text-gray-400 mr-2">{t('home.sortBy')}</label>
                        <select
                            id="sort"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as
                                'name-asc' | 'name-desc' |
                                'year-desc' | 'year-asc' |
                                'date-desc' | 'date-asc'
                            )}
                            className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none"
                        >
                            <option value="date-desc">{t('home.sortDateDesc')}</option>
                            <option value="date-asc">{t('home.sortDateAsc')}</option>
                            <option value="name-asc">{t('home.sortNameAsc')}</option>
                            <option value="name-desc">{t('home.sortNameDesc')}</option>
                            <option value="year-desc">{t('home.sortYearDesc')}</option>
                            <option value="year-asc">{t('home.sortYearAsc')}</option>
                        </select>
                    </div>
                </div>
            </div>

            {!search.trim() && <ContinueWatching items={groupedItems} />}

            <div className="mt-4">
                <div className="flex gap-2 mb-2 flex-wrap">
                    <button
                        className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                        onClick={() => handleFilterChange('all')}
                    >
                        {t('common.filterAll', { count: groupedItems.length })}
                    </button>
                    <button
                        className={`px-3 py-1 rounded ${filter === MediaType.Movie ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                        onClick={() => handleFilterChange(MediaType.Movie)}
                    >
                        {t('common.filterMovies', { count: movieCount })}
                    </button>
                    <button
                        className={`px-3 py-1 rounded ${filter === MediaType.Series ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                        onClick={() => handleFilterChange(MediaType.Series)}
                    >
                        {t('common.filterSeries', { count: seriesCount })}
                    </button>
                </div>

                {Object.keys(genreCounts).length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                            className={`px-3 py-1 text-xs rounded flex items-center ${(genreMode === 'multi' && Object.keys(genreCounts).length > 0 && Object.keys(genreCounts).every(genre => includedGenres.has(genre))) ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                            onClick={() => handleGenreClick('all')}
                            title={t('home.allGenresHint')}
                        >
                            {t('home.allGenres')}
                        </button>
                        {Object.entries(genreCounts)
                            .sort(([genreA], [genreB]) => genreA.localeCompare(genreB))
                            .map(([genre, count]) => {
                                const isSingleChecked = genreMode === 'single' && selectedGenre === genre;
                                const isMultiChecked = genreMode === 'multi' && includedGenres.has(genre);
                                const isChecked = isSingleChecked || isMultiChecked;
                                const isActive = (genreMode === 'single' && selectedGenre === genre) || (genreMode === 'multi' && isMultiChecked);
                                const startIcon = getGenreIconSrc(genreIcons[genre]?.start);
                                const endIcon = getGenreIconSrc(genreIcons[genre]?.end);
                                return (
                                    <button
                                        key={genre}
                                        className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${isActive ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                                        onClick={() => handleGenreClick(genre)}
                                        title={t('home.genreItems', { count })}
                                    >
                                        {startIcon && <img src={startIcon} alt="" className="w-4 h-4 object-contain mr-1" />}
                                        <input
                                            type="checkbox"
                                            className="mr-1 accent-blue-600"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                handleGenreCheckboxChange(genre, e.target.checked);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <span>{genre} ({count})</span>
                                        {endIcon && <img src={endIcon} alt="" className="w-4 h-4 object-contain ml-1" />}
                                    </button>
                                );
                            })}
                    </div>
                )}
            </div>
            <div className="mt-5 text-xs">
                {displayItems.length === 0 ? (
                    <p className="text-neutral-400">
                        {search.trim() && groupedItems.length > 0 ? t('home.nothingFound', { query: search.trim() }) : t('common.noMediaFiles')}
                    </p>
                ) : (
                    <div ref={gridRef} className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-10 gap-3 md:gap-5">
                        {displayItems.map((item) => {
                            const key = getItemKey(item);
                            return (
                                <div
                                    key={key}
                                    data-flip-key={key}
                                    className={`relative rounded transition-[opacity,box-shadow] ${draggedKey === key ? 'opacity-40' : ''} ${dropTargetKey === key ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-950' : ''}`}
                                    draggable={canDragCards}
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'move';
                                        setDraggedKey(key);
                                    }}
                                    onDragEnd={() => {
                                        setDraggedKey(null);
                                        setDropTargetKey(null);
                                    }}
                                    onDragOver={(e) => {
                                        if (!draggedKey || draggedKey === key) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (dropTargetKey !== key) setDropTargetKey(key);
                                    }}
                                    onDragLeave={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                            setDropTargetKey(prev => prev === key ? null : prev);
                                        }
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        handleDrop(item);
                                    }}
                                >
                                    <MovieListCard
                                        key={`${key}-${item.metadata?._updated || ''}`}
                                        item={item}
                                        isGrouped={item.episodes && item.episodes.length > 0}
                                        onGroupChanged={() => loadAndGroupFiles(true)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

export default Home;