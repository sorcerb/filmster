export interface WatchProgress {
    filePath: string;
    lastPosition: number;
    totalDuration: number;
    percentage: number;
    lastWatched: string;
    isCompleted: boolean;
}

// Seconds
export interface LibraryFileProgress {
    position: number;
    duration?: number;
    lastWatched: string;
    isCompleted: boolean;
}
