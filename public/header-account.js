(() => {
  "use strict";

  const entry = document.querySelector(".header-login");
  if (!entry) return;
  let refreshing = false;
  const menu = entry.closest(".header-account-menu");
  entry.addEventListener("click", event => {
    if (!menu || !entry.classList.contains("is-signed-in")) return;
    event.preventDefault(); menu.open = !menu.open;
  });
  document.addEventListener("click", event => { if (menu && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && menu) menu.open = false; });

  function renderAccount(user) {
    const signedIn = Boolean(user?.id);
    entry.classList.toggle("is-signed-in", signedIn);
    if (menu) { menu.classList.toggle("is-signed-in", signedIn); if (!signedIn) menu.open = false; }
    if (signedIn) {
      const name = user.displayName?.trim() || "用户";
      const fallback = () => {
        const initial = document.createElement("span");
        initial.className = "header-account-avatar";
        initial.textContent = Array.from(name)[0].toLocaleUpperCase();
        initial.setAttribute("aria-hidden", "true");
        return initial;
      };
      let avatar = fallback();
      if (/^\/api\/v1\/account\/avatar\?v=[a-f0-9-]{36}$/.test(user.avatarUrl || "")) {
        avatar = document.createElement("img");
        avatar.className = "header-account-avatar";
        avatar.alt = "";
        avatar.addEventListener("error", () => {
          if (entry.children[0] === avatar) entry.replaceChildren(fallback(), label);
        }, { once: true });
        avatar.src = user.avatarUrl;
      }
      const label = document.createElement("span");
      label.className = "header-account-label";
      label.textContent = name;
      label.title = name;
      entry.replaceChildren(avatar, label);
    } else {
      entry.textContent = "登录";
    }
    entry.setAttribute("aria-label", signedIn
      ? `账号中心，${user.displayName || "已登录"}`
      : "登录账号");
  }

  async function refreshAccount() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch("/api/v1/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (response.status === 401) {
        renderAccount(null);
      } else if (response.ok) {
        const payload = await response.json();
        renderAccount(payload.data?.user);
      }
    } catch {
      // A network failure does not invalidate a previously confirmed session.
    } finally {
      refreshing = false;
    }
  }

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshAccount();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshAccount();
  });
  void refreshAccount();
})();

// One mobile navigation controller for homepage and standalone public pages.
(() => {
  const header = document.querySelector('.site-header-shared');
  const nav = header?.querySelector('.site-nav');
  const button = header?.querySelector('.mobile-menu-button');
  if (!nav || !button) return;
  const media = window.matchMedia('(max-width: 1100px)');
  nav.id ||= 'site-mobile-navigation';
  button.setAttribute('aria-controls', nav.id);
  function setOpen(open) {
    open = Boolean(open && media.matches);
    nav.classList.toggle('is-mobile-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    button.setAttribute('title', open ? '关闭导航' : '打开导航');
    if (open) {
      const account = header.querySelector('.header-account-menu');
      if (account) account.open = false;
    } else nav.querySelectorAll('details').forEach(group => { group.open = false; });
  }
  setOpen(false);
  button.addEventListener('click', () => setOpen(!nav.classList.contains('is-mobile-open')));
  nav.addEventListener('click', event => {
    if (event.target.closest('a[href], button[data-view]')) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-mobile-open')) {
      setOpen(false); button.focus();
    }
  });
  media.addEventListener('change', () => setOpen(false));
})();
