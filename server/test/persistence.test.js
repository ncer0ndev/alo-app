const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');

const TEST_DB = path.join(__dirname, `.persist-${process.pid}.db`);
const TEST_PORT = 3212;

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      // dosya olmayabilir, sorun degil
    }
  }
});

function runWorker(action) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, '..', 'testutil', 'persistence-worker.js'), [action], {
      env: { ...process.env, JWT_SECRET: 'test-secret-only-for-automated-tests', PORT: String(TEST_PORT), DB_PATH: TEST_DB },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('worker zaman asimina ugradi'));
    }, 15000);
    child.on('message', (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

test('veri, sunucu surecinin tamamen yeniden baslatilmasindan sonra korunur', async () => {
  const first = await runWorker('register');
  assert.equal(first.status, 200, `ilk surecte kayit basarisiz oldu: ${JSON.stringify(first.body)}`);

  // ayri bir node sureci: ayni DB_PATH ile yeniden baslatilan gercek bir sunucu ornegini temsil eder
  const second = await runWorker('login');
  assert.equal(second.status, 200, `ikinci (yeni) surecte giris basarisiz oldu: ${JSON.stringify(second.body)}`);
  assert.equal(second.body.username, 'persisttest');
});
