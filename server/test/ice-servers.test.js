const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

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
