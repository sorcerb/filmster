import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { connectEvents, getAuthState, login, onUnauthorized } from '../webApi';
import { useI18n } from '../i18n/I18nProvider';

// Browser on the local network: asks for the PIN set on the host before showing the app
const WebAuthGate = ({ children }: { children: ReactNode }) => {
    const { t } = useI18n();
    const [state, setState] = useState<'checking' | 'pin' | 'ready' | 'offline'>('checking');
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const authorized = () => {
        connectEvents();
        setState('ready');
    };

    useEffect(() => {
        getAuthState()
            .then(auth => auth.authorized ? authorized() : setState('pin'))
            .catch(() => setState('offline'));
        // PIN changed on the host while this tab was open
        onUnauthorized(() => setState('pin'));
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            if (await login(pin)) {
                authorized();
            } else {
                setError(t('web.pinWrong'));
                setPin('');
            }
        } catch {
            setError(t('web.pinTooMany'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (state === 'ready') return <>{children}</>;

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            {state === 'checking' && <LoaderCircle className="h-10 w-10 animate-spin text-neutral-400" />}
            {state === 'offline' && <p className="text-neutral-400">{t('web.offline')}</p>}
            {state === 'pin' && (
                <form onSubmit={handleSubmit} className="w-full max-w-xs bg-neutral-800 rounded-lg p-6 shadow-lg flex flex-col gap-4">
                    <h1 className="text-xl text-white text-center">Filmster</h1>
                    <label className="text-sm text-neutral-300" htmlFor="pin">{t('web.pinTitle')}</label>
                    <input
                        id="pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="current-password"
                        autoFocus
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="bg-neutral-900 text-white text-lg text-center tracking-widest rounded px-3 py-2 border border-neutral-600 focus:border-blue-500 focus:outline-none"
                    />
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    <button
                        type="submit"
                        disabled={!pin || isSubmitting}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {t('web.login')}
                    </button>
                </form>
            )}
        </div>
    );
};

export default WebAuthGate;
