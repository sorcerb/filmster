import { MovieMetadata } from "./MediaMetadata";

export enum MediaType {
    Movie = 'movie',
    Series = 'series'
}

export interface RegexPatterns {
    seasonEpisode: string;
    episodeOnly: string;
    seasonInFolder: string;
    year: string;
    resolution: string;
    quality: string;
    custom: string;
    separator: string;
}

export interface MediaFileModel {
    id: string;
    fileName: string;
    modifiedDate: Date;
    parsedName: string;
    metadataId: string;
    folderPath: string;
    subFolder: string;
    fullPath: string;
    type: MediaType;
    year?: number;
    season?: number;
    episode?: number;
    // Episode title from the file name, if it has one
    episodeTitle?: string;
    resolution?: string;
    quality?: string;
    fileSize?: number;
    duration?: number;
    dateAdded?: Date;
    seasons?: number[];
    episodes?: MediaFileModel[];
    episodesBySeason?: Record<number, MediaFileModel[]>;
    metadata?: MovieMetadata | null;
    selectedMovie?: any;
    // User-made group (see MediaGroupsStore)
    groupId?: string;
    // Name given by the user; on the home page group card: the displayed name
    groupName?: string;
    // Home page group card: member types, a mixed group counts as both
    groupTypes?: MediaType[];
}
