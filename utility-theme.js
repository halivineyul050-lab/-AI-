// All utility pages share the homepage theme preference.
try { const theme = localStorage.getItem('nike-theme'); if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme; } catch {}
const themeButton = document.getElementById('utility-theme');
if (themeButton) themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('nike-theme', theme); } catch {}
});
