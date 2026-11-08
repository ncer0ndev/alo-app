const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecovery, summarizeStats } = require('../call-health');
function fixture() {
  let state = 'disconnected', calls = 0, exhausted = 0;
  const jobs = new Map(); let sequence = 0;
  const controller = createRecovery({ getState: () => state, negotiate: async () => { calls++; return true; }, onExhausted: () => exhausted++, timers: { setTimeout(fn) { jobs.set(++sequence, fn); return sequence; }, clearTimeout(id) { jobs.delete(id); } } });
  return { controller, jobs, setState(value) { state = value; }, calls: () => calls, exhausted: () => exhausted, async tick() { const entry = jobs.entries().next().value; if (!entry) return; jobs.delete(entry[0]); entry[1](); await new Promise(setImmediate); } };
}
test('temporary disconnect is debounced and a successful connection cancels recovery', async () => {
  const f = fixture(); f.controller.changed(); assert.equal(f.calls(), 0);
  f.setState('connected'); f.controller.changed(); await f.tick(); assert.equal(f.calls(), 0);
  f.setState('failed'); f.controller.changed(); await f.tick(); assert.equal(f.calls(), 1);
  f.controller.dispose(); assert.equal(f.jobs.size, 0);
});
test('recovery retries are bounded and manual retry can restart them', async () => {
  const f = fixture(); f.controller.changed();
  for (let i = 0; i < 5; i++) await f.tick();
  assert.equal(f.calls(), 3); assert.equal(f.exhausted(), 1);
  await f.controller.recover(); assert.equal(f.calls(), 4);
  f.controller.dispose();
});
test('disposing during negotiation prevents delayed reconnect work', async () => {
  let finish; const jobs = [];
  const controller = createRecovery({ getState: () => 'failed', negotiate: () => new Promise(resolve => { finish = resolve; }), timers: { setTimeout(fn) { jobs.push(fn); return 1; }, clearTimeout() {} } });
  const pending = controller.recover(); controller.dispose(); finish(true); await pending;
  assert.equal(jobs.length, 0);
});
test('quality uses selected candidate pair and interval loss, handles counter resets', () => {
  const report = (lost, received) => new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'active' }],
    ['active', { id: 'active', type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: .1 }],
    ['old', { id: 'old', type: 'candidate-pair', state: 'succeeded', nominated: true, currentRoundTripTime: 4 }],
    ['audio', { id: 'audio', type: 'inbound-rtp', kind: 'audio', jitter: .01, packetsLost: lost, packetsReceived: received }],
  ]);
  const first = summarizeStats(report(10, 90)); assert.equal(first.loss, null); assert.equal(first.rtt, 100);
  const second = summarizeStats(report(20, 180), first.next); assert.equal(second.loss, 10); assert.equal(second.grade, 'poor');
  const reset = summarizeStats(report(0, 2), second.next); assert.equal(reset.loss, null);
  assert.equal(summarizeStats(new Map()).grade, 'unknown');
});
