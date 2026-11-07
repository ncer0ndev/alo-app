const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const adapter = require('./db-adapter');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function createRecovery({ db, sendMail, publicUrl, invalidateSessions = () => {} }) {
  async function issue(userId, kind, email) {
    const recent = await adapter.query({ sql: 'SELECT token_hash FROM account_tokens WHERE user_id = ? AND kind = ? AND expires_at > ?', args: [userId, kind, Date.now() + 29 * 60 * 1000] });
    if (recent.rows.length) return;
    const token = crypto.randomBytes(32).toString('hex');
    await adapter.batch([
      { sql: 'DELETE FROM account_tokens WHERE expires_at <= ?', args: [Date.now()] },
      { sql: 'DELETE FROM account_tokens WHERE user_id = ? AND kind = ?', args: [userId, kind] },
      { sql: 'INSERT INTO account_tokens(token_hash,user_id,kind,email,expires_at,version) SELECT ?,id,?,?,?,recovery_version FROM users WHERE id = ?', args: [hash(token), kind, email, Date.now() + 30 * 60 * 1000, userId] },
    ]);
    const link = new URL('/account/', publicUrl);
    link.hash = new URLSearchParams({ action: kind, token }).toString();
    try {
      await sendMail({ to: email, subject: kind === 'verify' ? 'ALO: E-posta adresini doğrula' : 'ALO: Şifreni sıfırla', text: `İşlemi tamamlamak için bağlantıyı aç:\n${link.href}\n\nBağlantı 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı yok say.` });
    } catch (error) {
      await adapter.query({ sql: 'DELETE FROM account_tokens WHERE token_hash = ?', args: [hash(token)] });
      throw error;
    }
  }
  return {
    async status(userId) {
      const user = await db.getUserById(userId);
      const pending = await adapter.query({ sql: "SELECT email FROM account_tokens WHERE user_id = ? AND kind = 'verify' AND expires_at > ?", args: [userId, Date.now()] });
      return { email: user.email || null, pendingEmail: pending.rows[0]?.email || null };
    },
    async addEmail(userId, email, password) {
      email = normalizeEmail(email);
      if (!validEmail(email)) throw new Error('Geçerli bir e-posta adresi gir.');
      const user = await db.getUserById(userId);
      if (typeof password !== 'string' || password.length > 72 || !await bcrypt.compare(password, user.password_hash)) throw new Error('Mevcut şifren hatalı.');
      await issue(userId, 'verify', email);
    },
    async forgot(email) {
      email = normalizeEmail(email);
      if (!validEmail(email)) return;
      const result = await adapter.query({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
      if (result.rows[0]) await issue(result.rows[0].id, 'reset', email);
    },
    async consume(kind, token, password) {
      if (!validToken(token) || !['verify', 'reset'].includes(kind)) throw new Error('Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı iste.');
      if (kind === 'reset' && (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password) > 72)) throw new Error('Şifren en az 6 karakter ve en fazla 72 bayt olmalı.');
      const tokenHash = hash(token);
      const assignment = kind === 'verify' ? 'email = (SELECT email FROM account_tokens WHERE token_hash = ?)' : 'password_hash = ?, auth_version = auth_version + 1';
      const value = kind === 'verify' ? tokenHash : await bcrypt.hash(password, 10);
      const result = await adapter.batch([
        { sql: `UPDATE users SET ${assignment}, recovery_version = recovery_version + 1 WHERE id = (SELECT user_id FROM account_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?) AND recovery_version = (SELECT version FROM account_tokens WHERE token_hash = ?) RETURNING id`, args: [value, tokenHash, kind, Date.now(), tokenHash] },
        { sql: `DELETE FROM account_tokens WHERE user_id = (SELECT user_id FROM account_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?)${kind === 'verify' ? " AND (kind = 'reset' OR token_hash = ?)" : ''}`, args: kind === 'verify' ? [tokenHash, kind, Date.now(), tokenHash] : [tokenHash, kind, Date.now()] },
      ]);
      if (!result[0].rows.length) throw new Error('Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı iste.');
      if (kind === 'reset') invalidateSessions(Number(result[0].rows[0].id));
    },
  };
}

function mountRecovery(app, { requireAuth, ...options }) {
  const mailer = require('./mail').createMailer();
  const configured = mailer.available;
  const service = createRecovery({ ...options, publicUrl: process.env.PUBLIC_APP_URL || 'https://alo-app.onrender.com', sendMail: mailer.send });
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Çok fazla deneme yaptın. 15 dakika sonra tekrar dene.' } });
  const route = fn => async (req, res) => { try { await fn(req, res); } catch { res.status(400).json({ error: 'İşlem tamamlanamadı. Şifreni, adresini veya bağlantının süresini kontrol edip tekrar dene.' }); } };
  const enabled = (_req, res, next) => configured ? next() : res.status(503).json({ error: 'E-posta hizmeti henüz etkinleştirilmedi. Lütfen daha sonra tekrar dene.' });
  app.get('/api/account/email', requireAuth, route(async (req, res) => res.json({ ...await service.status(req.userId), available: configured })));
  app.post('/api/account/email', requireAuth, limiter, enabled, route(async (req, res) => { await service.addEmail(req.userId, req.body.email, req.body.password); res.json({ message: 'Doğrulama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.' }); }));
  app.post('/api/account/forgot', limiter, enabled, route(async (req, res) => {
    // Delivery failures must not reveal whether this address belongs to an account.
    try { await service.forgot(req.body.email); } catch { console.error('Şifre sıfırlama e-postası gönderilemedi.'); }
    res.json({ message: 'Bu adresle doğrulanmış bir hesap varsa sıfırlama bağlantısı gönderildi.' });
  }));
  app.post('/api/account/verify', limiter, route(async (req, res) => { await service.consume('verify', req.body.token); res.json({ message: 'E-posta adresin doğrulandı. ALO’ya dönebilirsin.' }); }));
  app.post('/api/account/reset', limiter, route(async (req, res) => { await service.consume('reset', req.body.token, req.body.password); res.json({ message: 'Şifren değiştirildi. ALO’ya yeni şifrenle giriş yapabilirsin.' }); }));
}
module.exports = { createRecovery, mountRecovery };
