import { MediaFileModel, MediaType } from "../models/MediaFileModel";
import { useWatchProgress } from "../hooks/useWatchProgress";
import { Check, Layers } from "lucide-react";
import { useI18n } from '../i18n/I18nProvider';

interface FileListCardProps {
    item: MediaFileModel;
    isGrouped?: boolean;
}

const FileListCard = ({ item, isGrouped = false }: FileListCardProps) => {
    const { t } = useI18n();
    const file = isGrouped && item.episodes?.[0] ? item.episodes[0] : item;
    const { getProgress } = useWatchProgress(30000);
    // User groups (home page) these files belong to
    const groupNames = Array.from(new Set((isGrouped && item.episodes ? item.episodes : [file])
        .map(f => f.groupName)
        .filter((name): name is string => !!name)));

    return (
        <div className="bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 overflow-hidden shadow-sm hover:shadow-md transition-all">
            <div className="p-4 pb-2">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-neutral-100">
                                {file.parsedName}
                            </h3>
                            {isGrouped && item.seasons && item.seasons.length > 0 ? (
                                Array.from(item.seasons).sort((a, b) => a - b).map(season => (
                                    <span
                                        key={`season-${season}`}
                                        className="px-2 py-1 rounded text-xs bg-indigo-900 text-indigo-200 flex-shrink-0"
                                    >
                                        S{season.toString().padStart(2, '0')}
                                    </span>
                                ))
                            ) : file.season !== undefined && (
                                <span className="px-2 py-1 rounded text-xs bg-indigo-900 text-indigo-200 flex-shrink-0">
                                    S{file.season.toString().padStart(2, '0')}
                                </span>
                            )}
                            {groupNames.map(name => (
                                <span
                                    key={name}
                                    className="px-2 py-1 rounded text-xs bg-neutral-700 text-neutral-300 flex items-center gap-1 min-w-0"
                                    title={t('files.inGroup', { name })}
                                >
                                    <Layers className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{name}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {file.resolution && (
                            <span className="px-2 py-1 rounded text-xs bg-green-900 text-green-200">
                                {file.resolution}
                            </span>
                        )}
                        {file.quality && (
                            <span className="px-2 py-1 rounded text-xs bg-orange-900 text-orange-200">
                                {file.quality}
                            </span>
                        )}
                        {file.year && (
                            <span className="px-2 py-1 rounded text-xs bg-neutral-700 text-neutral-300">
                                {file.year}
                            </span>
                        )}
                        {!isGrouped && (() => {
                            const progress = getProgress(file.fullPath);
                            if (progress) {
                                return (
                                    <span className="px-2 py-1 rounded text-xs bg-green-900 text-green-200 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        {progress.formattedTime}
                                    </span>
                                );
                            }
                            return null;
                        })()}
                        <span className={`px-2 py-1 rounded text-xs ${file.type === MediaType.Movie
                            ? 'bg-blue-900 text-blue-200'
                            : 'bg-purple-900 text-purple-200'
                            }`}>
                            {file.type === MediaType.Movie ? t('common.movie') : t('common.series')}
                        </span>
                    </div>
                </div>
            </div>

            {isGrouped && item.episodes && (
                <div className="px-4 pb-2">
                    <div className="text-xs text-neutral-400 mb-1">
                        {t('files.episodes', { count: item.episodes.length })}
                    </div>
                    {Array.from(
                        item.episodes.reduce((seasons, ep) => {
                            const season = ep.season ?? 1;
                            if (!seasons.has(season)) {
                                seasons.set(season, []);
                            }
                            seasons.get(season)?.push(ep);
                            return seasons;
                        }, new Map<number, MediaFileModel[]>())
                    ).sort(([seasonA], [seasonB]) => seasonA - seasonB).map(([season, episodes]) => (
                        <div key={`season-${season}`} className="mb-2">
                            <div className="text-xs font-medium text-neutral-300 mb-1">
                                {t('common.season', { season: season.toString().padStart(2, '0') })}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {episodes
                                    .sort((a, b) => (a.episode || 0) - (b.episode || 0))
                                    .map((ep) => {
                                        const progress = getProgress(ep.fullPath);
                                        const isWatched = !!progress;
                                        return (
                                            <div key={ep.id} className="flex flex-col gap-1">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                                                        isWatched
                                                            ? 'bg-green-900 text-green-200'
                                                            : 'bg-neutral-700 text-neutral-300'
                                                    }`}
                                                    title={`S${ep.season?.toString().padStart(2, '0')}E${ep.episode?.toString().padStart(2, '0')} - ${ep.parsedName}${progress ? ` - ${progress.formattedTime}` : ''}`}
                                                >
                                                    {isWatched && <Check className="w-3 h-3" />}
                                                    E{ep.episode?.toString().padStart(2, '0')}
                                                </span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="px-4 pb-3">
                <div className="text-xs text-neutral-400 mb-1">
                    {file.subFolder || t('files.rootFolder')}
                </div>
                {!isGrouped && (
                    <div 
                        className="text-xs text-neutral-500 break-words line-clamp-2 break-all" 
                        title={file.fullPath}
                    >
                        {file.fullPath}
                    </div>
                )}
            </div>

            <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-700 flex justify-between items-center">
                <div className="text-xs text-neutral-500">
                    {isGrouped && item.episodes
                        ? `${t('files.fileCount', { count: item.episodes.length })}, ${(item.episodes.reduce((sum, ep) => sum + (ep.fileSize || 0), 0) / (1024 * 1024 * 1024)).toFixed(1)
                        } GB`
                        : file.fileSize && `${(file.fileSize / (1024 * 1024 * 1024)).toFixed(1)} GB`
                    }
                </div>
            </div>
        </div>
    );
};

export default FileListCard;
