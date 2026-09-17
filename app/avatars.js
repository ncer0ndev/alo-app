// Reuse the supplied artwork as sprite sheets; no image is regenerated.
(() => {
  const catalog = window.AVATAR_CATALOG;
  const profiles = new Map();
  let saving = false;
  let activeUsername = '';
  function avatarFor(username, fallback = 'panda') {
    const id = profiles.get(String(username).toLowerCase()) || fallback;
    return catalog.find(a => a.id === id && (id !== 'phoenix' || String(username).toLowerCase() === 'necr0n')) || catalog.find(a => a.id === 'panda');
  }
  function paint(element, avatar) {
    element.style.backgroundImage = `url("assets/avatars/collection-${avatar.sheet}.jpg")`;
    element.style.backgroundPosition = `${[3.53, 26.8, 50.06, 73.32, 96.58][avatar.column]}% ${avatar.row ? 79.14 : 11.34}%`;
    element.setAttribute('aria-label', avatar.label);
    element.title = avatar.label;
  }
  function image(username, fallback) {
    const element = document.createElement('span');
    element.className = 'user-avatar';
    element.dataset.avatarUser = String(username).toLowerCase();
    element.setAttribute('role', 'img');
    paint(element, avatarFor(username, fallback));
    return element;
  }
  function imageForId(avatarId, className = 'user-avatar') {
    const element = document.createElement('span');
    element.className = className;
    element.setAttribute('role', 'img');
    const avatar = catalog.find(a => a.id === avatarId) || catalog.find(a => a.id === 'robot');
    paint(element, avatar);
    return element;
  }
  function remember(username, avatarId) {
    if (!username || !avatarId) return;
    profiles.set(username.toLowerCase(), avatarId);
    document.querySelectorAll('[data-avatar-user]').forEach(element => {
      if (element.dataset.avatarUser === username.toLowerCase()) paint(element, avatarFor(username));
    });
    if (activeUsername.toLowerCase() === username.toLowerCase()) renderPicker();
  }
  function renderPicker() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    grid.replaceChildren();
    const selected = avatarFor(activeUsername).id;
    for (const avatar of catalog) {
      if (avatar.id === 'phoenix' && activeUsername.toLowerCase() !== 'necr0n') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'avatar-choice';
      button.disabled = saving;
      button.setAttribute('aria-pressed', String(selected === avatar.id));
      button.setAttribute('aria-label', `${avatar.label}${avatar.id === 'phoenix' ? ' — sana özel' : ''}`);
      const preview = document.createElement('span');
      preview.className = 'user-avatar';
      paint(preview, avatar);
      const label = document.createElement('span');
      label.textContent = avatar.id === 'phoenix' ? 'Anka · Sana özel' : avatar.label;
      button.append(preview, label);
      button.onclick = async () => {
        if (saving) return;
        const account = activeUsername;
        saving = true;
        renderPicker();
        const status = document.getElementById('avatar-status');
        status.textContent = 'Kaydediliyor…';
        try {
          const result = await apiRequest('/api/profile/avatar', { avatarId: avatar.id });
          if (activeUsername !== account) return;
          remember(result.username, result.avatarId);
          status.textContent = 'Profil resmin kaydedildi.';
        } catch (error) {
          if (activeUsername === account) status.textContent = error.message;
        } finally { saving = false; renderPicker(); }
      };
      grid.append(button);
    }
    const preview = document.getElementById('profile-avatar-preview');
    preview.replaceChildren(image(activeUsername));
  }
  function setAccount(username, avatarId) {
    activeUsername = username || '';
    if (avatarId) remember(username, avatarId);
    renderPicker();
  }
  window.profileAvatars = { image, imageForId, remember, setAccount };
})();
