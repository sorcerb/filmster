import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { useWatchProgress } from '../hooks/useWatchProgress';
import MediaDetailsCard from '../components/MediaDetailsCard';
import BackEdgeButton from '../components/BackEdgeButton';
import { useI18n } from '../i18n/I18nProvider';
import { compareGroupMembers, getMediaTitle } from '../utils/mediaGroups';

const withEpisodes = (item: MediaFileModel, episodes: MediaFileModel[]): MediaFileModel => {
    const seasons = Array.from(new Set(episodes.map(ep => ep.season ?? 1))).sort((a, b) => a - b);
    const episodesBySeason: Record<number, MediaFileModel[]> = {};
    episodes.forEach(ep => {
        (episodesBySeason[ep.season ?? 1] ??= []).push(ep);
    });
    return { ...item, episodes, seasons, episodesBySeason };
};

const splitGroup = (files: MediaFileModel[]): MediaFileModel[] => {
    const series = new Map<string, MediaFileModel[]>();
    const items: MediaFileModel[] = [];
    files.forEach(file => {
        if (file.type === MediaType.Series) {
            if (!series.has(file.parsedName)) series.set(file.parsedName, []);
            series.get(file.parsedName)!.push(file);
        } else {
            items.push(file);
        }
    });
    series.forEach(episodes => items.push(withEpisodes(episodes[0], episodes)));
    return items.sort(compareGroupMembers);
};

const MediaDetails = () => {
    const { t } = useI18n();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [mediaItems, setMediaItems] = useState<MediaFileModel[]>([]);
    const [groupName, setGroupName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { getProgress, play } = useWatchProgress(10000);

    const loadMediaItem = async () => {
        try {
            if (!id) return;
            const item = await window.electron.getMediaFile(id);
            if (!item) return;

            if (item.groupId) {
                const files = (await window.electron.getMediaFiles())
                    .filter(file => file.groupId === item.groupId)
                    .sort(compareGroupMembers);
                setGroupName(item.groupName || getMediaTitle(files[0]));
                setMediaItems(splitGroup(files));
            } else if (item.type === MediaType.Series) {
                const episodes = (await window.electron.getMediaFiles()).filter(file =>
                    file.type === MediaType.Series &&
                    !file.groupId &&
                    file.parsedName === item.parsedName
                );
                setMediaItems([withEpisodes(item, episodes)]);
            } else {
                setMediaItems([item]);
            }
        } catch (error) {
            console.error('Error loading media item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadMediaItem();
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (mediaItems.length === 0) {
        return (
            <div className="text-center py-10">
                <h2 className="text-xl font-medium text-neutral-200">{t('common.mediaNotFound')}</h2>
                <p className="text-neutral-400 mt-2">{t('common.mediaNotFoundText')}</p>
                <button
                    onClick={() => navigate(-1)}
                    className="mt-4 px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-600 transition-colors"
                >
                    {t('common.goBack')}
                </button>
            </div>
        );
    }

    return (
        <div className="pl-14 pr-4 md:px-10 xl:px-16 py-2 md:py-4">
            <BackEdgeButton label={t('details.backToLibrary')} />

            {groupName && (
                <h1 className="text-2xl font-bold text-white mb-4">{groupName}</h1>
            )}

            <div className="flex flex-col gap-6">
                {mediaItems.map((item, index) => (
                    <MediaDetailsCard key={item.id} mediaItem={item} getProgress={getProgress} play={play} showBackdrop={index === 0} />
                ))}
            </div>
        </div>
    );
};

export default MediaDetails;
