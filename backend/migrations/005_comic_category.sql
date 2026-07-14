UPDATE categories
SET sort_order = sort_order + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE sort_order >= 5;

INSERT OR IGNORE INTO categories (id, name, icon, description, sort_order)
VALUES (
  'comic',
  'AI 漫剧',
  'panels-top-left',
  '面向漫画、动态漫和AI短剧的剧本、角色、分镜、视频与成片工作流。',
  5
);

ALTER TABLE tools
ADD COLUMN category_sort_order INTEGER NOT NULL DEFAULT 1000
CHECK (category_sort_order >= 0);

UPDATE tools
SET category_id = 'comic',
    category_sort_order = 0,
    domain = 'ai.fun.tv',
    official_url = 'https://ai.fun.tv/',
    canonical_url = 'https://ai.fun.tv/',
    logo_url = 'https://mgc.funshion.com/assets/logo-a6ljc2-6.ico',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'orange-dream-factory';

CREATE INDEX idx_tools_category_order
ON tools(category_id, category_sort_order, status);

PRAGMA user_version = 5;
