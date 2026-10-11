import { useEffect, useState } from "react";
import { MediaFileModel, MediaType } from "../models/MediaFileModel";
import { LoaderCircle, RefreshCcw } from "lucide-react";
import FileListCard from "../components/FileListCard";
import BackEdgeButton from "../components/BackEdgeButton";
import { useI18n } from '../i18n/I18nProvider';
import { getGroupNames } from '../utils/mediaGroups';


const withGroupNames = (files: MediaFileModel[]): MediaFileModel[] => {
    const names = getGroupNames(files);
    return files.map(file => file.groupId ? { ...file, groupName: names.get(file.groupId) } : file);
};

const Files = () => {
    const { t } = useI18n();
    const [mediaFiles, setMediaFiles] = useState<MediaFileModel[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | MediaType>('all');
    const [grouped, setGrouped] = useState(true);

    const loadMediaFiles = async () => {
        setIsLoading(true);
        try {
            setMediaFiles(withGroupNames(await window.electron.getMediaFiles()));
        } catch (error) {
            console.error('Error scanning media files:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanClick = async () => {
        setIsLoading(true);
        try {
            await window.electron.scanMediaFiles();
            // The scan result is the raw file list, without groups and metadata
            setMediaFiles(withGroupNames(await window.electron.getMediaFiles()));
        } catch (error) {
            console.error('Error scanning media files:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadMediaFiles();
    }, []);

    const groupedFiles = mediaFiles.reduce((acc, file) => {
        if (file.type === MediaType.Series) {
            const key = file.parsedName;
            if (!acc[key]) {
                acc[key] = {
                    ...file,
                    episodes: [],
                    seasons: new Set<number>()
                };
            }
            if (file.season !== undefined) {
                acc[key].seasons.add(file.season);
            }
            acc[key].episodes.push(file);
        } else {
            acc[file.id] = file;
        }
        return acc;
    }, {} as Record<string, any>);

    const groupedItems = grouped ? Object.values(groupedFiles).map(item => ({
        ...item,
        seasons: item.seasons ? Array.from(item.seasons) : undefined
    })) as MediaFileModel[] : mediaFiles;

    const movieCount = grouped ? groupedItems.filter(f => f.type === MediaType.Movie).length : mediaFiles.filter(f => f.type === MediaType.Movie).length;
    const seriesCount = grouped ? groupedItems.filter(f => f.type === MediaType.Series).length : mediaFiles.filter(f => f.type === MediaType.Series).length;

    const displayItems = filter === 'all'
        ? groupedItems
        : groupedItems.filter(f => f.type === filter);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="pl-12 md:pl-8">
            <BackEdgeButton label={t('common.goBack')} />
            <div className="h-12 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl text-neutral-100">{t('files.title')}</h1>
                    <button onClick={loadMediaFiles}><RefreshCcw className="h-5 w-5" /></button>
                </div>
                
                <div className="flex gap-4">
                    <label htmlFor="grouped" className="flex items-center gap-2 me-5 cursor-pointer hover:bg-neutral-800 rounded-lg p-3">
                        <input type="checkbox" id="grouped" className="cursor-pointer" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                        {t('files.grouped')}
                    </label>
                    <button
                        className="px-4 py-1 bg-zinc-500 text-white rounded-lg hover:bg-zinc-400 disabled:opacity-50"
                        onClick={handleScanClick}
                        disabled={isLoading}
                    >
                        {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : t('files.scan')}
                    </button>
                </div>
            </div>

            <div className="mt-4 flex gap-2">
                <button
                    className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                    onClick={() => setFilter('all')}
                >
                    {t('common.filterAll', { count: displayItems.length })}
                </button>
                <button
                    className={`px-3 py-1 rounded ${filter === MediaType.Movie ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                    onClick={() => setFilter(MediaType.Movie)}
                >
                    {t('common.filterMovies', { count: movieCount })}
                </button>
                <button
                    className={`px-3 py-1 rounded ${filter === MediaType.Series ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-400'}`}
                    onClick={() => setFilter(MediaType.Series)}
                >
                    {t('common.filterSeries', { count: seriesCount })}
                </button>
            </div>

            <div className="mt-5 text-xs">
                {displayItems.length === 0 ? (
                    <p className="text-neutral-400">{t('common.noMediaFiles')}</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {displayItems.map((item) => (
                            <FileListCard
                                key={item.id}
                                item={item}
                                isGrouped={grouped && item.episodes && item.episodes.length > 0}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Files;