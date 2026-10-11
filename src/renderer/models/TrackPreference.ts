export interface TrackSignature {
    // Position among the file's tracks of that kind
    index: number;
    language?: string;
    title?: string;
    codec?: string;
    channels?: number;
    isExternal?: boolean;
    isForced?: boolean;
}

export interface TrackPreference {
    audio?: TrackSignature;
    subtitle?: TrackSignature | null;
}
