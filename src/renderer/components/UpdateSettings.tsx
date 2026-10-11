import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useUpdateStatus } from '../hooks/useUpdateStatus';

export const SCROLL_TO_UPDATES = 'scrollToUpdates';

const UpdateSettings = () => {
    const { t } = useI18n();
    const location = useLocation();
    const status = useUpdateStatus();
    const [autoUpdate, setAutoUpdateState] = useState(true);
    const blockRef = useRef<HTMLDivElement>(null);
    const isScrollRequested = location.state === SCROLL_TO_UPDATES;

    useEffect(() => {
        window.electron.getAutoUpdate()
            .then(setAutoUpdateState)
            .catch(error => console.error('Error reading auto update setting:', error));
    }, []);

    useEffect(() => {
        if (isScrollRequested && status) blockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [isScrollRequested, location.key, !!status]);

    const handleAutoUpdateToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.checked;
        setAutoUpdateState(value);
        try {
            await window.electron.setAutoUpdate(value);
        } catch (error) {
            console.error('Failed to update auto update setting:', error);
            setAutoUpdateState(!value);
        }
    };

    const run = (action: () => Promise<unknown>) => {
        action().catch(error => console.error('Update action failed:', error));
    };

    if (!status) return null;

    const buttonClass = 'px-4 py-1 bg-zinc-500 text-white rounded hover:bg-zinc-400 disabled:opacity-50';
    const primaryButtonClass = 'px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-500';

    const renderState = () => {
        switch (status.state) {
            case 'unsupported':
                return <p className="text-neutral-400">{t('settings.updatesUnsupported')}</p>;
            case 'checking':
                return (
                    <p className="flex items-center gap-2 text-neutral-300">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        {t('settings.updatesChecking')}
                    </p>
                );
            case 'latest':
                return <p className="text-neutral-300">{t('settings.updatesLatest')}</p>;
            case 'available':
                return (
                    <div className="flex items-center gap-4">
                        <p className="text-neutral-100">{t('settings.updatesAvailable', { version: status.version ?? '' })}</p>
                        <button className={primaryButtonClass} onClick={() => run(window.electron.downloadUpdate)}>
                            {t('settings.updatesDownload')}
                        </button>
                    </div>
                );
            case 'downloading':
                return (
                    <div className="flex items-center gap-3">
                        <p className="text-neutral-300 whitespace-nowrap">{t('settings.updatesDownloading', { percent: status.percent ?? 0 })}</p>
                        <div className="w-48 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all" style={{ width: `${status.percent ?? 0}%` }} />
                        </div>
                    </div>
                );
            case 'downloaded':
                return (
                    <div className="flex items-center gap-4">
                        <p className="text-neutral-100">{t('settings.updatesReady', { version: status.version ?? '' })}</p>
                        <button className={primaryButtonClass} onClick={() => run(window.electron.installUpdate)}>
                            {t('settings.updatesInstall')}
                        </button>
                    </div>
                );
            case 'error':
                return <p className="text-red-400">{t('settings.updatesError', { error: status.error ?? '' })}</p>;
            default:
                return null;
        }
    };

    const canCheck = status.state === 'idle' || status.state === 'latest' || status.state === 'error';

    return (
        <div ref={blockRef} className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
            <div className="h-12 flex items-center justify-between">
                <h2 className="text-neutral-100 font-bold">{t('settings.updates')}</h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-neutral-300 text-sm">{t('settings.updatesAuto')}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={autoUpdate}
                                onChange={handleAutoUpdateToggle}
                            />
                            <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                    <button
                        className={buttonClass}
                        disabled={!canCheck}
                        onClick={() => run(window.electron.checkForUpdates)}
                    >
                        {t('settings.updatesCheck')}
                    </button>
                </div>
            </div>
            <p className="text-neutral-400">
                {t('settings.updatesCurrent', { version: status.currentVersion })}
                {' '}{t(autoUpdate ? 'settings.updatesAutoDescription' : 'settings.updatesManualDescription')}
            </p>
            <div className="mt-3 min-h-7 flex items-center">
                {renderState()}
            </div>
        </div>
    );
};

export default UpdateSettings;
