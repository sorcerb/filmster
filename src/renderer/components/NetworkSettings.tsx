import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { WebServerStatus } from '../../main/webServer';
import { useI18n } from '../i18n/I18nProvider';

// Network access: the library opened in a browser on other devices (main/webServer.ts)
const NetworkSettings = () => {
    const { t } = useI18n();
    const [status, setStatus] = useState<WebServerStatus | null>(null);
    const [port, setPort] = useState('');
    const [pin, setPin] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const applyStatus = (next: WebServerStatus) => {
        setStatus(next);
        setPort(String(next.settings.port));
        setPin(next.settings.pin);
    };

    useEffect(() => {
        window.electron.getWebServerStatus()
            .then(applyStatus)
            .catch(error => console.error('Error reading network access settings:', error));
    }, []);

    const save = async (enabled: boolean) => {
        setIsSaving(true);
        try {
            applyStatus(await window.electron.setWebServerSettings({ enabled, port: Number(port), pin }));
        } catch (error) {
            console.error('Error saving network access settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!status) return null;

    const enabled = status.settings.enabled;
    const isChanged = port !== String(status.settings.port) || pin !== status.settings.pin;

    return (
        <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
            <div className="h-12 flex items-center justify-between">
                <h2 className="text-neutral-100 font-bold">{t('settings.network')}</h2>
                <div className="flex items-center gap-2">
                    {isSaving && <LoaderCircle className="h-4 w-4 animate-spin text-neutral-400" />}
                    <span className="text-neutral-300 text-sm">{t('settings.networkEnable')}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={enabled}
                            disabled={isSaving}
                            onChange={(e) => save(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
            <p className="text-neutral-400">{t('settings.networkDescription')}</p>

            <div className="mt-4 flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                    <span className="text-neutral-300">{t('settings.networkPort')}</span>
                    <input
                        type="number"
                        min={1024}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="w-28 bg-neutral-900 text-white text-sm rounded px-2 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-neutral-300">{t('settings.networkPin')}</span>
                    <input
                        type="text"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-40 bg-neutral-900 text-white text-sm rounded px-2 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                    />
                </label>
                <button
                    className="px-4 py-1 bg-zinc-500 text-white rounded hover:bg-zinc-400 disabled:opacity-50"
                    disabled={!isChanged || isSaving}
                    onClick={() => save(enabled)}
                >
                    {t('settings.networkApply')}
                </button>
            </div>
            <p className="mt-2 text-neutral-400">{t('settings.networkPinHint')}</p>

            {enabled && (
                <div className="mt-4 p-3 bg-neutral-900 rounded-lg">
                    {status.error ? (
                        <p className="text-red-400">{t('settings.networkError', { error: status.error })}</p>
                    ) : (
                        <>
                            <p className="text-neutral-300">{t('settings.networkAddresses')}</p>
                            {status.urls.map(url => (
                                <p key={url} className="mt-1 text-sm text-white font-mono select-all">{url}</p>
                            ))}
                            <p className="mt-2 text-neutral-400">{t('settings.networkFirewall')}</p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default NetworkSettings;
