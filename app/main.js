const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');

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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile('index.html');
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

ipcMain.on('register-ptt-shortcut', (event, { key }) => {
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
