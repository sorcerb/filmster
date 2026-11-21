import { ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaFileModel } from '../models/MediaFileModel';
import { useI18n } from '../i18n/I18nProvider';
import { getMediaTitle } from '../utils/mediaGroups';

const VISIBLE_COUNT = 5;
const ARROW_CLASS = 'h-24 w-16 shrink-0 flex items-center justify-center bg-neutral-900/60 border border-white/10 backdrop-blur-md rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-700/80 hover:border-white/25 transition-colors';

export interface GroupSwitcherProps {
    items: MediaFileModel[];
    index: number;
    onSelect: (index: number) => void;
}

const getMetadataId = (item: MediaFileModel) => (item.episodes?.[0] ?? item).metadataId;

const GroupSwitcher = ({ items, index, onSelect, children }: GroupSwitcherProps & { children: ReactNode }) => {
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
        <div className="w-full max-w-[34rem] flex items-end gap-3">
            <button
                onClick={() => onSelect(index - 1)}
                title={t('details.previousInGroup')}
                aria-label={t('details.previousInGroup')}
                className={ARROW_CLASS}
            >
                <ChevronLeft className="h-10 w-10" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-end justify-center gap-2 pt-5">
                    {visible.map((item, offset) => {
                        const itemIndex = start + offset;
                        const preview = previews[getMetadataId(item) ?? ''];
                        return (
                            <div key={item.id} className="relative">
                                {itemIndex === index && items.length > VISIBLE_COUNT && (
                                    <span className="absolute left-1/2 -translate-x-1/2 -top-6 text-2xs text-neutral-300 tabular-nums whitespace-nowrap [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
                                        {index + 1}/{items.length}
                                    </span>
                                )}
                                <button
                                    onClick={() => onSelect(itemIndex)}
                                    title={preview?.title || getMediaTitle(item)}
                                    className={`block w-10 aspect-[2/3] rounded overflow-hidden border-2 shadow-lg shadow-black/60 bg-gradient-to-br from-blue-900 to-purple-900 transition-all ${itemIndex === index ? 'border-white opacity-100 -translate-y-1' : 'border-transparent opacity-50 hover:opacity-90'}`}
                                >
                                    {preview?.posterUrl && <img src={preview.posterUrl} alt="" draggable={false} className="w-full h-full object-cover" />}
                                </button>
                            </div>
                        );
                    })}
                </div>
                {children}
            </div>
            <button
                onClick={() => onSelect(index + 1)}
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
