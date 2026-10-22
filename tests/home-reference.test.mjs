import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const published = Array.from({ length: 6 }, (_, i) => ({ id: `article-${i}`, title: `真实资讯 ${i}`, excerpt: '已发布的内容', source: '官方来源', date: '2026-10-09' }));

function render(newsItems = published) {
  const list = { id: 'home-news-list', innerHTML: '', setAttribute() {} };
  const empty = { hidden: false };
  const escapeHTML = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const start = source.indexOf('function renderHomeNewsCards(');
  assert.ok(start >= 0, 'homepage needs a dedicated news-card renderer');
  const end = source.indexOf('\nfunction ', source.indexOf('function renderHomeNews()', start) + 1);
  const context = { newsItems, articleMap: {}, escapeHTML, safeMediaUrl: () => '/brand-icon-192.png', articleCoverFallback: '/brand-icon-192.png', refreshIcons() {}, bindImageFallbacks() {}, document: { getElementById: (id) => id === 'home-news-list' ? list : id === 'home-news-empty' ? empty : null }, console };
  const dateHelperStart = source.indexOf('function articleDisplayTime(');
  const dateHelperEnd = source.indexOf('\nfunction ', dateHelperStart + 1);
  runInNewContext(source.slice(dateHelperStart, dateHelperEnd) + source.slice(start, end) + '\nrenderHomeNews();', context);
  return { list, empty };
}

test('homepage displays four published articles without requiring an extra hot-news API', () => {
  const { list, empty } = render();
  assert.equal(empty.hidden, true);
  assert.match(list.innerHTML, /真实资讯 0/);
  assert.equal((list.innerHTML.match(/class="home-news-card"/g) || []).length, 4);
});

test('homepage news cards escape content and keep native article buttons', () => {
  const { list } = render([{ id: 'hot-1', title: '<script>bad</script>', excerpt: '<img src=x>', sourceCount: 2 }]);
  assert.doesNotMatch(list.innerHTML, /<script>|<img src=x>/);
  assert.match(list.innerHTML, /&lt;script>/);
  assert.match(list.innerHTML, /<button[^>]*class="home-news-card"[^>]*data-article-id="hot-1"/);
});

test('homepage shows an honest empty state when no articles exist', () => {
  const { list, empty } = render([]);
  assert.equal(list.innerHTML, '');
  assert.equal(empty.hidden, false);
});

test('homepage orders articles by publication date', () => {
  const { list } = render([{ id: 'old', title: '较旧', date: '2026-10-01' }, { id: 'new', title: '最新', date: '2026-10-09' }]);
  assert.ok(list.innerHTML.indexOf('data-article-id="new"') < list.innerHTML.indexOf('data-article-id="old"'));
});
