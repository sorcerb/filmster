// Must run before the app: provides window.electron in a browser
import { isWebClient } from './webApi';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import "@fontsource/open-sans";
import "@fontsource/open-sans/700.css";
import { I18nProvider } from './i18n/I18nProvider';
import WebAuthGate from './components/WebAuthGate';

createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
        <I18nProvider>
            {isWebClient ? <WebAuthGate><App /></WebAuthGate> : <App />}
        </I18nProvider>
    </StrictMode>,
)