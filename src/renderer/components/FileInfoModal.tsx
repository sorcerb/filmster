import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MediaFileModel } from '../models/MediaFileModel';
import { useI18n } from '../i18n/I18nProvider';

const FileInfoModal = ({ file, onClose }: { file: MediaFileModel; onClose: () => void }) => {
    const { t } = useI18n();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const rows = [
        { label: t('details.fileName'), value: file.fileName },
        { label: t('details.fileSize'), value: file.fileSize ? `${(file.fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB` : t('details.notAvailable') },
        { label: t('details.path'), value: file.fullPath },
    ];

    return createPortal(
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="relative bg-neutral-800 rounded-lg p-6 w-full max-w-xl border border-neutral-700 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-full transition-colors"
                    aria-label={t('common.close')}
                    title={t('common.close')}
                >
                    <X className="h-5 w-5" />
                </button>
                <h3 className="text-lg font-semibold text-white mb-4 pr-8">{t('details.fileInformation')}</h3>
                <dl className="space-y-3 text-sm">
                    {rows.map(row => (
                        <div key={row.label}>
                            <dt className="text-neutral-400">{row.label}</dt>
                            <dd className="text-white break-all select-text">{row.value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </div>,
        document.body
    );
};

export default FileInfoModal;
