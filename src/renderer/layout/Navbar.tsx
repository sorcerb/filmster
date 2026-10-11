import { CircleArrowDown, CircleUserRound, Settings, LoaderCircle, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { useUpdateStatus } from '../hooks/useUpdateStatus';
import { SCROLL_TO_UPDATES } from '../components/UpdateSettings';
import logo from '../../assets/icon.svg';

const Navbar = () => {
    const { t } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const updateStatus = useUpdateStatus();

    const handleScanClick = async () => {
        setIsLoading(true);
        try {
            await window.electron.scanMediaFiles();
        } catch (error) {
            console.error('Error scanning media files:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const updateTitle = (() => {
        const version = updateStatus?.version ?? '';
        switch (updateStatus?.state) {
            case 'available': return t('settings.updatesAvailable', { version });
            case 'downloading': return t('settings.updatesDownloading', { percent: updateStatus.percent ?? 0 });
            case 'downloaded': return t('settings.updatesReady', { version });
            default: return null;
        }
    })();

    const menuItems = [
        { id: 'library', label: t('home.title'), to: '/' },
        { id: 'news', label: t('nav.news'), to: '/news' },
    ];

    return (
        <div className="fixed top-0 w-full bg-neutral-800 border-b border-neutral-700 text-white flex items-center justify-between px-3 md:px-6 py-1 z-50">
            <NavLink
                to="/"
                className="flex items-center gap-2 text-lg font-semibold tracking-wide text-neutral-200 hover:text-white transition-colors select-none"
            >
                <img src={logo} alt="" className="h-6 w-6" />
                Filmster
            </NavLink>
            <ul className="flex items-center gap-2">
                {menuItems.map(({ id, label, to }) => (
                    <li key={id} className="flex items-center">
                        <NavLink
                            to={to}
                            end
                            className={({ isActive }) =>
                                `flex items-center text-md px-2 md:px-4 py-1 rounded-md ${isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
                                }`
                            }
                        >
                            {label}
                        </NavLink>
                    </li>
                ))}
            </ul>
            <div className="flex items-center gap-3">
                {updateTitle && (
                    <NavLink
                        to="/settings"
                        state={SCROLL_TO_UPDATES}
                        className={`transition-colors ${updateStatus?.state === 'downloaded' ? 'text-green-500 hover:text-green-400' : 'text-blue-500 hover:text-blue-400'}`}
                        aria-label={updateTitle}
                        title={updateTitle}
                    >
                        <CircleArrowDown className={`h-6 w-6 ${updateStatus?.state === 'downloading' ? 'animate-pulse' : ''}`} />
                    </NavLink>
                )}
                <button
                    className="text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
                    onClick={handleScanClick}
                    disabled={isLoading}
                    aria-label={t('nav.scan')}
                    title={t('nav.scan')}
                >
                    {isLoading ? (
                        <LoaderCircle className="h-6 w-6 animate-spin" />
                    ) : (
                        <RefreshCcw className="h-6 w-6" />
                    )}
                </button>
                <NavLink
                    to="/settings"
                    className="text-neutral-400 hover:text-neutral-200 transition-colors"
                    aria-label={t('nav.settings')}
                    title={t('nav.settings')}
                >
                    <Settings className="h-6 w-6" />
                </NavLink>
                <NavLink
                    to="/profile"
                    className="text-neutral-400 hover:text-neutral-200 transition-colors"
                    aria-label={t('nav.profile')}
                    title={t('nav.profile')}
                >
                    <CircleUserRound className="h-6 w-6" />
                </NavLink>
            </div>
        </div>
    );
};

export default Navbar;