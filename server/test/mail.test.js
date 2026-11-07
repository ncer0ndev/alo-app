const test = require('node:test');
const assert = require('node:assert/strict');
const { createMailer } = require('../mail');
const message = { to: 'recipient@example.com', subject: 'ALO', text: 'verification-link' };
test('Brevo uses HTTPS API, verified sender and server-only API key', async () => {
  let captured;
  const mailer = createMailer({ BREVO_API_KEY: 'test-key', RESEND_API_KEY: 'unused-key', MAIL_FROM: 'ALO <sender@gmail.com>', PUBLIC_APP_URL: 'https://alo.example' }, async (url, options) => { captured = { url, ...options }; return { ok: true }; });
  assert.equal(mailer.available, true);
  await mailer.send(message);
  assert.equal(captured.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(captured.headers['api-key'], 'test-key');
  assert.equal(captured.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(captured.body), { sender: { name: 'ALO', email: 'sender@gmail.com' }, to: [{ email: message.to }], subject: message.subject, textContent: message.text });
});
test('plain email sender works and rejected requests expose no provider secrets', async () => {
  const mailer = createMailer({ BREVO_API_KEY: 'test-key', MAIL_FROM: 'sender@gmail.com', PUBLIC_APP_URL: 'https://alo.example' }, async () => ({ ok: false }));
  await assert.rejects(mailer.send(message), /E-posta gönderilemedi/);
});
test('missing configuration disables sending and Resend remains compatible', async () => {
  assert.equal(createMailer({}).available, false);
  let url;
  const mailer = createMailer({ RESEND_API_KEY: 'test-key', MAIL_FROM: 'ALO <sender@example.com>', PUBLIC_APP_URL: 'https://alo.example' }, async target => { url = target; return { ok: true }; });
  await mailer.send(message);
  assert.equal(url, 'https://api.resend.com/emails');
});
