import { useEffect, useState } from 'react';
import { MediaFileModel } from '../models/MediaFileModel';
import { Play, List, ChevronLeft, ChevronDown, Search, Pencil } from 'lucide-react';
import { MovieMetadata } from '../models/MediaMetadata';
import { FileProgress } from '../hooks/useWatchProgress';
import EditMetadataModal from './EditMetadataModal';
import { useI18n } from '../i18n/I18nProvider';

interface MediaDetailsCardProps {
    // A movie, or a series with its episodes and seasons
    mediaItem: MediaFileModel;
    getProgress: (filePath: string) => FileProgress | null;
    play: (file: MediaFileModel, useOtherPlayer?: boolean) => void;
}

// Poster, metadata, file information and play buttons of one movie or series
const MediaDetailsCard = ({ mediaItem, getProgress, play }: MediaDetailsCardProps) => {
    const { t } = useI18n();
    const [metaData, setMetaData] = useState<MovieMetadata | null>(null);
    const [fileDurations, setFileDurations] = useState<Record<string, number>>({});

    const [hideFileInformation, setHideFileInformation] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);

    const file = mediaItem.episodes?.[0] ?? mediaItem;

    // MPC history has no reliable duration, so it's probed for files that have progress
    useEffect(() => {
        const files = mediaItem.episodes ?? [mediaItem];
        files.forEach(async (file) => {
            if (!file.fullPath || fileDurations[file.fullPath] !== undefined) return;
            const progress = getProgress(file.fullPath);
            if (!progress || progress.durationSeconds) return;
            const dur = await window.electron.getFileDuration(file.fullPath);
            if (dur) setFileDurations(prev => ({ ...prev, [file.fullPath]: dur }));
        });
    }, [getProgress, mediaItem]);

    const getProgressPercent = (filePath: string): number => {
        const progress = getProgress(filePath);
        if (!progress) return 0;
        const duration = progress.durationSeconds ?? (fileDurations[filePath] ? fileDurations[filePath] / 1000 : 0);
        return duration ? Math.min(100, Math.round((progress.positionSeconds / duration) * 100)) : 0;
    };

    const loadMetadata = async () => {
        if (!file.metadataId) return;
        try {
            const metadata = await window.electron.loadMetadata(file.metadataId);
            if (metadata) {
                // posterUrl carries the file version (?v=mtime), a re-downloaded poster gets a new URL
                setMetaData(metadata);
            }
        } catch (error) {
            console.error('Error loading metadata:', error);
        }
    };

    useEffect(() => {
        loadMetadata();
    }, [file.metadataId]);

    return (
        <div className="bg-neutral-800 rounded-lg p-4 md:p-6 shadow-lg">
            <div className="md:flex gap-6">
                <div className="w-2/3 mx-auto md:mx-0 md:w-1/3 mb-6 md:mb-0">
                    <div className="aspect-[2/3] bg-gradient-to-br from-blue-900 to-purple-900 rounded-lg flex items-center justify-center">
                        {metaData?.posterUrl ? (
                            <img
                                src={metaData.posterUrl}
                                alt={mediaItem.parsedName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    console.warn('Failed to load poster:', target.src);
                                    target.style.display = 'none';
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <span className="text-8xl text-neutral-400">
                                    {mediaItem.type === 'movie' ? '🎬' : '📺'}
                                </span>
                                <button
                                    onClick={() => setShowEditModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <Search className="h-4 w-4" />
                                    {t('details.findPoster')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <h1 className="text-2xl font-bold text-white">
                            {metaData?.title || mediaItem.parsedName}
                        </h1>
                        <div className="flex items-center gap-2 shrink-0">
                            {(metaData?.year || mediaItem.year) && (
                                <span className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded-full text-sm">
                                    {metaData?.year || mediaItem.year}
                                </span>
                            )}
                            <button
                                onClick={() => setShowEditModal(true)}
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-full transition-colors"
                                title={t('home.editMetadata')}
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {mediaItem.quality && (
                            <span className="px-3 py-1 bg-orange-900 text-orange-200 rounded-full text-xs">
                                {mediaItem.quality}
                            </span>
                        )}
                        {mediaItem.resolution && (
                            <span className="px-3 py-1 bg-green-900 text-green-200 rounded-full text-xs">
                                {mediaItem.resolution}
                            </span>
                        )}
                        <span className="px-3 py-1 bg-blue-900 text-blue-200 rounded-full text-xs">
                            {mediaItem.type === 'movie' ? t('common.movie') : t('common.series')}
                        </span>
                    </div>

                    <div className="mt-4 text-neutral-400 line-clamp-3 gap-2 flex flex-wrap rounded-lg">
                        {metaData?.genres.map((genre, index) => (
                            <span key={index} className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded-full text-xs">
                                {genre}
                            </span>
                        ))}
                    </div>

                    <div className="mt-4 text-neutral-400 bg-neutral-900 p-4 rounded-lg overflow-y-auto">
                        {metaData?.description ? metaData.description : (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm">{t('details.noDescription')}</span>
                                <button
                                    onClick={() => setShowEditModal(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 text-neutral-200 text-sm rounded hover:bg-neutral-600 transition-colors"
                                >
                                    <Search className="h-4 w-4" />
                                    {t('details.findDescription')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mt-6">
                        <h3 className="text-sm font-medium text-neutral-300 mb-2 cursor-pointer" onClick={() => { setHideFileInformation(!hideFileInformation) }}>{t('details.fileInformation')} {hideFileInformation ? <ChevronLeft className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />}</h3>
                        <div className="bg-neutral-900 rounded-lg p-4 text-sm" style={{ display: hideFileInformation ? 'none' : 'block' }}>
                            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                                <div>
                                    <p className="text-neutral-400">{t('details.fileName')}</p>
                                    <p className="text-white">{mediaItem.fileName}</p>
                                </div>
                                <div>
                                    <p className="text-neutral-400">{t('details.fileSize')}</p>
                                    <p className="text-white">
                                        {mediaItem.fileSize ? `${(mediaItem.fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB` : t('details.notAvailable')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-neutral-400">{t('details.path')}</p>
                                    <p className="text-neutral-300 break-all">{mediaItem.fullPath}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {mediaItem.type === 'series' ? (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                                <List className="h-5 w-5 text-neutral-400" />
                                <h3 className="text-sm font-medium text-neutral-300">{t('details.episodes')}</h3>
                            </div>
                            <div className="bg-neutral-900 rounded-lg p-4">
                                {mediaItem.seasons && mediaItem.seasons.length > 0 ? (
                                    mediaItem.seasons.map(season => {
                                        const seasonEpisodes = mediaItem.episodes?.filter(ep => ep.season === season) || [];
                                        return (
                                            <div key={`season-${season}`} className="mb-6">
                                                <h3 className="text-lg font-semibold text-white mb-3">
                                                    {t('common.season', { season: season.toString().padStart(2, '0') })}
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                                    {seasonEpisodes
                                                        .sort((a, b) => (a.episode || 0) - (b.episode || 0))
                                                        .map((episode) => (
                                                            <button
                                                                key={episode.id}
                                                                className="p-2 text-neutral-400 hover:text-white"
                                                                title={t('details.playEpisode')}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    play(episode, e.ctrlKey);
                                                                }}
                                                            >
                                                                {(() => {
                                                                    return (
                                                                        <div className="bg-neutral-700 rounded overflow-hidden hover:bg-neutral-600 transition-colors">
                                                                            <div className="p-3">
                                                                                <div className="flex justify-between items-center gap-2">
                                                                                    <div className="min-w-0 text-left">
                                                                                        <h4 className="font-medium text-white">
                                                                                            {episode.episode ? t('details.episode', { episode: episode.episode.toString().padStart(2, '0') }) : t('details.unknownEpisode')}
                                                                                        </h4>
                                                                                        {episode.episodeTitle && (
                                                                                            <p className="text-sm text-neutral-400 truncate" title={episode.episodeTitle}>{episode.episodeTitle}</p>
                                                                                        )}
                                                                                    </div>
                                                                                    <Play className="h-5 w-5 shrink-0" />
                                                                                </div>
                                                                            </div>
                                                                            <div className="h-1 bg-neutral-600 w-full">
                                                                                <div
                                                                                    className="h-1 bg-blue-500"
                                                                                    style={{ width: `${getProgressPercent(episode.fullPath)}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-neutral-400 text-sm">{t('details.noEpisodes')}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8 flex flex-col items-center gap-3">
                            {(() => {
                                return (
                                    <>
                                        <button
                                            onClick={(e) => play(mediaItem, e.ctrlKey)}
                                            className="w-64 bg-neutral-700 rounded overflow-hidden hover:bg-neutral-600 transition-colors cursor-pointer"
                                        >
                                            <div className="px-6 py-5 flex justify-between items-center">
                                                <h4 className="font-medium text-white text-base">{t('details.playMovie')}</h4>
                                                <Play className="h-6 w-6 text-white" />
                                            </div>
                                            <div className="h-1 bg-neutral-600 w-full">
                                                <div
                                                    className="h-1 bg-blue-500"
                                                    style={{ width: `${getProgressPercent(mediaItem.fullPath)}%` }}
                                                />
                                            </div>
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
            <EditMetadataModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                file={file}
                onSave={loadMetadata}
            />
        </div>
    );
};

export default MediaDetailsCard;
