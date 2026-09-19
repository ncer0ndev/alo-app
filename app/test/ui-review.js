const results = document.getElementById('results');
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
document.getElementById('run').onclick = async () => {
  results.textContent = '';
  let passed = 0;
  let failed = 0;
  function check(value, name) { results.textContent += `${value ? 'PASS' : 'FAIL'} ${name}\n`; value ? passed++ : failed++; }
  for (const frame of document.querySelectorAll('iframe')) {
    const d = frame.contentDocument;
    const w = frame.contentWindow;
    const width = Number(frame.width);
    const visible = (selector) => !!d.querySelector(selector)?.getClientRects().length;
    const clickTab = async (name) => { d.querySelector(`[data-tab="${name}"]`).click(); await wait(); };
    const fits = (selector) => {
      const box = d.querySelector(selector).getBoundingClientRect();
      return box.width > 30 && box.left >= 0 && box.right <= width + 1 && box.bottom <= Number(frame.height) + 1;
    };
    d.querySelector('#rail-home-btn').click();
    await clickTab('settings');
    const toggle = d.querySelector('#ui-mode-toggle');
    if (!toggle.checked) { toggle.click(); await wait(); }
    d.querySelector('[name="theme-select"][value="modern"]').click();
    await clickTab('friends');
    const nav = d.querySelector('.tab-bar').getBoundingClientRect();
    const panel = d.querySelector('#tab-friends').getBoundingClientRect();
    check(panel.left >= nav.right - 1 && fits('#tab-friends'), `${width}: menü ve içerik yan yana`);
    const friendsTab = d.querySelector('[data-tab="friends"]');
    friendsTab.focus();
    friendsTab.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait();
    check(d.activeElement.dataset.tab === 'dm' && d.activeElement.getAttribute('aria-selected') === 'true', `${width}: klavye navigasyonu`);
    d.querySelector('#dm-rail-list [role="button"]')?.click();
    await wait();
    await clickTab('settings');
    check(!visible('#tab-dm') && visible('#tab-settings'), `${width}: DM diğer sekmeye sızmıyor`);
    for (const theme of ['terminal', 'newsprint', 'kinetic', 'modern']) {
      d.querySelector(`[name="theme-select"][value="${theme}"]`).click();
      await wait(50);
      check(d.documentElement.dataset.theme === theme && d.documentElement.dataset.ui === 'modern', `${width}: bağımsız ${theme} teması`);
    }
    toggle.click(); await wait();
    check(d.documentElement.dataset.ui === 'classic' && d.querySelector('[data-tab="friends"]').textContent.includes('['), `${width}: klasik etiketler geri geliyor`);
    toggle.click(); await wait();
    d.querySelector('#servers-list [role="button"]')?.click();
    await wait(700);
    check(visible('#server-text-channel-view') && fits('#text-channel-input'), `${width}: sohbet yazma alanı görünür`);
    check(d.querySelector('#text-channel-log').getBoundingClientRect().height > 150, `${width}: sohbet için yeterli yükseklik`);
    const rail = d.querySelector('#community-rail');
    const collapsedWidth = rail.getBoundingClientRect().width;
    d.querySelector('#servers-list .community-server-item').focus();
    await wait(300);
    check(rail.getBoundingClientRect().width > 180, `${width}: topluluk çubuğu üzerine gelince/odaklanınca açılıyor`);
    check(d.querySelector('#community-area').getBoundingClientRect().left < 75, `${width}: açılan çubuk sohbeti sağa itmiyor`);
    d.querySelector('#text-channel-input').focus();
    await wait(300);
    const pointerStillOverRail = rail.matches(':hover');
    check(pointerStillOverRail || (collapsedWidth < 90 && rail.getBoundingClientRect().width < 90), `${width}: topluluk çubuğu ayrılınca kapanıyor`);
    if (width <= 1100) {
      d.querySelector('#toggle-members').click(); await wait(50);
      check(visible('#server-members-panel'), `${width}: üye paneli açılıyor`);
    }
    const memberRow = d.querySelector('.server-member-row[data-username="deniz"]');
    const hoverCard = d.querySelector('#member-hover-card');
    memberRow.dispatchEvent(new w.MouseEvent('mouseenter'));
    await wait(50);
    const roleAddButton = d.querySelector('#member-hover-role-grant-btn');
    check(visible('#member-hover-card') && visible('#member-hover-role-badges'), `${width}: profil kartında roller görünüyor`);
    check(visible('#member-hover-role-grant-btn') && roleAddButton.textContent.trim() === '+', `${width}: rol ekleme kare artı düğmesinde`);
    memberRow.dispatchEvent(new w.MouseEvent('mouseleave'));
    hoverCard.dispatchEvent(new w.MouseEvent('mouseenter'));
    await wait(220);
    check(visible('#member-hover-card'), `${width}: satırdan profil kartına geçerken kart kaybolmuyor`);
    roleAddButton.click();
    check(visible('#member-hover-role-picker'), `${width}: artı düğmesi rol listesini açıyor`);
    hoverCard.dispatchEvent(new w.MouseEvent('mouseleave'));
    await wait(220);
    const memberMenu = d.querySelector('.member-actions-menu');
    check(!!memberMenu && !memberMenu.open, `${width}: üye işlemleri kapalı başlıyor`);
    memberMenu.querySelector('summary').click();
    await wait(50);
    check(memberMenu.open && memberMenu.querySelectorAll('button').length >= 3, `${width}: üye işlemleri açılıyor`);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(!memberMenu.open, `${width}: Escape üye menüsünü kapatıyor`);
    if (width <= 1100) {
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check(!visible('#server-members-panel'), `${width}: Escape paneli kapatıyor`);
      d.querySelector('#toggle-channels').click(); await wait(50);
      check(visible('#server-channel-rail'), `${width}: kanal paneli açılıyor`);
      d.querySelector('.server-channel-row--text').click(); await wait();
      check(!visible('#server-channel-rail'), `${width}: kanal seçince sohbet geri geliyor`);
    }
    check(d.documentElement.scrollWidth <= width, `${width}: yatay taşma yok`);
  }
  results.textContent += `\n${passed} geçti, ${failed} başarısız.`;
};
