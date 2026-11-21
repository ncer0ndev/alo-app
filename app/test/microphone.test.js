const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
function fixture(errors = []) {
  const calls = [], saved = [], stream = {};
  const context = {
    navigator: { mediaDevices: { async getUserMedia(options) {
      calls.push(options); const error = errors.shift(); if (error) throw error; return stream;
    } } },
    getSettings: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
    saveSetting: (...args) => saved.push(args), micSelect: { value: 'old' }, showToast() {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function callAudioConstraints('), source.indexOf('async function acquireMicStream(')), context);
  return { context, calls, saved, stream };
}
test('missing saved microphone falls back and saves default only after successful capture', async () => {
  const f = fixture([{ name: 'OverconstrainedError', constraint: 'deviceId' }]);
  assert.equal(await f.context.requestMicStream('old'), f.stream);
  assert.equal(f.calls[0].audio.deviceId.exact, 'old');
  assert.equal(f.calls[1].audio.deviceId, undefined);
  assert.deepEqual(f.saved, [['micDeviceId', '']]);
});
test('permission, busy device and unrelated constraints are not retried', async () => {
  for (const error of [{ name: 'NotAllowedError' }, { name: 'NotReadableError' }, { name: 'OverconstrainedError', constraint: 'sampleRate' }]) {
    const f = fixture([error]);
    await assert.rejects(f.context.requestMicStream('old'));
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0);
  }
});
test('failed default capture preserves the saved choice', async () => {
  const f = fixture([{ name: 'NotFoundError' }, { name: 'NotFoundError' }]);
  await assert.rejects(f.context.requestMicStream('old'));
  assert.equal(f.saved.length, 0);
});
