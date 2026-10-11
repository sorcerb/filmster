import Store from 'electron-store';
import { MediaFileModel } from '../models/MediaFileModel';
import { loadMetadata } from './metadataService';
import { getAllMediaFiles } from '../../main/scanFiles';
import { getMediaGroups } from './MediaGroupsStore';

// Legacy: the media list used to be in config.json; it now lives in the scan cache.
const legacyStore = new Store();
if (legacyStore.has('MediaFiles')) {
    legacyStore.delete('MediaFiles');
}

// Copies: the scan cache models must not get group fields or metadata attached.
const withGroups = (files: MediaFileModel[]): MediaFileModel[] => {
    const groupByFile = new Map(getMediaGroups().flatMap(group => group.fileIds.map(id => [id, group] as const)));
    return files.map(file => {
        const group = groupByFile.get(file.id);
        return group
            ? { ...file, groupId: group.id, groupName: group.name }
            : { ...file };
    });
};

export const getMediaFiles = (): MediaFileModel[] => {
    return withGroups(getAllMediaFiles()).map(file => ({ ...file, metadata: loadMetadata(file.metadataId) }));
};

export const getMediaFile = (id: string): MediaFileModel | null => {
    const file = getAllMediaFiles().find(file => file.id === id);
    return file ? withGroups([file])[0] : null;
};
