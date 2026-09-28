(() => {
  const seenThisPage = new Set();
  const storageKey = (item) => `nikai:announcement:${item.id}:${item.version}`;

  function alreadySeen(item) {
    const key = storageKey(item);
    try { return localStorage.getItem(key) === 'seen'; } catch { return seenThisPage.has(key); }
  }

  function markSeen(item) {
    const key = storageKey(item);
    seenThisPage.add(key);
    try { localStorage.setItem(key, 'seen'); } catch { /* Keep this-page fallback. */ }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showAnnouncement(item) {
    return new Promise((resolve) => {
      const dialog = element('dialog', 'site-announcement-dialog');
      dialog.setAttribute('aria-labelledby', 'site-announcement-title');
      const card = element('article', 'site-announcement-card');
      const header = element('header', 'site-announcement-header');
      header.append(element('span', 'site-announcement-kicker', '站点公告'));
      const close = element('button', 'site-announcement-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', '关闭公告');
      header.append(close);
      const main = element('div', 'site-announcement-content');
      main.append(element('h2', '', item.title));
      if (item.summary) main.append(element('p', 'site-announcement-summary', item.summary));
      const body = element('div', 'site-announcement-body');
      String(item.body || '').split(/\n{2,}/).forEach((paragraph) => {
        body.append(element('p', '', paragraph));
      });
      main.append(body);
      const footer = element('footer', 'site-announcement-footer');
      const later = element('button', 'site-announcement-later', '我知道了');
      later.type = 'button';
      footer.append(later);
      if (item.buttonLabel && item.buttonUrl) {
        const action = element('a', 'site-announcement-action', item.buttonLabel);
        action.href = item.buttonUrl;
        footer.append(action);
      }
      card.append(header, main, footer);
      dialog.append(card);
      document.body.append(dialog);
      let finished = false;
      const dismiss = () => {
        if (finished) return;
        finished = true;
        markSeen(item);
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve();
      };
      close.addEventListener('click', dismiss);
      later.addEventListener('click', dismiss);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
      dialog.addEventListener('click', (event) => { if (event.target === dialog) dismiss(); });
      dialog.querySelector('.site-announcement-action')?.addEventListener('click', dismiss);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else { dialog.setAttribute('open', ''); later.focus(); }
    });
  }

  async function loadAnnouncements() {
    try {
      const response = await fetch('/api/v1/site-announcements', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const data = payload?.data ?? payload;
      for (const item of Array.isArray(data?.items) ? data.items : []) {
        if (!item?.id || alreadySeen(item)) continue;
        await showAnnouncement(item);
      }
    } catch { /* Announcements must never block access to the site. */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAnnouncements, { once: true });
  else void loadAnnouncements();
})();
