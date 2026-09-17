const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, Menu, Tray, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const { setupUpdater } = require('./updater');
const path = require('path');
const fs = require('fs');
const PTT_KEYS = require('./ptt-keys');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  runApp();
}

function runApp() {
  const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico');
  const TRAY_ICON_PATH = path.join(__dirname, 'assets', 'tray-icon.png');
  const CHAT_NOTIFY_DEBOUNCE_MS = 1500;

  let mainWindow;
  let currentPttAccelerator = null;
  let tray = null;
  let updaterCtl = null;
  let backgroundPref = false;
  let isQuitting = false;

  const callNotifications = new Map(); // roomCode -> Notification
  const chatNotifyState = new Map(); // roomCode -> { timer, count, lastFrom, lastText, showContent }

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aloapp.seslisohbet');
  }

  function windowPrefsPath() {
    return path.join(app.getPath('userData'), 'window-prefs.json');
  }

  function readWindowPrefs() {
    try {
      return JSON.parse(fs.readFileSync(windowPrefsPath(), 'utf8'));
    } catch {
      return {};
    }
  }

  function writeWindowPrefs(prefs) {
    try {
      fs.writeFileSync(windowPrefsPath(), JSON.stringify(prefs));
    } catch {
      // sabit ayar bulunamazsa "ilk seferde bildir" davranisi tekrar tetiklenir; kritik degil
    }
  }

  const windowPrefs = readWindowPrefs();

  function isTrustedSender(event) {
    return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
  }

  function isNonEmptyString(value, maxLen = 200) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
  }

  function shouldShowBackgroundNotification() {
    if (!mainWindow || mainWindow.isDestroyed()) return true;
    return !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused();
  }

  function showAndFocus() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }

  function showSystemNotification({ title, body, silent = false }) {
    if (!Notification.isSupported()) return null;
    const notification = new Notification({ title, body, silent, icon: ICON_PATH });
    notification.show();
    return notification;
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 460,
      height: 700,
      resizable: true,
      autoHideMenuBar: false,
      backgroundColor: '#0a0a0a',
      icon: ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
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

    mainWindow.on('close', (event) => {
      if (isQuitting || !backgroundPref) return;
      event.preventDefault();
      mainWindow.hide();
      if (!windowPrefs.backgroundNoticeShown) {
        windowPrefs.backgroundNoticeShown = true;
        writeWindowPrefs(windowPrefs);
        showSystemNotification({
          title: 'Alo // Voice arka planda çalışıyor',
          body: 'Görüşmen ve bağlantın sürüyor. Tamamen kapatmak için tepsi simgesinden "Çıkış"ı seç.',
        });
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function createTray() {
    tray = new Tray(TRAY_ICON_PATH);
    tray.setToolTip('Alo // Voice');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Uygulamayı Aç', click: showAndFocus },
        {
          label: 'Güncellemeleri Denetle',
          click: () => {
            if (updaterCtl) void updaterCtl.check(true).catch(() => {});
          },
        },
        { type: 'separator' },
        {
          label: 'Çıkış',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ])
    );
    tray.on('double-click', showAndFocus);
  }

  app.whenReady().then(() => {
    createWindow();
    updaterCtl = setupUpdater({ app, autoUpdater, dialog, Menu, getWindow: () => mainWindow });
    createTray();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('second-instance', () => {
    showAndFocus();
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

  ipcMain.on('set-background-pref', (event, value) => {
    if (!isTrustedSender(event)) return;
    backgroundPref = value === true;
  });

  ipcMain.on('notify-incoming-call', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const { fromUsername, roomCode } = payload || {};
    if (!isNonEmptyString(fromUsername, 64) || !isNonEmptyString(roomCode, 64)) return;
    if (!shouldShowBackgroundNotification()) return;

    const existing = callNotifications.get(roomCode);
    if (existing) existing.close();

    const notification = showSystemNotification({ title: 'Gelen arama', body: `${fromUsername} seni arıyor` });
    if (!notification) return;
    notification.on('click', () => showAndFocus());
    notification.on('close', () => {
      if (callNotifications.get(roomCode) === notification) callNotifications.delete(roomCode);
    });
    callNotifications.set(roomCode, notification);
  });

  ipcMain.on('clear-call-notification', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const { roomCode } = payload || {};
    if (!isNonEmptyString(roomCode, 64)) return;
    const existing = callNotifications.get(roomCode);
    if (existing) {
      existing.close();
      callNotifications.delete(roomCode);
    }
  });

  ipcMain.on('notify-friend-request', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const { fromUsername } = payload || {};
    if (!isNonEmptyString(fromUsername, 64)) return;
    if (!shouldShowBackgroundNotification()) return;

    const notification = showSystemNotification({
      title: 'Arkadaşlık isteği',
      body: `${fromUsername} sana arkadaşlık isteği gönderdi`,
    });
    notification?.on('click', () => {
      showAndFocus();
      mainWindow?.webContents.send('notification-friend-request-clicked');
    });
  });

  ipcMain.on('notify-chat-message', (event, payload) => {
    if (!isTrustedSender(event)) return;
    const { roomCode, fromUsername, text, showContent } = payload || {};
    if (!isNonEmptyString(roomCode, 64) || !isNonEmptyString(fromUsername, 64) || typeof text !== 'string') return;
    if (!shouldShowBackgroundNotification()) return;

    let state = chatNotifyState.get(roomCode);
    if (!state) {
      state = { timer: null, count: 0, lastFrom: '', lastText: '', showContent: false };
      chatNotifyState.set(roomCode, state);
    }
    state.count += 1;
    state.lastFrom = fromUsername;
    state.lastText = text.slice(0, 120);
    state.showContent = showContent === true;
    if (state.timer) return;

    state.timer = setTimeout(() => {
      chatNotifyState.delete(roomCode);
      const body =
        state.count > 1
          ? `${state.count} yeni mesaj`
          : state.showContent
          ? `${state.lastFrom}: ${state.lastText}`
          : `${state.lastFrom}: Yeni mesaj`;
      const notification = showSystemNotification({ title: 'Sohbet', body });
      notification?.on('click', () => {
        showAndFocus();
        mainWindow?.webContents.send('notification-chat-clicked', { roomCode });
      });
    }, CHAT_NOTIFY_DEBOUNCE_MS);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    for (const state of chatNotifyState.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    chatNotifyState.clear();
  });
}
