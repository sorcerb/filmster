export interface WatchProgress {
    filePath: string;
    lastPosition: number;
    totalDuration: number;
    percentage: number;
    lastWatched: string;
    isCompleted: boolean;
}

// Progress of a library file from either player (main/libraryProgress.ts); seconds
export interface LibraryFileProgress {
    position: number;
    // Unknown for MPC-HC until the file's duration was probed
    duration?: number;
    lastWatched: string;
    isCompleted: boolean;
}
