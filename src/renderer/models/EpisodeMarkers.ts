// Seconds from the start of the file
export interface TimeRange {
    start: number;
    end: number;
}

export interface EpisodeMarkers {
    fileSize: number;
    episodeCount: number;
    intro: TimeRange | null;
    creditsStart: number | null;
}
