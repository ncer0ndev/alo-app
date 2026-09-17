const { contextBridge, ipcRenderer, clipboard } = require('electron');
const PTT_KEYS = require('./ptt-keys');

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
});
