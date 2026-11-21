import { MovieMetadata } from '../models/MediaMetadata';

// The details card is remounted for every group member: without the cached metadata its first render
// has no description or credits and the layout jumps until they load
const cache = new Map<string, MovieMetadata>();

export const getCachedMetadata = (metadataId: string | undefined): MovieMetadata | null =>
    (metadataId && cache.get(metadataId)) || null;

export const loadMetadataCached = async (metadataId: string): Promise<MovieMetadata | null> => {
    const metadata = await window.electron.loadMetadata(metadataId);
    if (metadata) cache.set(metadataId, metadata);
    else cache.delete(metadataId);
    return metadata;
};
