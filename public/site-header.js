// Standalone public pages share the homepage's header destinations and account UI.
(() => {
  "use strict";
  const header = document.querySelector('.site-header-shared');
  if (!header || header.querySelector('.site-nav')?.dataset.siteShell === 'app') return;
  const search = header.querySelector('#global-search-input');
  const clear = header.querySelector('#search-clear');
  header.querySelector('#search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = search.value.trim();
    location.assign(query ? `/?q=${encodeURIComponent(query)}` : '/');
  });
  search?.addEventListener('input', () => { clear.hidden = !search.value; });
  clear?.addEventListener('click', () => { search.value = ''; clear.hidden = true; search.focus(); });
  header.querySelector('#submit-tool-open')?.addEventListener('click', () => location.assign('/?submit=1'));
  header.querySelector('#favorite-toggle')?.addEventListener('click', () => location.assign('/favorites'));
  header.querySelector('#compare-open')?.addEventListener('click', () => location.assign('/compare'));
  try {
    const favorites = JSON.parse(localStorage.getItem('nike-favorites') || '[]');
    header.querySelector('#favorite-count').textContent = Array.isArray(favorites) ? new Set(favorites).size : 0;
  } catch { /* A blocked or invalid local preference leaves the count at zero. */ }

  const groups = [...header.querySelectorAll('.nav-group')];
  groups.forEach(group => group.addEventListener('toggle', () => { if (group.open) groups.filter(other => other !== group).forEach(other => other.open = false); }));
  document.addEventListener('click', event => groups.forEach(group => { if (!group.contains(event.target)) group.open = false; }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') groups.forEach(group => group.open = false); });
  const wrap = header.querySelector('.nav-dropdown-wrap');
  const toggle = wrap?.querySelector('.nav-dropdown-toggle');
  const dropdown = wrap?.querySelector('.nav-dropdown');
  const more = header.querySelector('.nav-more');
  if (!dropdown || !toggle) return;
  const grid = document.createElement('div');
  grid.className = 'nav-dropdown-grid';
  dropdown.append(grid);
  function categoryLink(category) {
    const link = document.createElement('a');
    link.className = 'nav-dropdown-item';
    link.href = category.id === 'all' ? '/' : `/category/${encodeURIComponent(category.id)}`;
    link.textContent = category.name;
    return link;
  }
  grid.append(categoryLink({ id: 'all', name: '全部工具' }));
  let categoriesLoaded = false;
  async function loadCategories() {
    if (categoriesLoaded) return;
    categoriesLoaded = true;
    try {
      const response = await fetch('/api/v1/categories', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('categories unavailable');
      const payload = await response.json();
      const categories = payload.data;
      if (!Array.isArray(categories)) throw new Error('invalid categories');
      const links = categories.filter((category) => typeof category.id === 'string' && typeof category.name === 'string').map(categoryLink);
      if (links.length) grid.replaceChildren(...links);
    } catch { categoriesLoaded = false; }
  }
  function closeDropdown() {
    wrap.classList.remove('is-open');
    dropdown.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    const opening = dropdown.hidden;
    dropdown.hidden = !opening;
    wrap.classList.toggle('is-open', opening);
    toggle.setAttribute('aria-expanded', String(opening));
    if (opening) { more.open = false; void loadCategories(); }
  });
  more?.addEventListener('toggle', () => { if (more.open) closeDropdown(); });
  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) closeDropdown();
    if (!more.contains(event.target)) more.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeDropdown(); more.open = false; }
  });
})();
