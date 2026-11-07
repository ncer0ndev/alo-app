const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { io: client } = require('socket.io-client');
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.BREVO_API_KEY;
process.env.DB_PATH = path.join(os.tmpdir(), `alo-recovery-http-${randomUUID()}.db`);
process.env.PORT = '0';
process.env.JWT_SECRET = 'recovery-test-secret-not-for-production';
const { server, io, ready } = require('../index');
const db = require('../db');
const { createRecovery } = require('../account-recovery');
let base;
test.before(async () => { await ready; if (!server.listening) await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { io.close(); server.closeAllConnections(); server.close(); for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch {} } });
async function post(url, body) { return fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
test('reset revokes old HTTP tokens, disconnects sockets and allows new login', async () => {
  const account = await (await post('/api/register', { username: 'resetHttp', password: 'oldpassword' })).json();
  const socket = client(base, { auth: { token: account.token }, reconnection: false });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const messages = [];
    const recovery = createRecovery({ db, publicUrl: base, sendMail: async mail => messages.push(mail), invalidateSessions(id) { for (const s of io.sockets.sockets.values()) if (Number(s.data.userId) === id) s.disconnect(true); } });
    const user = await db.getUserByUsername('resetHttp');
    const tokenFrom = mail => new URLSearchParams(new URL(mail.text.split('\n')[1]).hash.slice(1)).get('token');
    await recovery.addEmail(user.id, 'http@example.com', 'oldpassword');
    await recovery.consume('verify', tokenFrom(messages.at(-1)));
    await recovery.forgot('http@example.com');
    const disconnected = new Promise(resolve => socket.once('disconnect', resolve));
    await recovery.consume('reset', tokenFrom(messages.at(-1)), 'newpassword');
    await disconnected;
    assert.equal((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).status, 401);
    assert.equal((await post('/api/login', { username: 'resetHttp', password: 'oldpassword' })).status, 401);
    const login = await post('/api/login', { username: 'resetHttp', password: 'newpassword' });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.equal((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    const stale = client(base, { auth: { token: account.token }, reconnection: false });
    try { await new Promise((resolve, reject) => { stale.once('connect_error', resolve); stale.once('connect', () => reject(Error('old token was accepted'))); }); } finally { stale.close(); }
  } finally { socket.close(); }
});
test('unconfigured email delivery is explicit and account page is accessible', async () => {
  assert.equal((await post('/api/account/forgot', { email: 'missing@example.com' })).status, 503);
  assert.equal((await fetch(base + '/api/account/email')).status, 401);
  const page = await fetch(base + '/account/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /no-referrer/);
});
