const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const start = source.indexOf('async function rejoinAfterReconnect()');
const end = source.indexOf('\nfunction setFriendOnline', start);
function fixture(room, type) {
  const calls = [], events = [];
  const context = {
    currentRoomCode: room, currentRoomType: type,
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
