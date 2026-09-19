// Local-only review server. Uses a disposable DB and never contacts production.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-ui-test-'));
process.env.PORT = '0';
process.env.JWT_SECRET = randomUUID();
process.env.DB_PATH = path.join(scratch, 'test.db');
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
const backend = require('../../server/index');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
(async () => {
  await backend.ready;
  if (!backend.server.listening) await new Promise((resolve) => backend.server.once('listening', resolve));
  const base = `http://127.0.0.1:${backend.server.address().port}`;
  async function post(url, data, token) {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  }
  const owner = await post('/api/register', { username: 'arayuztest', password: 'LocalTest!123' });
  const member = await post('/api/register', { username: 'deniz', password: 'LocalTest!123' });
  await post('/api/friends/request', { username: 'deniz' }, owner.token);
  await post('/api/friends/accept', { username: 'arayuztest' }, member.token);
  const community = await post('/api/servers', { name: 'Gece Kuşları • Oyun ve Sohbet' }, owner.token);
  await post('/api/servers/join', { inviteCode: community.inviteCode }, member.token);
  await post(`/api/servers/${community.id}/channels`, { name: 'Oyun odası', type: 'voice' }, owner.token);
  const preview = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/test/bootstrap.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`localStorage.setItem('token',${JSON.stringify(owner.token)});localStorage.setItem('username','arayuztest');if(!localStorage.getItem('uiMode'))localStorage.setItem('uiMode','modern');if(!localStorage.getItem('theme'))localStorage.setItem('theme','modern');`);
      return;
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/test/ui-review.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    let content = fs.readFileSync(file);
    if (file === path.join(root, 'index.html')) {
      content = content.toString().replace("https://alo-app.onrender.com wss://alo-app.onrender.com", `${base} ${base.replace('http:', 'ws:')}`).replace('<script src="theme-init.js">', '<script src="test/bootstrap.js"></script><script src="theme-init.js">');
    }
    if (file === path.join(root, 'renderer.js')) content = content.toString().replace('https://alo-app.onrender.com', base);
    res.end(content);
  });
  preview.listen(45422, '127.0.0.1', () => console.log('UI review: http://127.0.0.1:45422'));
  process.on('SIGINT', () => { preview.close(); backend.io.close(); fs.rmSync(scratch, { recursive: true, force: true }); process.exit(); });
})();
