// Profil banner'lari: katalogdan secilenler sabit bir CSS degrade, ozel
// yuklenenler (bannerId === 'custom') sunucudan gelen gercek bir gorsel
// (PNG/JPEG/animasyonlu GIF dahil) - avatars.js ile ayni yapiyi izler.
(() => {
  const catalog = window.BANNER_CATALOG;
  const profiles = new Map();
  let saving = false;
  let activeUsername = '';

  function bannerFor(username) {
    const id = profiles.get(String(username).toLowerCase()) || 'none';
    if (id === 'custom') return { id: 'custom' };
    return catalog.find((b) => b.id === id) || catalog[0];
  }

  function paint(element, banner, username) {
    if (banner.id === 'custom') {
      const base = (window.getServerUrl && window.getServerUrl()) || '';
      element.style.background = `center / cover no-repeat url("${base}/api/images/banner/${encodeURIComponent(username || '')}")`;
      element.setAttribute('aria-label', 'Banner');
      element.title = '';
      return;
    }
    element.style.background = banner.gradient === 'none' ? 'var(--muted)' : banner.gradient;
    element.setAttribute('aria-label', banner.label);
    element.title = banner.label;
  }

  function element(username) {
    const el = document.createElement('span');
    el.className = 'user-banner';
    el.dataset.bannerUser = String(username).toLowerCase();
    el.setAttribute('role', 'img');
    paint(el, bannerFor(username), username);
    return el;
  }

  function elementForId(bannerId, className = 'user-banner', username) {
    const el = document.createElement('span');
    el.className = className;
    el.setAttribute('role', 'img');
    if (bannerId === 'custom') {
      paint(el, { id: 'custom' }, username);
      return el;
    }
    paint(el, catalog.find((b) => b.id === bannerId) || catalog[0]);
    return el;
  }

  function remember(username, bannerId) {
    if (!username) return;
    profiles.set(username.toLowerCase(), bannerId || 'none');
    document.querySelectorAll('[data-banner-user]').forEach((el) => {
      if (el.dataset.bannerUser === username.toLowerCase()) paint(el, bannerFor(username), username);
    });
    if (activeUsername.toLowerCase() === username.toLowerCase()) renderPicker();
  }

  function renderPicker() {
    const grid = document.getElementById('banner-grid');
    if (!grid) return;
    grid.replaceChildren();
    const selected = bannerFor(activeUsername).id;
    for (const banner of catalog) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'banner-choice';
      button.disabled = saving;
      button.setAttribute('aria-pressed', String(selected === banner.id));
      button.setAttribute('aria-label', banner.label);
      const preview = document.createElement('span');
      preview.className = 'user-banner';
      paint(preview, banner);
      const label = document.createElement('span');
      label.textContent = banner.label;
      button.append(preview, label);
      button.onclick = async () => {
        if (saving) return;
        const account = activeUsername;
        saving = true;
        renderPicker();
        const status = document.getElementById('banner-status');
        if (status) status.textContent = 'Kaydediliyor…';
        try {
          const result = await apiRequest('/api/profile/banner', { bannerId: banner.id });
          if (activeUsername !== account) return;
          remember(result.username, result.bannerId);
          if (status) status.textContent = 'Banner kaydedildi.';
        } catch (error) {
          if (activeUsername === account && status) status.textContent = error.message;
        } finally {
          saving = false;
          renderPicker();
        }
      };
      grid.append(button);
    }
    const preview = document.getElementById('profile-banner-preview');
    if (preview) preview.replaceChildren(element(activeUsername));
  }

  function setAccount(username, bannerId) {
    activeUsername = username || '';
    if (bannerId !== undefined) remember(username, bannerId);
    renderPicker();
  }

  window.profileBanners = { element, elementForId, remember, setAccount };
})();
