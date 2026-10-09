import { useState, useEffect } from 'react';
import EditorFolderRow from '../components/EditorFolderRow';
import RegexSettings from '../components/RegexSettings';
import { ApiSettings } from '../components/ApiSettings';
import { LibraryFolderModel } from '../models/LibraryFolderModel';
import { PlayerType } from '../models/PlayerType';
import { useI18n } from '../i18n/I18nProvider';
import { isLanguage, LANGUAGES, MessageKey } from '../../shared/i18n';
import NetworkSettings from '../components/NetworkSettings';
import GenreIconSettings from '../components/GenreIconSettings';
import UpdateSettings from '../components/UpdateSettings';
import { isWebClient } from '../webApi';

const PLAYER_OPTIONS: { value: PlayerType; label: MessageKey; description: MessageKey }[] = [
    { value: 'external', label: 'settings.playerExternal', description: 'settings.playerExternalDescription' },
    { value: 'internal', label: 'settings.playerInternal', description: 'settings.playerInternalDescription' },
];

const Settings = () => {
    const { t, language, setLanguage } = useI18n();
    const [libraryFolders, setLibraryFolders] = useState<LibraryFolderModel[]>([]);
    const [autoScanEnabled, setAutoScanEnabledState] = useState<boolean>(false);
    const [playerType, setPlayerTypeState] = useState<PlayerType>('external');
    const [autoSkipIntroDefault, setAutoSkipIntroDefaultState] = useState(false);

    const loadData = async () => {
        try {
            const folders = await window.electron.getLibraryFolders();
            setLibraryFolders(folders);
        } catch (error) {
            console.error('Error loading library folders:', error);
        }
    };

    useEffect(() => {
        if (isWebClient) return;
        const loadSettings = async () => {
            await loadData();
            try {
                const enabled = await window.electron.getAutoScan();
                setAutoScanEnabledState(enabled);
            } catch (error) {
                console.error('Error reading auto-scan setting:', error);
            }
            try {
                setPlayerTypeState(await window.electron.getPlayerType());
            } catch (error) {
                console.error('Error reading player setting:', error);
            }
            try {
                setAutoSkipIntroDefaultState(await window.electron.getAutoSkipIntroDefault());
            } catch (error) {
                console.error('Error reading skip intro setting:', error);
            }
        };
        loadSettings();
    }, []);

    const handleSelectFolder = async () => {
        const folderPath = await window.electron.selectFolder();
        if (folderPath) {
            await window.electron.addLibraryFolder(folderPath);
            loadData();
        }
    };

    const handleAutoScanToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.checked;
        setAutoScanEnabledState(value);
        try {
            await window.electron.setAutoScan(value);
        } catch (error) {
            console.error('Failed to update auto-scan setting:', error);
            setAutoScanEnabledState(!value);
        }
    };

    const handlePlayerTypeChange = async (type: PlayerType) => {
        const previous = playerType;
        setPlayerTypeState(type);
        try {
            await window.electron.setPlayerType(type);
        } catch (error) {
            console.error('Failed to update player setting:', error);
            setPlayerTypeState(previous);
        }
    };

    const handleAutoSkipIntroDefaultToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.checked;
        setAutoSkipIntroDefaultState(value);
        try {
            await window.electron.setAutoSkipIntroDefault(value);
        } catch (error) {
            console.error('Failed to update skip intro setting:', error);
            setAutoSkipIntroDefaultState(!value);
        }
    };

    const handleShowFolderInExplorer = async (path: string) => {
        await window.electron.showFolderInExplorer(path);
        loadData();
    };

    const handleRemoveProject = async (path: string) => {
        await window.electron.removeLibraryFolder(path);
        loadData();
    };

    const languageSettings = (
        <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
            <div className="h-12 flex items-center justify-between">
                <h2 className="text-neutral-100 font-bold">{t('settings.language')}</h2>
                <select
                    value={language}
                    onChange={(e) => {
                        if (isLanguage(e.target.value)) {
                            setLanguage(e.target.value).catch(error => console.error('Failed to update language setting:', error));
                        }
                    }}
                    className="bg-neutral-900 text-white text-sm rounded px-2 py-1 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                >
                    {LANGUAGES.map(({ code, name }) => (
                        <option key={code} value={code}>{name}</option>
                    ))}
                </select>
            </div>
        </div>
    );

    const title = (
        <div className="h-12 flex items-center justify-between">
            <h1 className="text-xl text-neutral-100">{t('settings.title')}</h1>
        </div>
    );

    // In a browser on the network only the language is a setting of its own
    if (isWebClient) {
        return (
            <>
                {title}
                {languageSettings}
            </>
        );
    }

    return (
        <>
            {title}
            {languageSettings}

            <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">

                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-neutral-100 font-bold">{t('settings.libraryFolders')}</h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-neutral-300 text-sm">{t('settings.autoScan')}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={autoScanEnabled}
                                    onChange={handleAutoScanToggle}
                                />
                                <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        <button 
                            className="px-4 py-1 bg-zinc-500 text-white rounded hover:bg-zinc-400" 
                            onClick={handleSelectFolder}
                        >
                            {t('settings.addFolder')}
                        </button>
                    </div>
                </div>

                {libraryFolders.map((libraryFolder) => (
                    <EditorFolderRow
                        key={libraryFolder.path}
                        model={libraryFolder}
                        removeEditorFolder={handleRemoveProject}
                        showFolderInExplorer={handleShowFolderInExplorer}>
                    </EditorFolderRow>
                ))}
            </div>
            <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-neutral-100 font-bold">{t('settings.player')}</h2>
                    <div className="flex bg-neutral-900 rounded p-1">
                        {PLAYER_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                className={`px-4 py-1 rounded text-sm transition-colors ${playerType === option.value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-neutral-300 hover:text-white'
                                    }`}
                                onClick={() => handlePlayerTypeChange(option.value)}
                            >
                                {t(option.label)}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-neutral-400">
                    {t(PLAYER_OPTIONS.find(option => option.value === playerType)?.description ?? 'settings.playerExternalDescription')}
                    {' '}{t('settings.playerCtrlClickHint')}
                </p>
                <div className="h-12 mt-2 flex items-center justify-between">
                    <span className="text-neutral-300 text-sm">{t('settings.autoSkipIntro')}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={autoSkipIntroDefault}
                            onChange={handleAutoSkipIntroDefaultToggle}
                        />
                        <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                <p className="text-neutral-400">{t('settings.autoSkipIntroDescription')}</p>
            </div>

            <GenreIconSettings />

            <NetworkSettings />

            <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-neutral-100 font-bold">{t('settings.regexPatterns')}</h2>
                </div>
                <div className="mt-2 p-4 bg-neutral-800 rounded-xl">
                    <RegexSettings />
                </div>
            </div>

            <div className="mt-6 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-neutral-100 font-bold">{t('settings.apiSettings')}</h2>
                </div>
                <div className="mt-2 p-4 bg-neutral-800 rounded-xl">
                    <ApiSettings />
                </div>
            </div>

            <div className="mt-2 p-4 text-xs max-w-4xl bg-neutral-800 rounded-xl mx-auto">
                <div className="h-12 flex items-center justify-between">
                    <h2 className="text-neutral-100 font-bold">{t('settings.dataFolder')}</h2>
                    <button
                        className="px-4 py-1 bg-zinc-500 text-white rounded hover:bg-zinc-400"
                        onClick={() => window.electron.openDataFolder().catch(error => console.error('Error opening data folder:', error))}
                    >
                        {t('settings.openDataFolder')}
                    </button>
                </div>
                <p className="text-neutral-400">{t('settings.dataFolderDescription')}</p>
            </div>

            <UpdateSettings />
        </>
    );
}

export default Settings;
