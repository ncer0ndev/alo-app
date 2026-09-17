const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

// node:http kullanir, global.fetch degil: bu testlerde sunucunun kendi
// Metered cagrisini taklit etmek icin global.fetch mocklaniyor, o yuzden
// istemci tarafindaki istek ayni mock'a yakalanmamali.
function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'ice-servers-isolated-test';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-ice-${randomUUID()}.db`);

const db = require('../db');
const { server, io, ready } = require('../index');

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(process.env.DB_PATH + suffix);
    } catch {
      // dosya olmayabilir
    }
  }
});

test('ice-servers: TURN_URL bos ise sadece STUN doner, virgullu ise dizi olarak doner', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const userId = await db.createUser('iceUser', 'unused-test-hash');
  const token = jwt.sign({ userId, username: 'iceUser' }, process.env.JWT_SECRET);
  const auth = { Authorization: `Bearer ${token}` };

  delete process.env.TURN_URL;
  const withoutTurn = await (await fetch(`${base}/api/ice-servers`, { headers: auth })).json();
  assert.equal(withoutTurn.iceServers.length, 1);
  assert.match(withoutTurn.iceServers[0].urls, /^stun:/);

  process.env.TURN_URL = 'turn:openrelay.metered.ca:80,turn:openrelay.metered.ca:443?transport=tcp';
  process.env.TURN_USERNAME = 'openrelayproject';
  process.env.TURN_CREDENTIAL = 'openrelayproject';
  const withTurn = await (await fetch(`${base}/api/ice-servers`, { headers: auth })).json();
  assert.equal(withTurn.iceServers.length, 2);
  const turnEntry = withTurn.iceServers[1];
  assert.deepEqual(turnEntry.urls, ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp']);
  assert.equal(turnEntry.username, 'openrelayproject');
  assert.equal(turnEntry.credential, 'openrelayproject');

  delete process.env.TURN_URL;
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_CREDENTIAL;
});

test('ice-servers: Metered API onbellek yokken basarisiz olursa TURN_URL yedegine duser', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const userId = await db.createUser('iceUser2', 'unused-test-hash');
  const token = jwt.sign({ userId, username: 'iceUser2' }, process.env.JWT_SECRET);
  const auth = { Authorization: `Bearer ${token}` };

  const realFetch = global.fetch;
  process.env.METERED_APP_NAME = 'testapp';
  process.env.METERED_API_KEY = 'test-key';
  process.env.TURN_URL = 'turn:fallback.example.com:80';
  process.env.TURN_USERNAME = 'fbuser';
  process.env.TURN_CREDENTIAL = 'fbpass';

  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const result = await getJson(`${base}/api/ice-servers`, auth);
    assert.equal(result.iceServers.length, 2);
    assert.equal(result.iceServers[1].urls, 'turn:fallback.example.com:80');
    assert.equal(result.iceServers[1].username, 'fbuser');
  } finally {
    global.fetch = realFetch;
    delete process.env.METERED_APP_NAME;
    delete process.env.METERED_API_KEY;
    delete process.env.TURN_URL;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  }
});

test('ice-servers: METERED_* varsa basarili Metered yaniti kullanilir ve onbelleklenir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const userId = await db.createUser('iceUser3', 'unused-test-hash');
  const token = jwt.sign({ userId, username: 'iceUser3' }, process.env.JWT_SECRET);
  const auth = { Authorization: `Bearer ${token}` };

  const realFetch = global.fetch;
  let callCount = 0;
  const meteredServers = [
    { urls: 'stun:example.metered.live:80' },
    { urls: 'turn:example.metered.live:80', username: 'u1', credential: 'c1' },
  ];

  process.env.METERED_APP_NAME = 'testapp';
  process.env.METERED_API_KEY = 'test-key';

  global.fetch = async (url) => {
    callCount += 1;
    assert.match(url, /^https:\/\/testapp\.metered\.live\/api\/v1\/turn\/credentials\?apiKey=test-key$/);
    return { ok: true, json: async () => meteredServers };
  };
  try {
    const first = await getJson(`${base}/api/ice-servers`, auth);
    assert.deepEqual(first.iceServers, meteredServers);
    assert.equal(callCount, 1);

    // Ayni pencerede ikinci istek onbellekten donmeli, tekrar fetch cagirmamali.
    const second = await getJson(`${base}/api/ice-servers`, auth);
    assert.deepEqual(second.iceServers, meteredServers);
    assert.equal(callCount, 1, 'onbellek suresi dolmadan tekrar Metered API cagirilmamali');
  } finally {
    global.fetch = realFetch;
    delete process.env.METERED_APP_NAME;
    delete process.env.METERED_API_KEY;
  }
});
