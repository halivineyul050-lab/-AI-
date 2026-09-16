import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const poolPattern = /资讯选题池与待确认线索/;
const imagePattern = /(?:封面图|配图|图片(?:位置|内容|说明|文案|建议)|插图|截图位置|视觉建议)/i;
const editorialSectionPattern = /^(?:备选标题|备用标题|候选标题|标题备选|示例导语|摘要|核心观点总结|选题说明|选题取舍说明|选题筛选与事实边界|事实边界与选题取舍|未采用与排除说明|事实边界与发布前检查|写作说明|编辑说明|发布说明|发布前检查|质检报告|自检报告|素材记录)$/;
const wrapperHeadingPattern = /^(?:开头导语|导语|正文|结尾|结语)$/;
const footerPattern = /^(?:以上，既然看到这里|以上，如果觉得|如果觉得(?:这篇文章)?不错|谢谢你看我的文章|>\s*\/\s*作者|>\s*\/\s*投稿或爆料)/;

function parseFrontMatter(source) {
  const normalized = String(source).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return { metadata: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: {}, body: normalized };
  const metadata = {};
  let activeList = '';
  for (const line of normalized.slice(4, end).split('\n')) {
    const pair = line.match(/^([^:\n]+):\s*(.*)$/);
    if (pair) {
      activeList = pair[1].trim();
      metadata[activeList] = pair[2].trim() || [];
      continue;
    }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && activeList) {
      if (!Array.isArray(metadata[activeList])) metadata[activeList] = [];
      metadata[activeList].push(item[1].trim());
    }
  }
  return { metadata, body: normalized.slice(end + 5) };
}

function headingText(line) {
  return line.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1]?.trim() || '';
}

function stripMarkdown(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanBody(sourceBody, title = '') {
  const lines = String(sourceBody).replaceAll('\r\n', '\n').split('\n');
  const output = [];
  let skipSectionLevel = 0;
  let footer = false;
  let hasProse = false;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (footer || footerPattern.test(trimmed)) { footer = true; index += 1; continue; }

    if (trimmed.startsWith('>')) {
      const block = [];
      while (index < lines.length && (lines[index].trim().startsWith('>') || lines[index].trim() === '')) block.push(lines[index++]);
      if (imagePattern.test(block.join('\n'))) continue;
      output.push(...block);
      continue;
    }

    const heading = headingText(trimmed);
    const level = trimmed.match(/^(#{1,6})\s/)?.[1].length || 0;
    if (skipSectionLevel) {
      if (!heading || level > skipSectionLevel) { index += 1; continue; }
      skipSectionLevel = 0;
    }
    if (heading && editorialSectionPattern.test(heading.replace(/[：:].*$/, '').trim())) {
      skipSectionLevel = level;
      index += 1;
      continue;
    }
    if (heading && /图片|配图|封面|视觉素材/.test(heading)) {
      skipSectionLevel = level;
      index += 1;
      continue;
    }
    if (level === 1 && (!hasProse || heading.replace(/\s+/g, '') === String(title).replace(/\s+/g, ''))) { index += 1; continue; }
    if (heading && wrapperHeadingPattern.test(heading.replace(/[：:].*$/, '').trim())) { index += 1; continue; }
    if (/!\[[^\]]*\]\([^)]*\)/.test(trimmed) || /!\[\[[^\]]+\]\]/.test(trimmed) || /<img\b[^>]*>/i.test(trimmed)) { index += 1; continue; }
    if (/^(?:图片|配图|封面)(?:位置|内容|说明|文案|建议)?\s*[：:]/.test(trimmed)) { index += 1; continue; }
    if (/^(?:素材记录[：:]|本次未下载.*(?:图片|素材)|建议发布前.*(?:截图|配图)|.*待配图(?:与编辑终审)?[。.]?$)/.test(trimmed)) { index += 1; continue; }
    output.push(line.replace(/[ \t]+$/g, ''));
    if (stripMarkdown(line).length > 0 && !heading) hasProse = true;
    index += 1;
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function firstValue(metadata, ...keys) {
  for (const key of keys) if (typeof metadata[key] === 'string' && metadata[key].trim()) return metadata[key].trim();
  return '';
}

function listValue(metadata, ...keys) {
  for (const key of keys) if (Array.isArray(metadata[key])) return metadata[key];
  return [];
}

export function buildArticle(markdown, filename) {
  const { metadata, body } = parseFrontMatter(markdown);
  const fallback = basename(filename, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '').trim();
  const rawTitle = firstValue(metadata, '标题', 'title') || headingText(body.split(/\r?\n/).find((line) => /^#\s/.test(line.trim())) || '') || fallback;
  const title = rawTitle.replace(/^['"]|['"]$/g, '').trim();
  const dateFromName = basename(filename).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
  const publishedDate = firstValue(metadata, '日期', 'date') || dateFromName;
  const cleaned = cleanBody(body, title);
  const tags = listValue(metadata, '标签', 'tags').filter((tag) => !/^(?:公众号|公众号日更|AI|人工智能)$/i.test(tag));
  const sources = listValue(metadata, '资料来源', '来源', 'sources');
  const sourceUrl = sources.find((value) => /^https?:\/\//i.test(value)) || cleaned.match(/https?:\/\/[^\s)>]+/)?.[0] || '';
  let sourceName = '综合公开资料';
  if (sourceUrl) {
    try { sourceName = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch {}
  }
  const plain = stripMarkdown(cleaned);
  const excerpt = plain.length <= 180 ? plain : `${plain.slice(0, 176).replace(/[，、；：,.!?！？]?[^，。！？.!?]*$/, '') || plain.slice(0, 176)}……`;
  const digest = createHash('sha256').update(`${publishedDate}\n${title}`).digest('hex').slice(0, 16);
  return {
    id: `obsidian-news-${publishedDate}-${digest}`,
    slug: `obsidian-news-${publishedDate}-${digest}`,
    kind: 'news',
    topic: tags[0] || 'AI资讯',
    title,
    excerpt,
    cover_url: '',
    body_text: cleaned,
    published_date: publishedDate,
    read_time: Math.max(1, Math.ceil(plain.length / 500)),
    source_name: sourceName,
    source_url: sourceUrl,
    status: 'published',
    source_file: filename,
  };
}

export function validateArticles(articles, expectedCount = 69) {
  const issues = [];
  if (articles.length !== expectedCount) issues.push(`expected ${expectedCount} articles, received ${articles.length}`);
  for (const key of ['id', 'slug', 'title']) {
    const values = articles.map((article) => article[key]);
    if (new Set(values).size !== values.length) issues.push(`duplicate ${key}`);
  }
  const residue = /!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]+\]\]|<img\b|(?:封面图|配图|图片)(?:位置|内容|说明|文案)\s*[：:]|备选标题|备用标题|候选标题|发布前检查|质检报告|投稿或爆料|随手点个赞|编辑终审/mi;
  for (const article of articles) {
    if (!article.title || !article.body_text || !/^\d{4}-\d{2}-\d{2}$/.test(article.published_date)) issues.push(`${article.source_file}: required field missing`);
    if (article.cover_url !== '') issues.push(`${article.source_file}: cover is not empty`);
    const match = article.body_text.match(residue);
    if (match) issues.push(`${article.source_file}: residue ${match[0]}`);
  }
  return issues;
}

export function buildImport(sourceDir) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !poolPattern.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    .map((entry) => buildArticle(readFileSync(join(sourceDir, entry.name), 'utf8'), entry.name));
}

function reviewMarkdown(articles, issues) {
  const rows = articles.map((article, index) => `${index + 1}. ${article.published_date}｜${article.title}｜${stripMarkdown(article.body_text).length} 字｜${article.read_time} 分钟｜${article.source_file}`);
  return `# Obsidian 资讯导入审查\n\n- 文章数：${articles.length}\n- 异常数：${issues.length}\n- 图片策略：全部无图\n\n## 异常\n\n${issues.length ? issues.map((item) => `- ${item}`).join('\n') : '- 无'}\n\n## 文章\n\n${rows.join('\n')}\n`;
}

const currentFile = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] || '') === resolve(currentFile)) {
  const sourceDir = process.argv[2];
  const outputPath = process.argv[3];
  const reviewPath = process.argv[4];
  if (!sourceDir || !outputPath || !reviewPath) throw new Error('Usage: node scripts/obsidian-news-cleaner.mjs <source-dir> <output.json> <review.md>');
  const articles = buildImport(sourceDir);
  const issues = validateArticles(articles);
  writeFileSync(outputPath, `${JSON.stringify({ generated_at: new Date().toISOString(), source_dir: sourceDir, articles }, null, 2)}\n`, 'utf8');
  writeFileSync(reviewPath, reviewMarkdown(articles, issues), 'utf8');
  console.log(JSON.stringify({ articles: articles.length, issues }));
  if (issues.length) process.exitCode = 1;
}
