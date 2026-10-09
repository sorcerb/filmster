// What identifies a chosen audio / subtitle track, so the same one can be found in another file of the series
export interface TrackSignature {
    // Position among the file's tracks of that kind
    index: number;
    language?: string;
    title?: string;
    codec?: string;
    channels?: number;
    // Subtitle file next to the video rather than an embedded stream
    isExternal?: boolean;
    isForced?: boolean;
}

// Tracks chosen in the internal player for a movie or a whole series (all seasons)
export interface TrackPreference {
    audio?: TrackSignature;
    // null - subtitles turned off
    subtitle?: TrackSignature | null;
}
