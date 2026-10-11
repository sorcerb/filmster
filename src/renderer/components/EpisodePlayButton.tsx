import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal, Play, RotateCcw } from 'lucide-react';
import { MediaFileModel } from '../models/MediaFileModel';
import { useI18n } from '../i18n/I18nProvider';
import { FileProgress } from '../hooks/useWatchProgress';
import ConfirmModal from './ConfirmModal';

interface EpisodePlayButtonProps {
    episodes: MediaFileModel[];
    getProgress: (filePath: string) => FileProgress | null;
    getProgressPercent: (filePath: string) => number;
    play: (file: MediaFileModel, useOtherPlayer?: boolean) => void;
    clearProgress?: (filePaths: string[]) => void;
}

const pad = (n: number) => n.toString().padStart(2, '0');

const sortEpisodes = (episodes: MediaFileModel[]) =>
    [...episodes].sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 0) - (b.episode ?? 0));

const EpisodePlayButton = ({ episodes, getProgress, getProgressPercent, play, clearProgress }: EpisodePlayButtonProps) => {
    const { t } = useI18n();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [seasonMenu, setSeasonMenu] = useState<number | null>(null);
    const [confirmSeason, setConfirmSeason] = useState<number | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const sorted = sortEpisodes(episodes);

    // Until one is picked: the episode watched most recently (not the furthest one: another viewer may start over),
    // or the next one if it was watched to the end
    const defaultEpisode = (() => {
        let lastIndex = -1;
        let lastWatched = '';
        sorted.forEach((ep, index) => {
            const watched = getProgress(ep.fullPath)?.lastWatched ?? '';
            if (watched > lastWatched) {
                lastWatched = watched;
                lastIndex = index;
            }
        });
        if (lastIndex < 0) return sorted[0];
        const last = sorted[lastIndex];
        const isFinished = getProgress(last.fullPath)?.isCompleted || getProgressPercent(last.fullPath) >= 90;
        return isFinished && sorted[lastIndex + 1] ? sorted[lastIndex + 1] : last;
    })();
    const selected = sorted.find(ep => ep.id === selectedId) ?? defaultEpisode;

    useEffect(() => {
        if (!isOpen || confirmSeason !== null) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
            if (!(e.target as Element).closest?.('[data-season-menu]')) setSeasonMenu(null);
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, confirmSeason]);

    if (!selected) return null;

    const episodeLabel = (ep: MediaFileModel) =>
        ep.episode ? t('details.episode', { episode: pad(ep.episode) }) : t('details.unknownEpisode');
    const seasons = Array.from(new Set(sorted.map(ep => ep.season ?? 1)));
    const progress = getProgressPercent(selected.fullPath);

    return (
        <div ref={rootRef} className="relative">
            {clearProgress && confirmSeason !== null && (
                <ConfirmModal
                    title={t('details.resetSeasonConfirm', { season: pad(confirmSeason) })}
                    text={t('details.resetSeasonConfirmText')}
                    confirmLabel={t('details.reset')}
                    onConfirm={() => {
                        clearProgress(sorted.filter(ep => (ep.season ?? 1) === confirmSeason).map(ep => ep.fullPath));
                        setConfirmSeason(null);
                    }}
                    onCancel={() => setConfirmSeason(null)}
                />
            )}
            {isOpen && (
                <div className="thin-scrollbar absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[min(64rem,85vw)] max-h-[60vh] overflow-y-auto p-4 space-y-5 bg-neutral-900/95 border border-white/10 backdrop-blur-md rounded-lg shadow-2xl z-20">
                    {seasons.map(season => (
                        <div key={season}>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <h3 className="text-lg font-semibold text-white">{t('common.season', { season: pad(season) })}</h3>
                                {clearProgress && (
                                    <div data-season-menu className="relative">
                                        <button
                                            onClick={() => setSeasonMenu(menu => menu === season ? null : season)}
                                            title={t('details.moreActions')}
                                            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <MoreHorizontal className="h-5 w-5" />
                                        </button>
                                        {seasonMenu === season && (
                                            <div className="absolute right-0 top-full mt-1 py-1 min-w-max bg-neutral-800 border border-white/10 rounded-lg shadow-xl z-10">
                                                <button
                                                    onClick={() => {
                                                        setSeasonMenu(null);
                                                        setConfirmSeason(season);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/10 hover:text-white"
                                                >
                                                    <RotateCcw className="h-4 w-4" />
                                                    {t('details.resetSeasonProgress')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {sorted.filter(ep => (ep.season ?? 1) === season).map(ep => {
                                    const isSelected = ep.id === selected.id;
                                    return (
                                        <button
                                            key={ep.id}
                                            onClick={() => {
                                                setSelectedId(ep.id);
                                                setIsOpen(false);
                                            }}
                                            className={`w-full text-left border rounded-lg overflow-hidden transition-colors ${isSelected ? 'bg-blue-500/15 border-blue-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/25'}`}
                                        >
                                            <div className="px-4 py-3 flex justify-between items-center gap-2">
                                                <div className="min-w-0">
                                                    <h4 className="font-medium text-white">{episodeLabel(ep)}</h4>
                                                    {ep.episodeTitle && <p className="text-sm text-neutral-300 truncate" title={ep.episodeTitle}>{ep.episodeTitle}</p>}
                                                </div>
                                                {isSelected && <Check className="h-5 w-5 shrink-0 text-blue-400" />}
                                            </div>
                                            <div className="h-1 bg-white/10">
                                                <div className="h-1 bg-blue-500" style={{ width: `${getProgressPercent(ep.fullPath)}%` }} />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-neutral-900/60 border border-white/10 backdrop-blur-md rounded-lg overflow-hidden">
                <div className="flex">
                    {sorted.length > 1 && (
                        <button
                            onClick={() => setIsOpen(open => !open)}
                            title={t('details.chooseEpisode')}
                            className="px-4 border-r border-white/10 text-neutral-300 hover:text-white hover:bg-neutral-700/80 transition-colors"
                        >
                            <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={(e) => play(selected, e.ctrlKey)}
                        title={t('details.playEpisode')}
                        className="group flex-1 min-w-0 px-6 py-3 flex justify-center items-center gap-3 hover:bg-neutral-700/80 transition-colors"
                    >
                        <Play className="h-7 w-7 shrink-0 text-neutral-300 group-hover:text-white transition-colors" />
                        <div className="min-w-0 text-center">
                            <h4 className="text-xl font-medium text-white">{t('details.playEpisode')}</h4>
                            <p className="text-sm text-neutral-300 truncate">
                                {[seasons.length > 1 || selected.season ? t('common.season', { season: pad(selected.season ?? 1) }) : '', episodeLabel(selected)]
                                    .filter(Boolean).join(' · ')}
                            </p>
                        </div>
                    </button>
                </div>
                <div className="h-1 bg-white/10">
                    <div className="h-1 bg-blue-500" style={{ width: `${progress}%` }} />
                </div>
            </div>
        </div>
    );
};

export default EpisodePlayButton;
