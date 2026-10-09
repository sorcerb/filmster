import Store from 'electron-store';
import { randomBytes } from 'crypto';

// Network access: the library served to browsers on the local network (see main/webServer.ts)
export interface WebServerSettings {
    enabled: boolean;
    port: number;
    // Empty - no PIN
    pin: string;
}

export const DEFAULT_WEB_SERVER_PORT = 8420;

const storeName = 'WebServer';
const store = new Store<{ WebServer: WebServerSettings; WebServerSecret: string }>({
    defaults: { WebServer: { enabled: false, port: DEFAULT_WEB_SERVER_PORT, pin: '' }, WebServerSecret: '' },
});

export const getWebServerSettings = (): WebServerSettings => {
    const settings = store.get(storeName);
    return {
        enabled: !!settings?.enabled,
        port: Number.isInteger(settings?.port) ? settings.port : DEFAULT_WEB_SERVER_PORT,
        pin: typeof settings?.pin === 'string' ? settings.pin : '',
    };
};

export const setWebServerSettings = (settings: WebServerSettings): void => {
    store.set(storeName, settings);
};

// Signs the login cookie; generated once, so browsers stay logged in across restarts
export const getWebServerSecret = (): string => {
    let secret = store.get('WebServerSecret');
    if (!secret) {
        secret = randomBytes(32).toString('hex');
        store.set('WebServerSecret', secret);
    }
    return secret;
};
