// Seconds from the start of the file
export interface TimeRange {
    start: number;
    end: number;
}

// Intro and credits of a series episode (see main/episodeMarkers.ts)
export interface EpisodeMarkers {
    // Of the analyzed file: a replaced file is analyzed again
    fileSize: number;
    // Episodes of the series at the time: if no intro was found, new episodes give another chance
    episodeCount: number;
    intro: TimeRange | null;
    creditsStart: number | null;
}
