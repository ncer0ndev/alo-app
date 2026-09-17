const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const PTT_KEYS = require('./ptt-keys');

let mainWindow;
let currentPttAccelerator = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 700,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function unregisterPtt() {
  if (currentPttAccelerator) {
    globalShortcut.unregister(currentPttAccelerator);
    currentPttAccelerator = null;
  }
}

ipcMain.on('register-ptt-shortcut', (event, config) => {
  const key = config && config.key;
  if (!PTT_KEYS.includes(key)) return;

  unregisterPtt();
  const success = globalShortcut.register(key, () => {
    mainWindow?.webContents.send('ptt-toggle');
  });
  currentPttAccelerator = success ? key : null;
  event.reply('ptt-register-result', { success, key });
});

ipcMain.on('unregister-ptt-shortcut', () => {
  unregisterPtt();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
