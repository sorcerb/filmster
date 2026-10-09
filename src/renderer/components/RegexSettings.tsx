import { useState, useEffect } from 'react';
import { RegexPatterns } from '../models/MediaFileModel';
import { DEFAULT_REGEX_PATTERNS } from '../../shared/constants/regexPatterns';
import { useI18n } from '../i18n/I18nProvider';

interface RegexSettingsProps {
    onSave?: (patterns: RegexPatterns) => void;
}

export const RegexSettings = ({ onSave }: RegexSettingsProps) => {
    const { t } = useI18n();
    const [patterns, setPatterns] = useState<RegexPatterns>(DEFAULT_REGEX_PATTERNS);

    useEffect(() => {
        const loadPatterns = async () => {
            try {
                const savedPatterns = await window.electron.getRegexPatterns();
                if (savedPatterns && Object.keys(savedPatterns).length > 0) {
                    setPatterns(savedPatterns);
                }
            } catch (error) {
                console.error('Error loading regex patterns:', error);
            }
        };
        loadPatterns();
    }, []);

    const handleChange = (field: keyof RegexPatterns, value: string) => {
        setPatterns(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleResetToDefault = async () => {
        setPatterns(DEFAULT_REGEX_PATTERNS);
        try {
            await window.electron.updateRegexPatterns(DEFAULT_REGEX_PATTERNS);
            onSave?.(DEFAULT_REGEX_PATTERNS);
        } catch (error) {
            console.error('Error saving regex patterns:', error);
        }
    };

    const handleSave = async () => {
        try {
            await window.electron.updateRegexPatterns(patterns);
            onSave?.(patterns);
        } catch (error) {
            console.error('Error saving regex patterns:', error);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.seasonEpisode')}</label>
                <input
                    type="text"
                    value={patterns.seasonEpisode}
                    onChange={(e) => handleChange('seasonEpisode', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.seasonEpisode })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.episodeOnly')}</label>
                <input
                    type="text"
                    value={patterns.episodeOnly}
                    onChange={(e) => handleChange('episodeOnly', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.episodeOnly })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.seasonInFolder')}</label>
                <input
                    type="text"
                    value={patterns.seasonInFolder}
                    onChange={(e) => handleChange('seasonInFolder', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.seasonInFolder })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.year')}</label>
                <input
                    type="text"
                    value={patterns.year}
                    onChange={(e) => handleChange('year', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.year })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.resolution')}</label>
                <input
                    type="text"
                    value={patterns.resolution}
                    onChange={(e) => handleChange('resolution', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.resolution })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.quality')}</label>
                <input
                    type="text"
                    value={patterns.quality}
                    onChange={(e) => handleChange('quality', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.quality })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.custom')}</label>
                <input
                    type="text"
                    value={patterns.custom}
                    onChange={(e) => handleChange('custom', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: String.raw`\\b` })}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">{t('regex.separator')}</label>
                <input
                    type="text"
                    value={patterns.separator}
                    onChange={(e) => handleChange('separator', e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white text-xs"
                    placeholder={t('regex.example', { pattern: DEFAULT_REGEX_PATTERNS.separator })}
                />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
                <button
                    onClick={handleResetToDefault}
                    className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
                >
                    {t('regex.resetToDefault')}
                </button>
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                    {t('regex.save')}
                </button>
            </div>
        </div>
    );
};

export default RegexSettings;
