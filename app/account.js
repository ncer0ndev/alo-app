(() => {
  const section = document.createElement('section');
  section.className = 'social-tools account-email-settings';
  section.innerHTML = `<h3>E-POSTA VE HESAP KURTARMA</h3>
    <p class="hint-text">Şifreni unutursan hesabını kurtarmak için e-posta adresini doğrula. Mevcut hesabını kullanmaya devam edebilirsin.</p>
    <p class="account-email-state" role="status"></p>
    <form class="account-email-form"><label class="field">E-posta adresi<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
    <label class="field">Mevcut şifren<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label>
    <button class="btn" type="submit">Doğrulama bağlantısı gönder</button></form>
    <button class="btn btn-secondary account-email-refresh" type="button">Doğrulama durumunu yenile</button>
    <p class="hint-text account-email-result" role="status" aria-live="polite"></p>`;
  document.querySelector('#tab-settings').prepend(section);
  const result = section.querySelector('.account-email-result');
  async function refresh() {
    const { token } = getSession();
    if (!token) return;
    try {
      const response = await fetch(`${getServerUrl()}/api/account/email`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'E-posta bilgisi alınamadı.');
      section.querySelector('.account-email-state').textContent = data.email ? `Doğrulanmış adres: ${data.email}` : 'Henüz doğrulanmış e-posta adresin yok.';
      if (data.pendingEmail) section.querySelector('.account-email-state').textContent += ` Doğrulama bekliyor: ${data.pendingEmail}`;
      section.querySelector('button[type="submit"]').disabled = !data.available;
      if (!data.available) result.textContent = 'E-posta hizmeti henüz etkinleştirilmedi.';
    } catch (error) { result.textContent = error.message; }
  }
  section.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button'); button.disabled = true; button.textContent = 'Gönderiliyor…';
    try {
      const data = await apiRequest('/api/account/email', Object.fromEntries(new FormData(event.target)));
      event.target.elements.password.value = ''; result.textContent = data.message; await refresh();
    } catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Doğrulama bağlantısı gönder'; }
  };
  section.querySelector('.account-email-refresh').onclick = refresh;
  let wasVisible = false;
  new MutationObserver(() => {
    const visible = !document.querySelector('#tab-settings').classList.contains('hidden');
    if (visible && !wasVisible) void refresh();
    wasVisible = visible;
  }).observe(document.querySelector('#tab-settings'), { attributes: true, attributeFilter: ['class'] });
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'recovery-title');
  dialog.style.cssText = 'width:min(420px,90vw);padding:24px;border:1px solid var(--border,#555);border-radius:16px;background:var(--panel,#15171b);color:var(--fg,#fff)';
  dialog.innerHTML = `<form><h2 id="recovery-title">Şifreni sıfırla</h2><p>Hesabına ekleyip doğruladığın e-posta adresini gir.</p><label class="field">E-posta<input type="email" name="email" autocomplete="email" required maxlength="254"></label><p role="status" aria-live="polite"></p><div class="btn-row"><button type="button" class="btn btn-secondary">Vazgeç</button><button class="btn" type="submit">Bağlantı gönder</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector('[type="button"]').onclick = () => dialog.close();
  document.querySelector('#forgot-password-btn').onclick = () => { dialog.querySelector('[role="status"]').textContent = ''; dialog.showModal(); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const button = dialog.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Gönderiliyor…';
    try { const data = await apiRequest('/api/account/forgot', { email: event.target.elements.email.value }); dialog.querySelector('[role="status"]').textContent = data.message; }
    catch (error) { dialog.querySelector('[role="status"]').textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Bağlantı gönder'; }
  };
})();
