import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, LoaderCircle, Star, X } from 'lucide-react';
import { MetadataProvider, NewsItem } from '../../shared/metadataApi';
import { MovieSearchResult } from '../models/MovieSearchResult';
import { useI18n } from '../i18n/I18nProvider';
import CustomLinkButtons, { LINK_PILL_CLASS } from './CustomLinkButtons';

export const isNewsItemMovie = (item: MovieSearchResult) => item.type === 'FILM' || item.type === 'VIDEO';

export const getNewsItemTitle = (item: NewsItem) => item.nameRu || item.nameEn || '';

// The title's page on a provider: its own one, or a search by title on the other
export const getNewsItemUrl = (item: NewsItem, provider: MetadataProvider = item.source ?? 'kinopoisk') => {
    const query = encodeURIComponent(getNewsItemTitle(item));
    if (provider === 'tmdb') {
        return item.source === 'tmdb'
            ? `https://www.themoviedb.org/${isNewsItemMovie(item) ? 'movie' : 'tv'}/${item.filmId}`
            : `https://www.themoviedb.org/search?query=${query}`;
    }
    return item.source === 'tmdb'
        ? `https://www.kinopoisk.ru/index.php?kp_query=${query}`
        : `https://www.kinopoisk.ru/film/${item.filmId}/`;
};

// Details fill in what the list item lacks (description, genres); empty values don't overwrite
const mergeDetails = (item: NewsItem, details: MovieSearchResult | null): NewsItem => {
    if (!details) return item;
    const filled = Object.entries(details).filter(([, value]) =>
        value != null && value !== '' && value !== 'null' && !(Array.isArray(value) && value.length === 0));
    return { ...item, ...Object.fromEntries(filled) };
};

interface NewsItemModalProps {
    item: NewsItem;
    // An episode or movie file of this title in the library
    libraryFileId?: string;
    onClose: () => void;
}

const NewsItemModal = ({ item, libraryFileId, onClose }: NewsItemModalProps) => {
    const { t, language } = useI18n();
    const navigate = useNavigate();
    const [film, setFilm] = useState(item);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isCurrent = true;
        window.electron.getFilmDetails(item)
            .then(details => isCurrent && setFilm(mergeDetails(item, details)))
            .catch(error => console.error('Error loading film details:', error))
            .finally(() => isCurrent && setIsLoading(false));
        return () => { isCurrent = false; };
    }, [item]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const title = getNewsItemTitle(film);
    const rating = parseFloat(film.rating);
    const providerName = t(film.source === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk');
    const minutes = /^\d+$/.test(film.filmLength) ? parseInt(film.filmLength) : 0;
    const facts = [
        film.releaseDate
            ? new Date(film.releaseDate).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })
            : film.year,
        isNewsItemMovie(film) ? t('common.movie') : t('common.series'),
        minutes ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}` : '',
        film.countries.map(c => c.country).join(', '),
    ].filter(Boolean);

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="relative bg-neutral-800 rounded-lg p-8 w-full max-w-5xl max-h-full overflow-y-auto border border-neutral-700 shadow-2xl flex flex-col sm:flex-row gap-8"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-full transition-colors"
                    aria-label={t('common.close')}
                    title={t('common.close')}
                >
                    <X className="h-5 w-5" />
                </button>

                <img
                    src={film.posterUrl || film.posterUrlPreview}
                    alt=""
                    className="w-72 shrink-0 self-center sm:self-start aspect-[2/3] object-cover rounded bg-neutral-700"
                />

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-6 pr-8">
                        <div className="min-w-0">
                            <h2 className="text-3xl font-bold text-white">{title}</h2>
                            {film.nameEn && film.nameEn !== title && (
                                <p className="text-sm text-neutral-400">{film.nameEn}</p>
                            )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap justify-end gap-2 shrink-0 max-w-[50%]">
                            <a
                                href={getNewsItemUrl(film)}
                                target="_blank"
                                rel="noreferrer"
                                title={[t('details.openOn', { provider: providerName }), film.ratingVoteCount > 0 ? t('details.votes', { count: film.ratingVoteCount.toLocaleString(language) }) : '']
                                    .filter(Boolean).join(' · ')}
                                className={LINK_PILL_CLASS}
                            >
                                {rating > 0 && (
                                    <>
                                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                                        <span className="font-medium text-white">{rating.toFixed(1)}</span>
                                    </>
                                )}
                                <span>{providerName}</span>
                                <ExternalLink className="h-3 w-3 text-neutral-500" />
                            </a>
                            <CustomLinkButtons title={title} />
                        </div>
                    </div>
                    <p className="mt-2 text-sm text-neutral-300">{facts.join(' · ')}</p>

                    {film.genres.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {film.genres.map(({ genre }) => (
                                <span key={genre} className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded-full text-xs">
                                    {genre}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 text-base leading-relaxed text-neutral-400 bg-neutral-900 p-5 rounded-lg">
                        {film.description || (isLoading
                            ? <LoaderCircle className="h-4 w-4 animate-spin" />
                            : t('details.noDescription'))}
                    </div>

                    {libraryFileId && (
                        <button
                            onClick={() => navigate(`/media/${libraryFileId}`)}
                            className="mt-4 px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors"
                        >
                            {t('news.openInLibrary')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewsItemModal;
