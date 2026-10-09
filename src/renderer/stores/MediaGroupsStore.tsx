import Store from 'electron-store';
import { randomUUID } from 'crypto';

// User-made groups of media files (cards merged by drag and drop on the home page).
// Members keep their own metadata; the group card shows the earliest member (by year, then title)
// and is named after it unless the user renamed the group. Files are referenced by id (full path).
export interface MediaGroup {
    id: string;
    // Set only when renamed by the user
    name?: string;
    fileIds: string[];
}

// The first version stored the drop target's name and metadataId, which made it the group card
type LegacyMediaGroup = MediaGroup & { metadataId?: string };

const storeName = 'MediaGroups';
const store = new Store<{ MediaGroups: MediaGroup[] }>({ defaults: { MediaGroups: [] } });

export const getMediaGroups = (): MediaGroup[] =>
    (store.get(storeName, []) as LegacyMediaGroup[]).map(({ metadataId, ...group }) =>
        metadataId ? { id: group.id, fileIds: group.fileIds } : group);

// Adds the source files to the target's group, or creates a group when the target has none.
// Source files leave their previous groups; emptied groups are removed.
export const groupMediaFiles = (targetIds: string[], sourceIds: string[]): void => {
    const groups = getMediaGroups();
    const target = groups.find(group => group.fileIds.includes(targetIds[0]));
    const moving = new Set(sourceIds);

    const next = groups
        .map(group => group === target ? group : { ...group, fileIds: group.fileIds.filter(id => !moving.has(id)) })
        .filter(group => group.fileIds.length > 0);

    if (target) {
        target.fileIds = Array.from(new Set([...target.fileIds, ...sourceIds]));
    } else {
        next.push({ id: randomUUID(), fileIds: Array.from(new Set([...targetIds, ...sourceIds])) });
    }
    store.set(storeName, next);
};

// An empty name returns the group to the automatic one
export const renameMediaGroup = (groupId: string, name: string): void => {
    store.set(storeName, getMediaGroups().map(group => {
        if (group.id !== groupId) return group;
        const { name: _previous, ...rest } = group;
        return name ? { ...rest, name } : rest;
    }));
};

export const removeMediaGroup = (groupId: string): void => {
    store.set(storeName, getMediaGroups().filter(group => group.id !== groupId));
};
