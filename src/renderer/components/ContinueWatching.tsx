import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { LibraryFileProgress } from '../models/WatchProgressModel';
import { ContinueWatchingEntry, getContinueWatching } from '../utils/continueWatching';
import { getMediaTitle } from '../utils/mediaGroups';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useI18n } from '../i18n/I18nProvider';

const formatEpisode = (file: MediaFileModel) =>
    `S${String(file.season ?? 1).padStart(2, '0')}E${String(file.episode).padStart(2, '0')}`;

// Started movies and series on top of the home page; a click plays right away
const ContinueWatching = ({ items }: { items: MediaFileModel[] }) => {
    const { t } = useI18n();
    const { play } = useWatchProgress(60000);
    const [progress, setProgress] = useState<Record<string, LibraryFileProgress>>({});

    // Watching in MPC-HC happens outside the app: reload when the window gets focus back
    useEffect(() => {
        // MPC-HC history has no duration: probe it once per file (the main process caches it), then reload
        const probedPaths = new Set<string>();
        const probeDurations = async (loaded: Record<string, LibraryFileProgress>) => {
            const paths = Object.entries(loaded)
                .filter(([path, fileProgress]) => !fileProgress.duration && !fileProgress.isCompleted && !probedPaths.has(path))
                .map(([path]) => path);
            if (!paths.length) return;
            paths.forEach(path => probedPaths.add(path));
            const durations = await Promise.all(paths.map(path => window.electron.getFileDuration(path).catch(() => null)));
            if (durations.some(Boolean)) load();
        };

        // Only the selected player's progress: the other one's would be resumed in the wrong player
        const load = () => window.electron.getPlayerType()
            .then(player => window.electron.getLibraryProgress(player))
            .then(loaded => {
                setProgress(loaded);
                probeDurations(loaded);
            })
            .catch(error => console.error('Error loading watch progress:', error));
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') load();
        };
        load();
        window.addEventListener('focus', load);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', load);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    const entries = useMemo(() => getContinueWatching(items, progress), [items, progress]);

    if (entries.length === 0) return null;

    const getTitle = ({ item, file }: ContinueWatchingEntry) =>
        // A group member is shown as itself (e.g. the second part), not as the group
        item.groupId ? getMediaTitle(file) : item.groupName || item.metadata?.title || item.parsedName;

    const getSubtitle = ({ file, progress: fileProgress, isNext }: ContinueWatchingEntry) => {
        const parts: string[] = [];
        if (file.type === MediaType.Series && file.episode) {
            parts.push(isNext ? t('home.nextEpisode', { episode: formatEpisode(file) }) : formatEpisode(file));
        } else if (isNext) {
            parts.push(t('home.nextInGroup'));
        }
        if (fileProgress?.duration) {
            const minutesLeft = Math.max(1, Math.round((fileProgress.duration - fileProgress.position) / 60));
            parts.push(minutesLeft >= 60
                ? t('home.timeLeftHours', { hours: Math.floor(minutesLeft / 60), minutes: minutesLeft % 60 })
                : t('home.timeLeftMinutes', { minutes: minutesLeft }));
        }
        return parts.join(' · ');
    };

    return (
        <div className="mt-4">
            <h2 className="text-sm font-medium text-neutral-300 mb-2">{t('home.continueWatching')}</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
                {entries.map(entry => {
                    const { item, file, progress: fileProgress } = entry;
                    const posterUrl = file.metadata?.posterUrlPreview || item.metadata?.posterUrlPreview;
                    const percent = fileProgress?.duration ? Math.min(100, (fileProgress.position / fileProgress.duration) * 100) : 0;
                    const subtitle = getSubtitle(entry);
                    return (
                        <button
                            key={file.id}
                            className="group shrink-0 w-28 text-left"
                            onClick={(e) => play(file, e.ctrlKey)}
                        >
                            <div className="relative aspect-[2/3] rounded overflow-hidden bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
                                {posterUrl ? (
                                    <img src={posterUrl} alt="" draggable={false} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-3xl text-neutral-400">{file.type === MediaType.Movie ? '🎬' : '📺'}</span>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play className="h-8 w-8 text-white" />
                                </div>
                                {percent > 0 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                                        <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
                                    </div>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-neutral-100 truncate">{getTitle(entry)}</p>
                            {subtitle && <p className="text-[11px] text-neutral-400 truncate">{subtitle}</p>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ContinueWatching;
