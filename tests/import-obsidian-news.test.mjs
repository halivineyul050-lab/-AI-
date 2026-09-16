import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planUpserts, validateArtifact } from '../scripts/import-obsidian-news.mjs';

const article = (overrides = {}) => ({
  id: 'obsidian-news-2026-09-16-abc', slug: 'obsidian-news-2026-09-16-abc', kind: 'news', topic: 'OpenAI',
  title: '一篇文章', excerpt: '这是一段足够完整的文章摘要，用于说明文章讨论的事件、影响和边界。', cover_url: '',
  body_text: '这是正文。\n\n## 信息来源\n\nhttps://example.com', published_date: '2026-09-16', read_time: 3,
  source_name: 'example.com', source_url: 'https://example.com', status: 'published', source_file: 'x.md', ...overrides,
});

test('validateArtifact accepts image-free unique news records', () => {
  assert.deepEqual(validateArtifact({ articles: [article()] }, 1), []);
});

test('validateArtifact rejects images, covers and duplicate identities', () => {
  const issues = validateArtifact({ articles: [article({ cover_url: '/cover.jpg', body_text: '![x](x.png)' }), article()] }, 2);
  assert.ok(issues.some((issue) => issue.includes('duplicate id')));
  assert.ok(issues.some((issue) => issue.includes('cover')));
  assert.ok(issues.some((issue) => issue.includes('image')));
});

test('planUpserts reuses an existing row for the same normalized title', () => {
  const incoming = article();
  const planned = planUpserts([incoming], [{ id: 'existing-id', slug: 'existing-slug', title: ' 一篇文章 ' }]);
  assert.equal(planned[0].id, 'existing-id');
  assert.equal(planned[0].slug, 'existing-slug');
  assert.equal(planned[0].operation, 'update');
});
