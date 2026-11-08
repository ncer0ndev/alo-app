const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
function fixture(id = 'a') {
  const sent = [];
  const pc = { signalingState: 'stable', aloOfferEpoch: 0, aloMakingOffer: false, aloIgnoreOffer: false,
    createOffer: async options => ({ type: 'offer', sdp: options?.iceRestart ? 'restart' : 'initial' }),
    async setLocalDescription(sdp) { this.localDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-local-offer' : 'stable'; },
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-remote-offer' : 'stable'; },
    createAnswer: async () => ({ type: 'answer', sdp: 'answer' }),
  };
  const context = { peerConnections: { b: pc }, socket: { id, connected: true, emit: (event, payload) => sent.push({ event, payload }) }, flushPendingCandidates: async () => {}, RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } }, console: { error() {} } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function negotiatePeer('), source.indexOf('async function flushPendingCandidates(')), context);
  vm.runInContext(source.slice(source.indexOf('async function handleSignal('), source.indexOf('function setupSpeakingDetector(')), context);
  return { pc, sent, context };
}
test('ICE recovery actually sends a restart SDP over signalling', async () => {
  const f = fixture(); await f.context.negotiatePeer('b', f.pc, true);
  assert.equal(f.sent[0].event, 'signal'); assert.equal(f.sent[0].payload.data.sdp.sdp, 'restart');
});
test('leaving during offer creation suppresses the stale offer', async () => {
  const f = fixture(); let finish;
  f.pc.createOffer = () => new Promise(resolve => { finish = resolve; });
  const task = f.context.negotiatePeer('b', f.pc, true);
  delete f.context.peerConnections.b; finish({ type: 'offer', sdp: 'stale' });
  assert.equal(await task, false); assert.equal(f.sent.length, 0);
});
test('simultaneous offers use deterministic rollback instead of breaking signalling', async () => {
  const polite = fixture('z'); polite.pc.signalingState = 'have-local-offer';
  await polite.context.handleSignal({ from: 'b', data: { sdp: { type: 'offer', sdp: 'remote' } } });
  assert.equal(polite.sent[0].payload.data.sdp.type, 'answer');
  const impolite = fixture('a'); impolite.pc.signalingState = 'have-local-offer';
  await impolite.context.handleSignal({ from: 'b', data: { sdp: { type: 'offer', sdp: 'remote' } } });
  assert.equal(impolite.sent.length, 0); assert.equal(impolite.pc.aloIgnoreOffer, true);
});
