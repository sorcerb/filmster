import { useState, useEffect, useRef } from 'react';
import { ImagePlus, LoaderCircle, Search } from 'lucide-react';
import { MediaFileModel } from '../models/MediaFileModel';
import { MovieMetadata, MoveDbMediaSource } from '../models/MediaMetadata';
import { MovieSearchResult } from '../models/MovieSearchResult';
import { useI18n } from '../i18n/I18nProvider';
import { CustomPoster, getMediaType, METADATA_PROVIDERS, MetadataProvider, PosterImage } from '../../shared/metadataApi';

// Poster and preview widths, as TMDB's w780 and w185
const POSTER_WIDTH = 780;
const PREVIEW_WIDTH = 185;

// JPEG data URL of the image scaled down to maxWidth
const scaleImage = (image: ImageBitmap, maxWidth: number): string => {
    const scale = Math.min(1, maxWidth / image.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
};

interface EditMetadataModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: MediaFileModel;
    onSave: () => void;
}

const EditMetadataModal = ({ isOpen, onClose, file, onSave }: EditMetadataModalProps) => {
    const { t } = useI18n();
    const [mediaMetadata, setMediaMetadata] = useState<MovieMetadata>({} as any);

    const [fileTitle, setFileTitle] = useState(file.parsedName);
    const [fileYear, setFileYear] = useState(file.year);

    const [searchKeyword, setSearchKeyword] = useState('');

    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<MovieSearchResult[]>([]);
    const [searched, setSearched] = useState<boolean>(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    // Source of the shown results; Enter in the search field searches it again
    const [provider, setProvider] = useState<MetadataProvider>('kinopoisk');
    // Providers with an API key, the default one first; only these get a search button
    const [providers, setProviders] = useState<MetadataProvider[]>([]);
    const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult | null>(null);
    // Own image picked by clicking the poster; replaces the one of the selected movie
    const [customPoster, setCustomPoster] = useState<CustomPoster | null>(null);
    const posterInputRef = useRef<HTMLInputElement>(null);
    // Other posters of the selected movie; a click on one makes it the poster
    const [posters, setPosters] = useState<PosterImage[]>([]);
    const [isLoadingPosters, setIsLoadingPosters] = useState(false);
    // Movie the posters are loading for, so a late answer for a previous selection is dropped
    const postersFilmRef = useRef<MovieSearchResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        setFileTitle(file.parsedName);
        setFileYear(file.year);
        setSearchKeyword((file.parsedName + ' ' + (file?.year?.toString() || '')).trim());
        setSearchResults([]);
    }, [file]);

    // Search the default provider right away when the modal opens
    useEffect(() => {
        if (!isOpen) return;
        const keyword = (file.parsedName + ' ' + (file?.year?.toString() || '')).trim();
        setSearchKeyword(keyword);
        // The fields start with the saved metadata, so it can be edited (or given an own poster) without a search
        const { posterUrl, posterUrlPreview, ...saved }: Partial<MovieMetadata> = file.metadata ?? {};
        setMediaMetadata({ externalIds: {}, genres: [], countries: [], ratings: [], ...saved, id: file.metadataId } as MovieMetadata);
        setSelectedMovie(null);
        setCustomPoster(null);
        setPosters([]);
        postersFilmRef.current = null;
        window.electron.getMetadataProviders()
            .catch(() => [] as MetadataProvider[])
            .then(keyProviders => {
                setProviders(keyProviders);
                if (keyProviders.length > 0) searchMovies(keyProviders[0], keyword);
            });
    }, [isOpen]);

    // Esc closes the modal, like Cancel
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const searchMovies = async (searchProvider: MetadataProvider = provider, keyword: string = searchKeyword) => {

        try {
            setProvider(searchProvider);
            setSearched(false);
            setSearchError(null);
            setIsSearching(true);

            const films = await window.electron.searchMetadata(searchProvider, keyword);
            setSearchResults(films);

        } catch (error) {
            console.error('Error searching for movies:', error);
            setSearchResults([]);
            setSearchError(String(error));
        } finally {
            setSearched(true);
            setIsSearching(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (providers.includes(provider)) searchMovies();
    };

    const handlePosterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const imageFile = e.target.files?.[0];
        e.target.value = '';
        if (!imageFile) return;
        try {
            const image = await createImageBitmap(imageFile);
            setCustomPoster({ poster: scaleImage(image, POSTER_WIDTH), preview: scaleImage(image, PREVIEW_WIDTH) });
            image.close();
        } catch (error) {
            console.error('Error reading poster image:', error);
            setSaveError(String(error));
        }
    };

    const loadPosters = async (movie: MovieSearchResult) => {
        postersFilmRef.current = movie;
        const ownPoster: PosterImage[] = movie.posterUrl ? [{ url: movie.posterUrl, previewUrl: movie.posterUrlPreview || movie.posterUrl }] : [];
        setPosters(ownPoster);
        setIsLoadingPosters(true);
        try {
            const found = await window.electron.getFilmPosters(movie);
            if (postersFilmRef.current !== movie) return;
            // The movie's own poster first; TMDB lists it again among the others
            const ownPath = (url: string) => url.replace(/^.*\/t\/p\/[^/]+/, '');
            setPosters([...ownPoster, ...found.filter(poster => !ownPoster.some(own => ownPath(own.url) === ownPath(poster.url)))]);
        } catch (error) {
            console.error('Error loading posters:', error);
        } finally {
            if (postersFilmRef.current === movie) setIsLoadingPosters(false);
        }
    };

    const handleSelectPoster = (poster: PosterImage) => {
        setCustomPoster(null);
        setSelectedMovie(movie => movie && { ...movie, posterUrl: poster.url, posterUrlPreview: poster.previewUrl });
    };

    const handleSelectMovie = (movie: MovieSearchResult) => {
        setSelectedMovie(movie);
        setCustomPoster(null);
        loadPosters(movie);
        const isTmdb = movie.source === 'tmdb';
        setMediaMetadata({
            ...mediaMetadata,
            id: file.metadataId,
            externalIds: isTmdb ? { tmdb: movie.filmId } : { kinopoisk: String(movie.filmId) },
            dataSource: isTmdb ? MoveDbMediaSource.TMDB : MoveDbMediaSource.Kinopoisk,
            type: getMediaType(movie),
            title: movie.nameRu || movie.nameEn || t('metadata.noName'),
            year: parseInt(movie.year) || 0,
            description: movie.description || undefined,
            genres: movie.genres?.map((genre) => genre.genre) || [],
            countries: movie.countries?.map(c => c.country) || [],
            ratings: [
                {
                    source: isTmdb ? MoveDbMediaSource.TMDB : MoveDbMediaSource.Kinopoisk,
                    value: parseFloat(movie.rating) || 0,
                    votesCount: movie.ratingVoteCount
                }
            ]
        });
    };

    if (!isOpen) return null;

    const shownPoster = customPoster?.poster || selectedMovie?.posterUrl || file.metadata?.posterUrl;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null);
        if (!mediaMetadata?.id || !mediaMetadata.title) {
            console.warn('Save skipped: no metadata id or title', { mediaMetadata, metadataId: file.metadataId });
            setSaveError(t('metadata.errorSelectFirst'));
            return;
        }
        try {
            setIsSaving(true);
            const result = await window.electron.saveMetadata(mediaMetadata, customPoster ? null : selectedMovie, customPoster);
            console.info('Metadata saved:', result);
            if (result?.posterError) {
                console.error('Poster download failed:', result.posterError);
                setSaveError(t('metadata.errorPoster', { error: result.posterError }));
                onSave();
                return;
            }
            onSave();
            onClose();
        } catch (error) {
            console.error('Error saving metadata:', error);
            setSaveError(t('metadata.errorSave', { error: String(error) }));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] cursor-default"
            >
                <div
                    className="bg-neutral-800 items-center justify-center rounded-lg p-6 w-full max-w-2xl border border-neutral-700 shadow-2xl"
                    onClick={e => e.stopPropagation()}
                >
                    <h3 className="text-xl font-semibold text-white">{t('metadata.title')}</h3>

                    <div className='grid grid-cols-2 gap-4 mb-2'>
                        <div>
                            {t('metadata.fileId', { value: fileTitle })}
                        </div>
                        <div>
                            {t('metadata.fileYear', { value: fileYear ?? '' })}
                        </div>
                    </div>

                    <form onSubmit={handleSearch} className="mb-6">
                        <div className="flex gap-2 items-center">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    className="w-full bg-neutral-700/50 border border-neutral-600 rounded-lg px-4 py-2 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('metadata.searchPlaceholder')}
                                    value={searchKeyword}
                                    name="search_keyword"
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                />
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 h-4 w-4" />
                            </div>
                            {/* One button per provider with a key; the one of the shown results is highlighted */}
                            {METADATA_PROVIDERS.filter(item => providers.includes(item)).map(item => (
                                <button
                                    key={item}
                                    type="button"
                                    disabled={isSearching}
                                    onClick={() => searchMovies(item)}
                                    title={t('metadata.searchIn', { provider: t(item === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk') })}
                                    className={`px-4 py-2 h-[42px] text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-60 ${item === provider ? 'bg-blue-600 hover:bg-blue-700' : 'bg-neutral-600 hover:bg-neutral-500'}`}
                                >
                                    {isSearching && item === provider && <LoaderCircle className="animate-spin h-4 w-4" />}
                                    <span>{t(item === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk')}</span>
                                </button>
                            ))}
                        </div>
                    </form>
                    {searched && searchResults.length > 0 && (
                        <div className="mb-6 max-h-48 overflow-y-auto border border-neutral-700 rounded">
                            {searchResults.map((movie) => (
                                <div
                                    key={`${movie.source}-${movie.type}-${movie.filmId}`}
                                    className="p-2 hover:bg-neutral-700 cursor-pointer"
                                    onClick={() => handleSelectMovie(movie)}
                                >
                                    <div className="flex items-center space-x-3">
                                        {movie.posterUrlPreview && (
                                            <img
                                                src={movie.posterUrlPreview}
                                                alt={movie.nameRu || movie.nameEn || t('metadata.poster')}
                                                className="w-12 h-16 object-cover rounded"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {movie.nameRu || movie.nameEn || t('metadata.noName')}
                                            </p>
                                            <div className="flex items-center text-xs text-neutral-400">
                                                <span>{movie.year}</span>
                                                {movie.rating && movie.rating !== 'null' && (
                                                    <>
                                                        <span className="mx-2">•</span>
                                                        <span className="text-yellow-400">
                                                            {parseFloat(movie.rating).toFixed(1)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {searched && searchResults.length === 0 && (
                        <p className={`text-sm mb-6 break-all ${searchError ? 'text-red-400' : 'text-neutral-400'}`}>
                            {searchError ? t('metadata.searchError', { error: searchError }) : t('metadata.noResults')}
                        </p>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4 border-t border-neutral-700 pt-4">
                        <div className="flex gap-4">
                            {/* Poster of the selected movie; a click picks an own image instead */}
                            <button
                                type="button"
                                onClick={() => posterInputRef.current?.click()}
                                title={t('metadata.posterUpload')}
                                className="group/poster relative w-40 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-neutral-700 border border-neutral-600 hover:border-blue-500 transition-colors"
                            >
                                {shownPoster ? (
                                    <img src={shownPoster} alt={t('metadata.poster')} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-xs text-neutral-400">
                                        <ImagePlus className="h-8 w-8" />
                                        {t('metadata.posterUpload')}
                                    </span>
                                )}
                                {shownPoster && (
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/poster:opacity-100 transition-opacity">
                                        <ImagePlus className="h-8 w-8 text-white" />
                                    </span>
                                )}
                            </button>
                            <input ref={posterInputRef} type="file" accept="image/*" className="hidden" onChange={handlePosterFile} />
                            <div className="flex-1 min-w-0 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1">{t('metadata.fieldTitle')}</label>
                                    <input
                                        type="text"
                                        className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={mediaMetadata?.title ?? ''}
                                        onChange={(e) => setMediaMetadata({ ...mediaMetadata, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1">{t('metadata.fieldYear')}</label>
                                    <input
                                        type="number"
                                        className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={mediaMetadata?.year || ''}
                                        onChange={(e) => setMediaMetadata({ ...mediaMetadata, year: parseInt(e.target.value) || 0 })}
                                        min="1900"
                                        max="2100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1">{t('metadata.fieldGenres')}</label>
                                    <input
                                        type="text"
                                        className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={mediaMetadata?.genres?.join(', ')}
                                        onChange={(e) => setMediaMetadata({ ...mediaMetadata, genres: e.target.value.split(',').map((genre) => genre.trim()) })}
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Posters of the selected movie */}
                        {selectedMovie && (isLoadingPosters || posters.length > 1) && (
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {posters.map(poster => (
                                    <button
                                        key={poster.url}
                                        type="button"
                                        onClick={() => handleSelectPoster(poster)}
                                        className={`w-16 shrink-0 aspect-[2/3] rounded overflow-hidden border-2 transition-colors ${!customPoster && selectedMovie.posterUrl === poster.url ? 'border-blue-500' : 'border-transparent hover:border-neutral-400'}`}
                                    >
                                        <img src={poster.previewUrl} alt={t('metadata.poster')} loading="lazy" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                                {isLoadingPosters && (
                                    <div className="w-16 shrink-0 aspect-[2/3] flex items-center justify-center text-neutral-400">
                                        <LoaderCircle className="animate-spin h-5 w-5" />
                                    </div>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-1">{t('metadata.fieldDescription')}</label>
                            <textarea
                                className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                                value={mediaMetadata?.description || ''}
                                onChange={(e) => setMediaMetadata({ ...mediaMetadata, description: e.target.value })}
                            />
                        </div>

                        {saveError && (
                            <p className="text-sm text-red-400 break-all">{saveError}</p>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-700">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                            >
                                {t('metadata.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-60"
                            >
                                {isSaving && <LoaderCircle className="animate-spin h-4 w-4" />}
                                {t('metadata.save')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default EditMetadataModal;
