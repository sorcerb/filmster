import { useState, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ApiSettings as ApiSettingsModel } from '../models/ApiSettings';
import { getDefaultProvider, METADATA_PROVIDERS } from '../../shared/metadataApi';

interface ApiSettingsProps {
    onSave?: (settings: ApiSettingsModel) => void;
}

export const ApiSettings = ({ onSave }: ApiSettingsProps) => {
    const { t } = useI18n();
    const [settings, setSettings] = useState<ApiSettingsModel>({
        apiKeyKinopoisk: '',
        apiKeyTheMovieDb: '',
        defaultProvider: 'kinopoisk'
    });
    const [isSaving, setIsSaving] = useState(false);

    const loadSettings = async () => {
        const currentSettings = await window.electron.getApiSettings();
        setSettings({
            apiKeyKinopoisk: currentSettings.apiKeyKinopoisk || '',
            apiKeyTheMovieDb: currentSettings.apiKeyTheMovieDb || '',
            defaultProvider: getDefaultProvider(currentSettings)
        });
    }

    useEffect(() => {
        loadSettings();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            await window.electron.updateApiSettings(settings);
            if (onSave) {
                onSave(settings);
            }
        } catch (error) {
            console.error('Failed to save API settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                    <label htmlFor="apiKeyTheMovieDb" className="block text-sm font-medium text-neutral-300">
                        {t('api.tmdbKey')}
                    </label>
                    <a
                        href="https://www.themoviedb.org/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    >
                        themoviedb.org
                    </a>
                </div>
                <input
                    id="apiKeyTheMovieDb"
                    name="apiKeyTheMovieDb"
                    value={settings.apiKeyTheMovieDb}
                    onChange={handleChange}
                    placeholder={t('api.tmdbKeyPlaceholder')}
                    className="w-full px-3 py-2 bg-neutral-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                    <label htmlFor="apiKeyKinopoisk" className="block text-sm font-medium text-neutral-300">
                        {t('api.kinopoiskKey')}
                    </label>
                    <a
                        href="https://kinopoiskapiunofficial.tech/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    >
                        kinopoiskapiunofficial.tech
                    </a>
                </div>
                <input
                    id="apiKeyKinopoisk"
                    name="apiKeyKinopoisk"
                    value={settings.apiKeyKinopoisk}
                    onChange={handleChange}
                    placeholder={t('api.kinopoiskKeyPlaceholder')}
                    className="w-full px-3 py-2 bg-neutral-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div>
                <label htmlFor="defaultProvider" className="block text-sm font-medium text-neutral-300 mb-1">
                    {t('api.defaultProvider')}
                </label>
                <select
                    id="defaultProvider"
                    name="defaultProvider"
                    value={settings.defaultProvider}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-neutral-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {METADATA_PROVIDERS.map(provider => (
                        <option key={provider} value={provider}>
                            {t(provider === 'tmdb' ? 'api.providerTmdb' : 'api.providerKinopoisk')}
                        </option>
                    ))}
                </select>
                <p className="mt-1 text-neutral-400">{t('api.defaultProviderHint')}</p>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? t('api.saving') : t('api.save')}
                </button>
            </div>
        </form>
    );
};

export default ApiSettings;
