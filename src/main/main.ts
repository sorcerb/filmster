import { app, BrowserWindow, protocol } from 'electron';
import path from 'path';
import contextMenu from 'electron-context-menu';
import './ipcHandlers';
import { MEDIA_SCHEME, POSTER_SCHEME, registerMediaProtocol } from './mediaProtocol';
import { applyWebServerSettings } from './webServer';
import { enqueueMissingMetadata } from './autoMetadata';
import * as packageJson from '../../package.json';
import { getLanguage } from '../renderer/stores/LanguageStore';
import { translate } from '../shared/i18n';

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
      visible: !!(parameters.selectionText && parameters.selectionText.trim().length > 0 && parameters.isEditable),
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
  // Create the browser window.
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

  // and load the index.html of the app.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  const isDev = !app.isPackaged;
  // Open the DevTools.
  if (isDev)
    mainWindow.webContents.openDevTools();

  // Ctrl+Shift+I toggles DevTools (also in production builds for debugging)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  registerMediaProtocol();
  createWindow();
  applyWebServerSettings();
  enqueueMissingMetadata();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow };