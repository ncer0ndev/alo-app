const { contextBridge, ipcRenderer, clipboard } = require('electron');
// Not: sandbox:true altinda preload'un kendi PTT_KEYS'i, main.js'in ayrica
// require('./ptt-keys') ile okudugu ayni dosyadan; burada satir ici tutuluyor
// cunku bu Electron surumunde sandboxlanmis preload icinde yerel dosyaya
// goreli require ("./ptt-keys") sessizce basarisiz olup butun preload'u
// (dolayisiyla window.api'yi) yuklenemez hale getiriyor.
const PTT_KEYS = [
  'Space', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Num0', 'Num1', 'Num2', 'Num3', 'Num4', 'Num5', 'Num6', 'Num7', 'Num8', 'Num9',
];

contextBridge.exposeInMainWorld('api', {
  pttKeyOptions: PTT_KEYS,

  copyToClipboard: (text) => {
    if (typeof text === 'string') clipboard.writeText(text);
  },

  registerPttShortcut: (key) => {
    if (PTT_KEYS.includes(key)) ipcRenderer.send('register-ptt-shortcut', { key });
  },

  unregisterPttShortcut: () => ipcRenderer.send('unregister-ptt-shortcut'),

  onPttToggle: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('ptt-toggle', listener);
    return () => ipcRenderer.removeListener('ptt-toggle', listener);
  },

  onPttRegisterResult: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ptt-register-result', listener);
    return () => ipcRenderer.removeListener('ptt-register-result', listener);
  },

  setBackgroundPref: (value) => ipcRenderer.send('set-background-pref', !!value),

  notifyIncomingCall: (data) => {
    const { fromUsername, roomCode } = data || {};
    if (typeof fromUsername === 'string' && typeof roomCode === 'string') {
      ipcRenderer.send('notify-incoming-call', { fromUsername, roomCode });
    }
  },

  clearCallNotification: (roomCode) => {
    if (typeof roomCode === 'string') ipcRenderer.send('clear-call-notification', { roomCode });
  },

  notifyFriendRequest: (data) => {
    const { fromUsername } = data || {};
    if (typeof fromUsername === 'string') ipcRenderer.send('notify-friend-request', { fromUsername });
  },

  notifyChatMessage: (data) => {
    const { roomCode, fromUsername, text, showContent } = data || {};
    if (typeof roomCode === 'string' && typeof fromUsername === 'string' && typeof text === 'string') {
      ipcRenderer.send('notify-chat-message', { roomCode, fromUsername, text, showContent: !!showContent });
    }
  },

  onNotificationFriendRequestClicked: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('notification-friend-request-clicked', listener);
    return () => ipcRenderer.removeListener('notification-friend-request-clicked', listener);
  },

  onNotificationChatClicked: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification-chat-clicked', listener);
    return () => ipcRenderer.removeListener('notification-chat-clicked', listener);
  },

  notifyDirectMessage: (data) => {
    const { fromUsername, text, showContent } = data || {};
    if (typeof fromUsername === 'string' && typeof text === 'string') {
      ipcRenderer.send('notify-dm-message', { fromUsername, text, showContent: !!showContent });
    }
  },

  onNotificationDmClicked: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification-dm-clicked', listener);
    return () => ipcRenderer.removeListener('notification-dm-clicked', listener);
  },

  notifyCommunityMessage: (data) => {
    const { serverId, channelId, channelName, fromUsername, text, showContent } = data || {};
    if (
      Number.isInteger(serverId) &&
      Number.isInteger(channelId) &&
      typeof channelName === 'string' &&
      typeof fromUsername === 'string' &&
      typeof text === 'string'
    ) {
      ipcRenderer.send('notify-community-message', { serverId, channelId, channelName, fromUsername, text, showContent: !!showContent });
    }
  },

  onNotificationCommunityClicked: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification-community-clicked', listener);
    return () => ipcRenderer.removeListener('notification-community-clicked', listener);
  },

  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),

  setLaunchAtLogin: (value) => ipcRenderer.send('set-launch-at-login', !!value),

  setGameDetectionEnabled: (value) => ipcRenderer.send('set-game-detection-enabled', !!value),

  onGameDetected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('game-detected', listener);
    return () => ipcRenderer.removeListener('game-detected', listener);
  },

  onUpdateInstalling: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('update-installing', listener);
    return () => ipcRenderer.removeListener('update-installing', listener);
  },
});
