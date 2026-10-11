import { app, BrowserWindow, protocol, shell } from 'electron';
import path from 'path';
import contextMenu from 'electron-context-menu';
import './ipcHandlers';
import { MEDIA_SCHEME, POSTER_SCHEME, registerMediaProtocol } from './mediaProtocol';
import { applyWebServerSettings } from './webServer';
import { enqueueMissingMetadata } from './autoMetadata';
import './episodeMarkers';
import { initGarbageCollector } from './garbageCollector';
import { initAutoUpdate } from './updater';
import * as packageJson from '../../package.json';
import { getLanguage } from '../renderer/stores/LanguageStore';
import { isCyrillicLanguage, translate } from '../shared/i18n';

const appVersion = packageJson.version;

// Must be called before app 'ready'
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } },
  { scheme: POSTER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

contextMenu({
  showInspectElement: false,
  prepend: (defaultActions, parameters, browserWindow) => [
    {
      label: translate(getLanguage(), 'main.convertToCyrillic'),
      visible: isCyrillicLanguage(getLanguage()) && !!(parameters.selectionText && parameters.selectionText.trim().length > 0 && parameters.isEditable),
      click: () => {
        if (browserWindow && 'webContents' in browserWindow) {
          browserWindow.webContents.send('convert-selection', parameters.selectionText);
        }
      }
    }
  ]
});

let mainWindow: BrowserWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 1000,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'assets/icon.ico')
      : path.join(__dirname, '../../src/assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true
    }
  })

  mainWindow.maximize()

  mainWindow.setTitle(`Filmster ${appVersion}`);
  // index.html has no <title>, so on load or reload Electron would replace the window title
  // with the page address ("index.html" in the installed app, "localhost:5173" in dev)
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === new URL(mainWindow.webContents.getURL()).origin) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  const isDev = !app.isPackaged;
  if (isDev)
    mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
};

app.on('ready', () => {
  registerMediaProtocol();
  createWindow();
  applyWebServerSettings();
  enqueueMissingMetadata();
  initAutoUpdate();
  initGarbageCollector();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow };