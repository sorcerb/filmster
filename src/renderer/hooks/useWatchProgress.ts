import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MpcWatchEntry } from '../stores/MpcHistoryService';
import { WatchProgress } from '../models/WatchProgressModel';
import { PlayerType } from '../models/PlayerType';

export interface FileProgress {
    positionSeconds: number;
    durationSeconds?: number;
    formattedTime: string;
    // ISO date
    lastWatched?: string;
    isCompleted?: boolean;
}

const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const getFileName = (filePath: string) => filePath.split('\\').pop()?.toLowerCase() || '';

export const useWatchProgress = (refreshInterval: number) => {
    const navigate = useNavigate();
    const [playerType, setPlayerType] = useState<PlayerType>('external');
    const [mpcHistory, setMpcHistory] = useState<Record<string, MpcWatchEntry>>({});
    const [internalProgress, setInternalProgress] = useState<Record<string, WatchProgress>>({});

    const load = useCallback(async () => {
        const type = await window.electron.getPlayerType();
        setPlayerType(type);
        if (type === 'internal') setInternalProgress(await window.electron.getAllWatchProgress());
        else setMpcHistory(await window.electron.getMpcHistory());
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, refreshInterval);
        return () => clearInterval(interval);
    }, [load, refreshInterval]);

    // The app's own progress only: MPC-HC keeps its history itself
    const clearProgress = useCallback(async (filePaths: string[]) => {
        await window.electron.clearWatchProgress(filePaths);
        await load();
    }, [load]);

    const getProgress = useCallback((filePath: string): FileProgress | null => {
        if (playerType === 'internal') {
            const progress = internalProgress[filePath];
            if (!progress) return null;
            const position = Math.floor(progress.lastPosition);
            return {
                positionSeconds: position,
                durationSeconds: progress.totalDuration,
                formattedTime: formatDuration(position),
                lastWatched: progress.lastWatched,
                isCompleted: progress.isCompleted,
            };
        }

        // MPC history paths may differ (mapped drive vs UNC), so match by file name
        const fileName = getFileName(filePath);
        for (const [path, entry] of Object.entries(mpcHistory)) {
            if (getFileName(path) === fileName) {
                const position = Math.floor(entry.filePosition / 1000);
                // MPC-HC resets the position when a file is played to the end
                return { positionSeconds: position, formattedTime: formatDuration(position), lastWatched: entry.lastOpened, isCompleted: entry.filePosition === 0 };
            }
        }
        return null;
    }, [playerType, internalProgress, mpcHistory]);

    const play = useCallback(async (file: { id: string; fullPath: string }, useOtherPlayer = false) => {
        const internal = (playerType === 'internal') !== useOtherPlayer;
        if (internal) {
            navigate(`/play/${encodeURIComponent(file.id)}`);
            return;
        }
        try {
            await window.electron.openFile(file.fullPath);
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }, [playerType, navigate]);

    return { playerType, getProgress, play, clearProgress };
};
