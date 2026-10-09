import { useEffect, useRef, useState } from 'react';
import { LibraryFolderModel } from '../models/LibraryFolderModel';
import { EllipsisVertical } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

const EditorFolderRow = (props: { model: LibraryFolderModel; removeEditorFolder: (path: string) => void, showFolderInExplorer: (path: string) => void }) => {

    const { t } = useI18n();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleDropdownToggle = () => {
        setDropdownOpen(!dropdownOpen);
    };

    const handleShowInExplorer = () => {
        props.showFolderInExplorer(props.model.path);
        setDropdownOpen(false);
    };

    const handleRemove = () => {
        props.removeEditorFolder(props.model.path);
    };

    return (
        <>
            <div className="flex items-center justify-between rounded text-neutral-400 hover:bg-neutral-600">
                <div className="p-1">
                    <span className="text-neutral-200">{props.model.path}</span>
                </div>
                <div className="p-1 me-4 w-10 relative">
                    <button
                        className="text-center py-1 text-neutral rounded hover:bg-neutral-700"
                        onClick={handleDropdownToggle}
                    >
                        <EllipsisVertical className="h-6 w-6 mx-1 text-neutral-400" />
                    </button>
                    {dropdownOpen && (
                        <div ref={dropdownRef} className="absolute right-7 top-7 mt-2 w-52 bg-neutral-900 border border-neutral-600 shadow-lg rounded z-50">
                            <button
                                className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700"
                                onClick={handleShowInExplorer}
                            >
                                {t('settings.showInExplorer')}
                            </button>
                            <button
                                className="block w-full px-4 py-2 text-left text-sm text-red-200 hover:bg-red-700"
                                onClick={handleRemove}
                            >
                                {t('settings.removeFromList')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default EditorFolderRow;