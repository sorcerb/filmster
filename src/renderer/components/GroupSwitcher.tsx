import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaFileModel } from '../models/MediaFileModel';
import { useI18n } from '../i18n/I18nProvider';
import { getMediaTitle } from '../utils/mediaGroups';

const VISIBLE_COUNT = 5;
const ARROW_CLASS = 'flex items-center px-1 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-300 transition-colors';

interface GroupSwitcherProps {
    items: MediaFileModel[];
    index: number;
    onSelect: (index: number) => void;
}

const getMetadataId = (item: MediaFileModel) => (item.episodes?.[0] ?? item).metadataId;

const GroupSwitcher = ({ items, index, onSelect }: GroupSwitcherProps) => {
    const { t } = useI18n();
    const [previews, setPreviews] = useState<Record<string, { title?: string; posterUrl?: string }>>({});

    const count = Math.min(VISIBLE_COUNT, items.length);
    const start = Math.max(0, Math.min(index - Math.floor(count / 2), items.length - count));
    const visible = items.slice(start, start + count);

    useEffect(() => {
        let isCancelled = false;
        visible.forEach(async (item) => {
            const metadataId = getMetadataId(item);
            if (!metadataId || previews[metadataId]) return;
            try {
                const metadata = await window.electron.loadMetadata(metadataId);
                if (isCancelled) return;
                setPreviews(prev => ({ ...prev, [metadataId]: { title: metadata?.title ?? undefined, posterUrl: metadata?.posterUrlPreview ?? undefined } }));
            } catch (error) {
                console.error('Error loading poster:', error);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, [start, items]);

    return (
        <div className="h-24 flex items-stretch gap-2 px-2 py-2 bg-neutral-900/60 border border-white/10 backdrop-blur-md rounded-lg">
            <button
                onClick={() => onSelect(index - 1)}
                disabled={index === 0}
                title={t('details.previousInGroup')}
                aria-label={t('details.previousInGroup')}
                className={ARROW_CLASS}
            >
                <ChevronLeft className="h-10 w-10" />
            </button>
            <div className="flex flex-col items-center justify-center gap-1">
                <div className="flex items-end gap-2">
                    {visible.map((item, offset) => {
                        const itemIndex = start + offset;
                        const preview = previews[getMetadataId(item) ?? ''];
                        return (
                            <button
                                key={item.id}
                                onClick={() => onSelect(itemIndex)}
                                title={preview?.title || getMediaTitle(item)}
                                className={`w-9 aspect-[2/3] rounded overflow-hidden border-2 bg-gradient-to-br from-blue-900 to-purple-900 transition-all ${itemIndex === index ? 'border-white opacity-100 -translate-y-1' : 'border-transparent opacity-50 hover:opacity-90'}`}
                            >
                                {preview?.posterUrl && <img src={preview.posterUrl} alt="" draggable={false} className="w-full h-full object-cover" />}
                            </button>
                        );
                    })}
                </div>
                {items.length > VISIBLE_COUNT && (
                    <span className="text-2xs text-neutral-400 tabular-nums">{index + 1} / {items.length}</span>
                )}
            </div>
            <button
                onClick={() => onSelect(index + 1)}
                disabled={index === items.length - 1}
                title={t('details.nextInGroup')}
                aria-label={t('details.nextInGroup')}
                className={ARROW_CLASS}
            >
                <ChevronRight className="h-10 w-10" />
            </button>
        </div>
    );
};

export default GroupSwitcher;
