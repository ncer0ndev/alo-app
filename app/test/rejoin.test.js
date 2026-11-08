const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const start = source.indexOf('function rejoinAfterReconnect(');
const end = source.indexOf('\nasync function restoreCallMicrophone', start);
function fixture(room, type) {
  const calls = [], events = [];
  const context = {
    currentRoomCode: room, currentRoomType: type,
    roomGeneration: 0, roomRecovery: null, roomRejoinTimer: null, socket: { id: 'local-socket', connected: true },
    clearTimeout() {}, setTimeout() { return 1; },
    restoreCallMicrophone: async () => true,
    teardownCurrentRoomState() { context.currentRoomCode = null; },
    cleanupAllPeers() {}, renderParticipants() {}, applyChatHistory() {},
    joinRoomAck: async code => { calls.push(['room', code]); return { existingPeers: [] }; },
    emitWithTimeout: async (name, payload) => { calls.push([name, payload]); return { existingPeers: [] }; },
    document: { dispatchEvent: event => events.push(event.type) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    showToast() {}, showScreen() {}, joinScreen: {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, calls, events };
}
test('community reconnect rejoins its channel before restoring screen publishing', async () => {
  const f = fixture('CH42', 'server-channel');
  await f.context.rejoinAfterReconnect();
  assert.equal(f.calls[0][0], 'join-server-channel');
  assert.equal(f.calls[0][1].channelId, 42);
  assert.deepEqual(f.events, ['alo-room-rejoined']);
});
test('regular room reconnect keeps normal joining and leaving cancels recovery', async () => {
  const f = fixture('ABC123', 'room');
  await f.context.rejoinAfterReconnect();
  assert.deepEqual(f.calls[0], ['room', 'ABC123']);
  f.context.currentRoomCode = null;
  await f.context.rejoinAfterReconnect();
  assert.equal(f.calls.length, 1);
});
test('a stale room response does not restore a share after leaving', async () => {
  const f = fixture('CH42', 'server-channel');
  f.context.emitWithTimeout = async () => { f.context.currentRoomCode = null; return { existingPeers: [] }; };
  await f.context.rejoinAfterReconnect();
  assert.equal(f.events.length, 0);
});
test('concurrent reconnect requests share one room join', async () => {
  const f = fixture('CH42', 'server-channel');
  let finish, calls = 0;
  f.context.emitWithTimeout = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = f.context.rejoinAfterReconnect(); const second = f.context.rejoinAfterReconnect();
  assert.equal(calls, 1); assert.equal(first, second);
  finish({ existingPeers: [] }); await first;
});
test('transport timeout keeps call context while a removed room tears it down', async () => {
  const f = fixture('CH42', 'server-channel');
  f.context.emitWithTimeout = async () => ({ error: 'zaman aşımı, tekrar dene' });
  await f.context.rejoinAfterReconnect(); assert.equal(f.context.currentRoomCode, 'CH42');
  f.context.emitWithTimeout = async () => ({ error: 'kanal bulunamadi' });
  await f.context.rejoinAfterReconnect(); assert.equal(f.context.currentRoomCode, null);
});
