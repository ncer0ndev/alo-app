function createMailer(env = process.env, request = fetch) {
  const from = (env.MAIL_FROM || '').trim();
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(from);
  const sender = { name: match ? match[1].trim() || 'ALO' : 'ALO', email: match ? match[2].trim() : from };
  const provider = env.BREVO_API_KEY ? 'brevo' : 'resend';
  const key = provider === 'brevo' ? env.BREVO_API_KEY : env.RESEND_API_KEY;
  const available = Boolean(key && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender.email) && env.PUBLIC_APP_URL);
  return {
    available,
    async send({ to, subject, text }) {
      if (!available) throw new Error('E-posta hizmeti henüz etkinleştirilmedi.');
      const brevo = provider === 'brevo';
      const response = await request(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(brevo ? { 'api-key': key } : { Authorization: `Bearer ${key}` }) },
        body: JSON.stringify(brevo ? { sender, to: [{ email: to }], subject, textContent: text } : { from, to, subject, text }),
        signal: AbortSignal.timeout(15000),
      });
      // Never expose the provider response: it can contain recipient or account details.
      if (!response.ok) throw new Error('E-posta gönderilemedi. Biraz sonra tekrar dene.');
    },
  };
}
module.exports = { createMailer };
