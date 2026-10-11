import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nProvider';

interface ConfirmModalProps {
    title: string;
    text?: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal = ({ title, text, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) => {
    const { t } = useI18n();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    return createPortal(
        <div
            data-confirm-modal
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onCancel}
        >
            <div
                className="bg-neutral-800 rounded-lg p-6 w-full max-w-md border border-neutral-700 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {text && <p className="mt-2 text-sm text-neutral-300">{text}</p>}
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-neutral-300 hover:text-white rounded-lg transition-colors"
                    >
                        {t('metadata.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        autoFocus
                        className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
