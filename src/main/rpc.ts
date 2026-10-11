import { BrowserWindow, ipcMain } from 'electron';

export interface RpcClient {
    // 'local' for the app window, otherwise the id a browser tab generated for itself
    id: string;
    send(channel: string, ...args: unknown[]): void;
}

export type RpcHandler = (client: RpcClient, ...args: any[]) => unknown;

export const LOCAL_CLIENT_ID = 'local';

const handlers = new Map<string, RpcHandler>();

export const handle = (channel: string, handler: RpcHandler) => {
    handlers.set(channel, handler);
    ipcMain.handle(channel, (event, ...args) => handler({
        id: LOCAL_CLIENT_ID,
        send: (eventChannel, ...eventArgs) => {
            if (!event.sender.isDestroyed()) event.sender.send(eventChannel, ...eventArgs);
        },
    }, ...args));
};

export const getHandler = (channel: string): RpcHandler | undefined => handlers.get(channel);

type BroadcastListener = (channel: string, args: unknown[]) => void;
const broadcastListeners = new Set<BroadcastListener>();

export const onBroadcast = (listener: BroadcastListener) => {
    broadcastListeners.add(listener);
    return () => { broadcastListeners.delete(listener); };
};

export const broadcast = (channel: string, ...args: unknown[]) => {
    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(channel, ...args);
    }
    broadcastListeners.forEach(listener => listener(channel, args));
};
