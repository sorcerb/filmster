export interface AudioTrackInfo {
    index: number;
    codec: string;
    channels: number;
    language?: string;
    title?: string;
    isDefault: boolean;
    isSupported: boolean;
}

// `stream` is the index among subtitle streams, not among all streams
export interface SubtitleTrackInfo {
    stream?: number;
    filePath?: string;
    language?: string;
    title?: string;
    isForced: boolean;
}

export interface SubtitleCue {
    start: number;
    end: number;
    text: string;
}

export interface SubtitleRequest {
    id: number;
    videoPath: string;
    track: SubtitleTrackInfo;
    from: number;
    until: number | null;
}

export interface MediaInfo {
    duration: number;
    videoCodec?: string;
    audioTracks: AudioTrackInfo[];
    subtitleTracks: SubtitleTrackInfo[];
}
