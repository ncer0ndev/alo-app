/* Presentation only: no changes to messaging, audio or account state. */
(() => {
  const root = document.documentElement;
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const bar = document.querySelector('.tab-bar');
  const intros = {
    friends: ['Arkadaşların', 'Birlikte vakit geçirmek için birini ara veya sohbet başlat.'],
    dm: ['Mesajlar', 'Sohbetlerine kaldığın yerden devam et.'],
    settings: ['Ayarlar', 'ALO’yu kendine göre düzenle.'],
    profile: ['Profilin', 'Seni anlatan bir görünüm seç.'],
    notepad: ['Not defteri', 'Fikirlerin ve hatırlamak istediklerin, bir arada.'],
    create: ['Yeni bir oda', 'Arkadaşlarınla buluşacağın bir yer aç.'],
    join: ['Sohbete katıl', 'Arkadaşının paylaştığı oda kodunu gir.'],
  };
  const paths = {
    friends: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    dm: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5',
    create: 'M12 5v14M5 12h14', join: 'M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    profile: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    notepad: 'M8 3h12v18H4V7l4-4M8 3v5H4M8 12h8M8 16h6',
    admin: 'M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4M8 12l3 3 5-6',
  };
  for (const tab of tabs) {
    const id = tab.dataset.tab;
    tab.id ||= `nav-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `tab-${id}`);
    const panel = document.getElementById(`tab-${id}`);
    panel?.setAttribute('role', 'tabpanel');
    panel?.setAttribute('aria-labelledby', tab.id);
    if (panel && intros[id]) {
      const intro = document.createElement('header');
      intro.className = 'modern-page-intro';
      const title = document.createElement('h2');
      const hint = document.createElement('p');
      title.textContent = intros[id][0];
      hint.textContent = intros[id][1];
      intro.append(title, hint);
      panel.prepend(intro);
    }
    const selected = tab.classList.contains('active');
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'nav-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[id] || paths.dm);
    svg.append(path);
    tab.prepend(svg);
  }
  bar.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const visible = tabs.filter((tab) => !tab.classList.contains('hidden'));
    const current = visible.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 :
      (current + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + visible.length) % visible.length;
    visible[next].click();
    visible[next].focus();
  });

  const area = document.getElementById('community-area');
  const panelButtons = ['channels', 'members'].map((name) => document.getElementById(`toggle-${name}`));
  function closePanels() {
    area.classList.remove('show-channels', 'show-members');
    panelButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }
  panelButtons.forEach((button, index) => button.addEventListener('click', () => {
    const name = index === 0 ? 'channels' : 'members';
    const open = !area.classList.contains(`show-${name}`);
    closePanels();
    if (open) area.classList.add(`show-${name}`);
    button.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.member-actions-menu[open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
    if (event.target.closest('.server-channel-row--text')) closePanels();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openPanel = panelButtons.find((button) => button.getAttribute('aria-expanded') === 'true');
    closePanels();
    openPanel?.focus();
    document.querySelectorAll('.member-actions-menu[open]').forEach((menu) => {
      menu.open = false;
      menu.querySelector('summary').focus();
    });
  });

  // Only UI labels are formatted; user names, messages and editable content are excluded.
  const originalText = new WeakMap();
  const selectors = '.tab-btn, .btn, .section-header, .field > .prompt, .window-titlebar';
  const labels = { 'alo:~$': 'Kullanıcı adı', 'user@alo:~$': 'Kullanıcı adı', 'passwd:': 'Şifre', 'in:~$': 'Mikrofon', 'out:~$': 'Hoparlör', 'room@alo:~$': 'Oda kodu', 'login.sh': 'Hoş geldin', 'menu.sh': 'Çalışma alanı', 'room': 'Sesli görüşme' };
  function syncLabels() {
    const modern = root.dataset.ui === 'modern';
    bar.setAttribute('aria-orientation', modern ? 'vertical' : 'horizontal');
    document.querySelectorAll(selectors).forEach((element) => {
      [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => {
        let record = originalText.get(node);
        if (!record || (node.data !== record.original && node.data !== record.formatted)) {
          const original = node.data;
          const clean = original.replace(/^\s*\/\/\s*/, '').replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '');
          const trimmed = clean.trim();
          const readable = trimmed && !/[a-zçğıöşü]/.test(trimmed)
            ? trimmed[0].toLocaleUpperCase('tr-TR') + trimmed.slice(1).toLocaleLowerCase('tr-TR') : clean;
          record = { original, formatted: labels[trimmed] || readable };
          originalText.set(node, record);
        }
        const next = modern ? record.formatted : record.original;
        if (node.data !== next) node.data = next;
      });
    });
  }
  const observer = new MutationObserver(() => {
    observer.disconnect();
    syncLabels();
    observe();
  });
  function observe() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observer.observe(root, { attributes: true, attributeFilter: ['data-ui'] });
  }
  syncLabels();
  observe();
})();
