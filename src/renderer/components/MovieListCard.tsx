import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { MediaFileModel, MediaType } from '../models/MediaFileModel';
import { EllipsisVertical, Layers, Pencil, TextCursorInput, Ungroup } from 'lucide-react';
import EditMetadataModal from './EditMetadataModal';
import { useI18n } from '../i18n/I18nProvider';
import { countGroupItems } from '../utils/mediaGroups';

interface MovieListCardProps {
    item: MediaFileModel;
    isGrouped?: boolean;
    onClick?: () => void;
    // Called after the user group of this card was renamed or ungrouped
    onGroupChanged?: () => void;
}

const MovieListCard = ({ item, isGrouped = false, onClick, onGroupChanged }: MovieListCardProps) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const file = isGrouped && item.episodes?.[0] ? item.episodes[0] : item;
    const [posterUrl, setPosterUrl] = useState<string | null>(null);
    const [metaTitle, setMetaTitle] = useState<string | null>(null);
    const [metaYear, setMetaYear] = useState<string | null>(null);

    // posterUrlPreview carries the poster file version (?v=mtime), so the image is cached until it changes
    const applyMetadata = (metadata: MediaFileModel['metadata']) => {
        setMetaTitle(metadata?.title || null);
        setMetaYear(metadata?.year ? metadata.year.toString() : null);
        setPosterUrl(metadata?.posterUrlPreview || null);
    };

    const loadPoster = async () => {
        if (file.metadataId) {
            try {
                applyMetadata(await window.electron.loadMetadata(file.metadataId));
            } catch (error) {
                console.error('Error loading poster:', error);
            }
        }
    };

    // The media list already comes with metadata; ask the main process only when it is missing
    useEffect(() => {
        if (file.metadata !== undefined) {
            applyMetadata(file.metadata);
        } else {
            loadPoster();
        }
    }, [file.parsedName, file.metadata?.posterUrlPreview, file.metadata?.title]);

    // Metadata loaded in the background (new file found by a scan)
    useEffect(() => {
        return window.electron.onMetadataUpdated(metadataId => {
            if (metadataId.toLowerCase() === file.metadataId?.toLowerCase()) {
                loadPoster();
            }
        });
    }, [file.metadataId]);

    const handleCardClick = (e: React.MouseEvent) => {
        if (e.defaultPrevented || showEditModal || showMenu || isRenaming) {
            return;
        }

        if (onClick) {
            onClick();
        } else {
            navigate(`/media/${file.id}`);
        }
    };

    const [showEditModal, setShowEditModal] = useState(false);

    const handleEditMetadata = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowMenu(false);
        setShowEditModal(true);
    };

    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showMenu) return;
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showMenu]);

    const [isRenaming, setIsRenaming] = useState(false);
    const [groupName, setGroupName] = useState('');

    const startRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowMenu(false);
        setGroupName(item.groupName ?? '');
        setIsRenaming(true);
    };

    const finishRename = async (save: boolean) => {
        setIsRenaming(false);
        const name = groupName.trim();
        // An empty name returns the group to the automatic one
        if (!save || !item.groupId || name === item.groupName) return;
        try {
            await window.electron.renameMediaGroup(item.groupId, name);
            onGroupChanged?.();
        } catch (error) {
            console.error('Error renaming group:', error);
        }
    };

    const handleUngroup = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowMenu(false);
        if (!item.groupId) return;
        try {
            await window.electron.removeMediaGroup(item.groupId);
            onGroupChanged?.();
        } catch (error) {
            console.error('Error ungrouping:', error);
        }
    };

    const handleSaveMetadata = () => {
        loadPoster();
    };

    return (
        <div
            className="group overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col h-full cursor-pointer"
            onClick={handleCardClick}
        >
            <div className="relative aspect-[2/3] bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center overflow-hidden">
                {posterUrl ? (
                    <img
                        src={posterUrl}
                        alt={file.parsedName}
                        draggable={false}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.warn('Failed to load poster:', target.src);
                            target.style.display = 'none';
                        }}
                    />
                ) : (
                    <span className="text-4xl text-neutral-400">
                        {file.type === MediaType.Movie ? '🎬' : '📺'}
                    </span>
                )}

                {item.groupId && (
                    <div
                        className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-px rounded-full bg-black/40 backdrop-blur-sm text-white text-[10px] leading-4 font-medium"
                        title={t('home.groupFiles', { count: item.episodes?.length ?? 1 })}
                    >
                        <Layers className="h-3 w-3" />
                        {countGroupItems(item.episodes ?? [item])}
                    </div>
                )}
            </div>

            <div className="p-3 flex-1 flex flex-col">
                {isRenaming ? (
                    <input
                        autoFocus
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') finishRename(true);
                            if (e.key === 'Escape') finishRename(false);
                        }}
                        onBlur={() => finishRename(true)}
                        className="mb-1 w-full bg-neutral-800 text-white text-sm text-center rounded px-1 py-0.5 border border-blue-500 focus:outline-none"
                    />
                ) : (
                    <h3
                        className="font-medium text-neutral-100 text-sm text-center mb-1 group-hover:text-white transition-colors truncate"
                    >
                        {item.groupName || metaTitle || file.parsedName}
                    </h3>
                )}
                {metaYear && (
                    <span className="text-xs text-center text-neutral-400">
                        {metaYear}
                    </span>
                )}
            </div>

            {showEditModal && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 cursor-default"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowEditModal(false);
                    }}
                />
            )}

            <div ref={menuRef} className="absolute top-3 right-3 z-40">
                <button
                    className={`p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-full transition-colors ${showMenu ? 'opacity-100 bg-neutral-700 text-white' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:bg-black/40'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(!showMenu);
                    }}
                    title={t('home.actions')}
                >
                    <EllipsisVertical className="h-4 w-4" />
                </button>
                {showMenu && (
                    <div
                        className="absolute right-0 mt-1 min-w-max py-1 bg-neutral-800 border border-neutral-700 rounded shadow-lg text-sm cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700" onClick={handleEditMetadata}>
                            <Pencil className="h-4 w-4" /> {t('home.editMetadata')}
                        </button>
                        {item.groupId && (
                            <>
                                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700" onClick={startRename}>
                                    <TextCursorInput className="h-4 w-4" /> {t('home.renameGroup')}
                                </button>
                                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700" onClick={handleUngroup}>
                                    <Ungroup className="h-4 w-4" /> {t('home.ungroup')}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <EditMetadataModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                file={file}
                onSave={handleSaveMetadata}
            />
        </div>
    );
};

export default MovieListCard;
