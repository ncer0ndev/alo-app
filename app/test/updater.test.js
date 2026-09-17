const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setupUpdater } = require('../updater');

function fixture(packaged = true) {
  const app = Object.assign(new EventEmitter(), { isPackaged: packaged, getVersion: () => '1.0.0' });
  const updater = new EventEmitter();
  let checks = 0;
  let installs = 0;
  let response = 0;
  const messages = [];
  updater.checkForUpdates = async () => { checks++; return {}; };
  updater.quitAndInstall = () => { installs++; };
  const controller = setupUpdater({ app, autoUpdater: updater,
    dialog: { showMessageBox: async (options) => { messages.push(options); return { response }; } },
    Menu: { buildFromTemplate: x => x, setApplicationMenu() {} }, getWindow: () => null,
    timers: { setTimeout: () => ({}), setInterval: () => ({}), clearTimeout() {}, clearInterval() {} },
  });
  return { app, updater, controller, messages, checks: () => checks, installs: () => installs, choose: x => { response = x; } };
}

test('development does not request releases', async () => {
  const f = fixture(false);
  await f.controller.check(true);
  assert.equal(f.checks(), 0);
  assert.equal(f.messages.length, 1);
  f.controller.dispose();
});

test('download never installs without explicit restart choice', async () => {
  const f = fixture();
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  f.updater.emit('update-downloaded');
  await new Promise(setImmediate);
  assert.equal(f.installs(), 0);
  assert.equal(f.messages[0].defaultId, 0);
  f.choose(1);
  await f.controller.check(true);
  assert.equal(f.installs(), process.platform === 'win32' ? 1 : 0);
  f.controller.dispose();
});

test('concurrent checks do not start duplicate downloads', async () => {
  if (process.platform !== 'win32') return;
  const f = fixture();
  let release;
  let requests = 0;
  f.updater.checkForUpdates = () => { requests++; return new Promise(resolve => { release = resolve; }); };
  const first = f.controller.check();
  await f.controller.check();
  assert.equal(requests, 1);
  release({});
  await first;
  f.controller.dispose();
});

test('network errors are quiet in background and retryable', async () => {
  if (process.platform !== 'win32') return;
  const f = fixture();
  f.updater.checkForUpdates = async () => { throw new Error('offline'); };
  await f.controller.check();
  assert.equal(f.messages.length, 0);
  await f.controller.check(true);
  assert.equal(f.messages.length, 1);
  f.controller.dispose();
});

test('quit disposes updater listeners', () => {
  const f = fixture();
  f.app.emit('will-quit');
  assert.equal(f.updater.listenerCount('update-downloaded'), 0);
});
