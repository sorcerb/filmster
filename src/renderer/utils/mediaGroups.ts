import { MediaFileModel, MediaType } from '../models/MediaFileModel';

const getYear = (file: MediaFileModel) => file.metadata?.year || file.year || 9999;

export const getMediaTitle = (file: MediaFileModel) => file.metadata?.title || file.parsedName;

export const countGroupItems = (files: MediaFileModel[]) =>
    new Set(files.map(file => file.type === MediaType.Series ? `series:${file.parsedName}` : file.id)).size;

export const compareGroupMembers = (a: MediaFileModel, b: MediaFileModel) =>
    getYear(a) - getYear(b)
    || getMediaTitle(a).localeCompare(getMediaTitle(b))
    || (a.season ?? 0) - (b.season ?? 0)
    || (a.episode ?? 0) - (b.episode ?? 0)
    || a.fullPath.localeCompare(b.fullPath);

export const getGroupNames = (files: MediaFileModel[]): Map<string, string> => {
    const members = new Map<string, MediaFileModel[]>();
    files.forEach(file => {
        if (!file.groupId) return;
        if (!members.has(file.groupId)) members.set(file.groupId, []);
        members.get(file.groupId)!.push(file);
    });
    return new Map(Array.from(members, ([groupId, groupFiles]) => {
        const first = [...groupFiles].sort(compareGroupMembers)[0];
        return [groupId, first.groupName || getMediaTitle(first)];
    }));
};
