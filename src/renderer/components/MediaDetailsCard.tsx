import { useEffect, useState } from 'react';
import { MediaFileModel } from '../models/MediaFileModel';
import { Play, Search, Pencil, Star, ExternalLink, Info } from 'lucide-react';
import { MovieMetadata } from '../models/MediaMetadata';
import { getProviderFilmUrl } from '../../shared/metadataApi';
import { FileProgress } from '../hooks/useWatchProgress';
import EditMetadataModal from './EditMetadataModal';
import { useI18n } from '../i18n/I18nProvider';
import CustomLinkButtons, { LINK_PILL_CLASS } from './CustomLinkButtons';
import BackdropImage from './BackdropImage';
import CreditsList from './CreditsList';
import FileInfoModal from './FileInfoModal';
import EpisodePlayButton from './EpisodePlayButton';

const GLASS_PILL_CLASS = 'px-3 py-1 bg-neutral-900/60 border border-white/10 text-neutral-100 backdrop-blur-md rounded-full';
const ICON_BUTTON_CLASS = 'p-1.5 text-neutral-200 bg-neutral-900/60 border border-white/10 backdrop-blur-md hover:text-white hover:bg-neutral-700/80 rounded-full transition-colors';

interface PlayTileProps {
    title: string;
    // Watched part, 0-100
    progress: number;
    onPlay: (e: React.MouseEvent) => void;
}

const PlayTile = ({ title, progress, onPlay }: PlayTileProps) => (
    <button
        onClick={onPlay}
        className="group w-full text-left bg-neutral-900/60 border border-white/10 backdrop-blur-md hover:bg-neutral-700/80 hover:border-white/25 rounded-lg overflow-hidden transition-colors"
    >
        <div className="px-6 py-5 flex justify-center items-center gap-3">
            <Play className="h-7 w-7 shrink-0 text-neutral-300 group-hover:text-white transition-colors" />
            <h4 className="text-xl font-medium text-white">{title}</h4>
        </div>
        <div className="h-1 bg-white/10">
            <div className="h-1 bg-blue-500" style={{ width: `${progress}%` }} />
        </div>
    </button>
);

interface MediaDetailsCardProps {
    mediaItem: MediaFileModel;
    getProgress: (filePath: string) => FileProgress | null;
    play: (file: MediaFileModel, useOtherPlayer?: boolean) => void;
    clearProgress?: (filePaths: string[]) => void;
    showBackdrop?: boolean;
}

const MediaDetailsCard = ({ mediaItem, getProgress, play, clearProgress, showBackdrop = true }: MediaDetailsCardProps) => {
    const { t, language } = useI18n();
    const [metaData, setMetaData] = useState<MovieMetadata | null>(null);
    const [fileDurations, setFileDurations] = useState<Record<string, number>>({});

    const [showFileInfo, setShowFileInfo] = useState(false);
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
                setMetaData(metadata);
                const isMissingDetails = (!metadata.backdropUrl && !metadata.noBackdrop) || !metadata.actors;
                if (isMissingDetails && (metadata.externalIds?.tmdb || metadata.externalIds?.kinopoisk)) {
                    const found = await window.electron.loadMissingDetails(file.metadataId);
                    if (found) setMetaData(await window.electron.loadMetadata(file.metadataId));
                }
            }
        } catch (error) {
            console.error('Error loading metadata:', error);
        }
    };

    useEffect(() => {
        loadMetadata();
    }, [file.metadataId]);

    const providerUrl = metaData ? getProviderFilmUrl(metaData, mediaItem.type === 'series' ? 'series' : 'movie') : null;
    const providerName = t(metaData?.externalIds?.kinopoisk ? 'api.providerKinopoisk' : 'api.providerTmdb');
    const rating = metaData?.ratings?.[0];

    return (
        <div className="relative pb-4 md:pb-6">
            {showBackdrop && <BackdropImage url={metaData?.backdropUrl} fullScreen />}
            <div className="relative flex gap-6 md:gap-8">
                <div className="flex-1 min-w-0">
                    <div className="flex gap-4 md:gap-8 min-h-[calc(100dvh-7.5rem)]">
                        <div className="h-[60dvh] min-h-80 max-w-[40%] aspect-[2/3] shrink-0">
                            <div className="h-full bg-gradient-to-br from-blue-900 to-purple-900 rounded-lg overflow-hidden shadow-2xl shadow-black/60 flex items-center justify-center">
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
                                    <div className="flex flex-col items-center gap-3 px-2">
                                        <span className="text-5xl text-neutral-400">
                                            {mediaItem.type === 'movie' ? '🎬' : '📺'}
                                        </span>
                                        <button
                                            onClick={() => setShowEditModal(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Search className="h-4 w-4" />
                                            {t('details.findPoster')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 max-w-4xl mx-auto flex flex-col">
                            <div className="flex justify-between items-start gap-4">
                                <h1 className="text-2xl font-bold text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
                                    {metaData?.title || mediaItem.parsedName}
                                </h1>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {mediaItem.quality && (
                                        <span className="px-3 py-1 bg-orange-950/70 border border-orange-400/30 text-orange-200 backdrop-blur-md rounded-full text-xs">
                                            {mediaItem.quality}
                                        </span>
                                    )}
                                    {mediaItem.resolution && (
                                        <span className="px-3 py-1 bg-green-950/70 border border-green-400/30 text-green-200 backdrop-blur-md rounded-full text-xs">
                                            {mediaItem.resolution}
                                        </span>
                                    )}
                                    <span className="px-3 py-1 bg-blue-950/70 border border-blue-400/30 text-blue-200 backdrop-blur-md rounded-full text-xs">
                                        {mediaItem.type === 'movie' ? t('common.movie') : t('common.series')}
                                    </span>
                                    {providerUrl && (
                                        <a
                                            href={providerUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={[t('details.openOn', { provider: providerName }), rating?.votesCount ? t('details.votes', { count: rating.votesCount.toLocaleString(language) }) : '']
                                                .filter(Boolean).join(' · ')}
                                            className={LINK_PILL_CLASS}
                                        >
                                            {rating?.value ? (
                                                <>
                                                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                                                    <span className="font-medium text-white">{rating.value.toFixed(1)}</span>
                                                </>
                                            ) : null}
                                            <span>{providerName}</span>
                                            <ExternalLink className="h-3 w-3 text-neutral-500" />
                                        </a>
                                    )}
                                    <CustomLinkButtons title={metaData?.title || mediaItem.parsedName} />
                                    <button
                                        onClick={() => setShowFileInfo(true)}
                                        className={ICON_BUTTON_CLASS}
                                        title={t('details.fileInformation')}
                                    >
                                        <Info className="h-4 w-4" />
                                    </button>
                                    {(metaData?.year || mediaItem.year) && (
                                        <span className={`${GLASS_PILL_CLASS} text-sm`}>
                                            {metaData?.year || mediaItem.year}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setShowEditModal(true)}
                                        className={ICON_BUTTON_CLASS}
                                        title={t('home.editMetadata')}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 text-neutral-400 line-clamp-3 gap-2 flex flex-wrap rounded-lg xl:hidden">
                                {metaData?.genres.map((genre, index) => (
                                    <span key={index} className={`${GLASS_PILL_CLASS} text-xs`}>
                                        {genre}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-4 text-neutral-100 [text-shadow:0_1px_3px_rgb(0_0_0/0.9),0_0_12px_rgb(0_0_0/0.6)]">
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

                            {/* Centred in the space between the bottom of the poster (60dvh) and the bottom of the window */}
                            <div className="mt-auto pt-6 min-h-[calc(40dvh-7.5rem)] flex items-center justify-center">
                                <div className="w-96 max-w-full">
                                    {mediaItem.type !== 'series' ? (
                                        <PlayTile
                                            title={t('details.playMovie')}
                                            progress={getProgressPercent(mediaItem.fullPath)}
                                            onPlay={(e) => play(mediaItem, e.ctrlKey)}
                                        />
                                    ) : mediaItem.episodes?.length ? (
                                        <EpisodePlayButton episodes={mediaItem.episodes} getProgress={getProgress} getProgressPercent={getProgressPercent} play={play} clearProgress={clearProgress} />
                                    ) : (
                                        <p className="text-center text-neutral-400 text-sm">{t('details.noEpisodes')}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="xl:hidden">
                        <CreditsList directors={metaData?.directors} actors={metaData?.actors} />
                    </div>
                </div>

                {(metaData?.genres?.length || metaData?.directors?.length || metaData?.actors?.length) ? (
                    <div className="hidden xl:block w-72 shrink-0 h-[60dvh] min-h-80">
                        <CreditsList genres={metaData?.genres} directors={metaData?.directors} actors={metaData?.actors} layout="column" />
                    </div>
                ) : null}
            </div>

            <EditMetadataModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                file={file}
                onSave={loadMetadata}
            />
            {showFileInfo && <FileInfoModal file={mediaItem} onClose={() => setShowFileInfo(false)} />}
        </div>
    );
};

export default MediaDetailsCard;
