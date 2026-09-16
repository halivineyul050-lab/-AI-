import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArticle, cleanBody } from '../scripts/obsidian-news-cleaner.mjs';

const draft = `---
标题: 测试文章标题
日期: 2026-09-16
状态: 待配图与编辑终审
标签:
  - 公众号
  - OpenAI
资料来源:
  - https://example.com/research
---

# 测试文章标题

## 备选标题

1. 另一个标题
2. 又一个标题

## 开头导语

这是一段有事实意义的开头，应该被保留下来，因为它向读者交代了事件背景和文章讨论的主要问题。

> 封面图位置：文章最上方
>
> 图片内容：这里是图片制作说明。
>
> 配图文案：这里是图片文案。

## 正文

### 为什么值得关注

这是一段正文事实。[官方资料](https://example.com/research)说明了变化。

![示意图](images/test.png)
<img src="test.jpg" alt="图">

素材记录：本次未下载图片，建议发布前按图片清单补齐。

> 图片位置 1：本段下方
>
> 图片说明：不要保留。

## 参考资料

- https://example.com/research

## 发布前检查

- [ ] 完成封面、正文配图与编辑终审

## 质检报告

**总评**：待配图与编辑终审。

以上，既然看到这里了，如果觉得不错，随手点个赞、在看、转发三连吧。
谢谢你看我的文章，我们，下次再见。
> / 作者：测试作者
> / 投稿或爆料，请联系邮箱：test@example.com
`;

test('cleanBody removes draft and image scaffolding while retaining article prose and sources', () => {
  const body = cleanBody(draft.split('---').slice(2).join('---'), '测试文章标题');
  assert.match(body, /这是一段有事实意义的开头/);
  assert.match(body, /### 为什么值得关注/);
  assert.match(body, /https:\/\/example\.com\/research/);
  assert.doesNotMatch(body, /备选标题|另一个标题|封面图|图片内容|图片位置|图片说明|图片清单|素材记录|!\[|<img|发布前检查|质检报告|编辑终审|随手点个赞|投稿或爆料|^# 测试文章标题/m);
});

test('buildArticle maps metadata to a stable image-free news record', () => {
  const article = buildArticle(draft, '2026-09-16-测试文章标题.md');
  assert.equal(article.title, '测试文章标题');
  assert.equal(article.published_date, '2026-09-16');
  assert.equal(article.kind, 'news');
  assert.equal(article.topic, 'OpenAI');
  assert.equal(article.cover_url, '');
  assert.equal(article.source_url, 'https://example.com/research');
  assert.match(article.id, /^obsidian-news-2026-09-16-/);
  assert.ok(article.excerpt.length >= 40);
  assert.ok(article.read_time >= 1);
});
