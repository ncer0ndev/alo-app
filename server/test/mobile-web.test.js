const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mobileWeb = require('../mobile-web');
test('mobile serves the PWA assets without exposing desktop or server files', async () => {
  const app = express();
  app.get(/^\/mobile$/, (_req, res) => res.redirect(302, '/mobile/'));
  app.use('/mobile', mobileWeb());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/mobile/`;
  try {
    const redirect = await fetch(base.slice(0, -1), { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/mobile/');
    for (const path of ['', 'mobile.js', 'mobile.css', 'sw.js', 'offline.html', 'manifest.webmanifest', 'assets/pwa-192.png', 'assets/pwa-512.png']) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }
    const manifest = await (await fetch(base + 'manifest.webmanifest')).json();
    assert.equal(manifest.display, 'standalone');
    for (const path of ['main.js', 'preload.js', 'package.json', 'test/ui-review.js', '.env', 'node_modules/electron/package.json']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
