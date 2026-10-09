import Store from 'electron-store';
import { LibraryFolderModel } from '../models/LibraryFolderModel';

const storeName = 'LibraryFolders';
const store = new Store<{ data: LibraryFolderModel[] }>({ defaults: { data: [] } });

export const getLibraryFolders = (): LibraryFolderModel[] => {
    const currentData: any[] = store.get(storeName, []);
    const validData = currentData.map((item: any) => {
        if (typeof item === 'string') {
            return { path: item, modifiedDate: new Date() };
        }
        return item;
    }).filter((item: any) => item && typeof item.path === 'string');
    return validData;
};

export const addLibraryFolder = (newObj: LibraryFolderModel | string): void => {
    const currentData = getLibraryFolders();
    const folderObj = typeof newObj === 'string' ? { path: newObj, modifiedDate: new Date() } : newObj;
    if (!currentData.some(s => s.path === folderObj.path)) {
        store.set(storeName, [...currentData, folderObj]);
    }
};

export const removeLibraryFolder = (path: string): void => {
    const currentData = getLibraryFolders();
    const updatedData = currentData.filter((obj) => obj.path !== path);
    store.set(storeName, updatedData);
};
