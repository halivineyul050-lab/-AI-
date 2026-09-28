// All utility pages share the homepage theme preference.
try { const theme = localStorage.getItem('nike-theme'); if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme; } catch {}
const themeButton = document.getElementById('utility-theme');
if (themeButton) themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('nike-theme', theme); } catch {}
});

const utilityNav = document.querySelector('.site-nav');
const utilityHeaderActions = document.querySelector('.erase-header-actions');
if (utilityNav && utilityHeaderActions) {
  const menuButton = document.createElement('button');
  menuButton.className = 'utility-menu-button';
  menuButton.type = 'button';
  menuButton.textContent = '☰';
  menuButton.setAttribute('aria-label', '打开主导航');
  menuButton.setAttribute('aria-expanded', 'false');

  const closeMenu = () => {
    utilityNav.classList.remove('is-mobile-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '打开主导航');
  };

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    utilityNav.classList.toggle('is-mobile-open');
    const open = utilityNav.classList.contains('is-mobile-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '关闭主导航' : '打开主导航');
  });
  document.addEventListener('click', (event) => {
    if (!utilityNav.contains(event.target) && !utilityHeaderActions.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  utilityHeaderActions.append(menuButton);
}
