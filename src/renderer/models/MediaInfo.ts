export interface AudioTrackInfo {
    index: number;
    codec: string;
    channels: number;
    language?: string;
    title?: string;
    isDefault: boolean;
    isSupported: boolean;
}

// Either an embedded text stream (`stream` = index among subtitle streams) or a subtitle file next to the video
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
    // Stop once a cue starting at or after this time is read; null - read to the end
    until: number | null;
}

export interface MediaInfo {
    duration: number;
    videoCodec?: string;
    audioTracks: AudioTrackInfo[];
    subtitleTracks: SubtitleTrackInfo[];
}
