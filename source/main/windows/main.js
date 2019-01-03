import path from 'path';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { environment } from '../environment';
import ipcApi from '../ipc';
import RendererErrorHandler from '../utils/rendererErrorHandler';
import { launcherConfig } from '../config';

const rendererErrorHandler = new RendererErrorHandler();

const { isDev, isTest, buildLabel, isLinux } = environment;

export const createMainWindow = (isInSafeMode) => {
  const windowOptions = {
    show: false,
    width: 1150,
    height: 870,
    webPreferences: {
      nodeIntegration: isTest,
      webviewTag: false,
      // enableRemoteModule: isTest,
      enableRemoteModule: true, // TODO: revert to original state
      preload: path.join(__dirname, './preload.js')
    }
  };

  if (isLinux) {
    windowOptions.icon = path.join(launcherConfig.statePath, 'icon.png');
  }

  // Construct new BrowserWindow
  const window = new BrowserWindow(windowOptions);

  rendererErrorHandler.setup(window, createMainWindow);

  window.setMinimumSize(905, 600);

  // Initialize our ipc api methods that can be called by the render processes
  ipcApi({ window });

  // Provide render process with an api to resize the main window
  ipcMain.on('resize-window', (event, { width, height, animate }) => {
    if (event.sender !== window.webContents) return;
    window.setSize(width, height, animate);
  });

  // Provide render process with an api to close the main window
  ipcMain.on('close-window', (event) => {
    if (event.sender !== window.webContents) return;
    window.close();
  });

  if (isDev) {
    window.webContents.openDevTools();
    // Focus the main window after dev tools opened
    window.webContents.on('devtools-opened', () => {
      window.focus();
      setImmediate(() => {
        window.focus();
      });
    });
  }

  window.loadURL(`file://${__dirname}/../renderer/index.html`);
  window.on('page-title-updated', event => { event.preventDefault(); });

  let title = buildLabel;
  if (isInSafeMode) title += ' [GPU safe mode]';
  window.setTitle(title);

  window.webContents.on('context-menu', (e, props) => {
    const contextMenuOptions = [
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    ];

    if (isDev || isTest) {
      const { x, y } = props;
      contextMenuOptions.push({
        label: 'Inspect element',
        click() {
          window.inspectElement(x, y);
        }
      });
    }

    Menu.buildFromTemplate(contextMenuOptions).popup(window);
  });

  window.webContents.on('did-finish-load', () => {
    if (isTest) {
      window.showInactive(); // show without focusing the window
    } else {
      window.show(); // show also focuses the window
    }
  });

  window.on('closed', () => {
    app.quit();
  });

  window.webContents.on('did-fail-load', (err) => {
    rendererErrorHandler.onError('did-fail-load', err);
  });

  window.webContents.on('crashed', (err) => {
    rendererErrorHandler.onError('crashed', err);
  });

  return window;
};
