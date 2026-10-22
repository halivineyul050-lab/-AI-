import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/image-generation.html', import.meta.url), 'utf8');
const chips = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  .filter(([, attributes]) => /\bclass="inspiration-chip"/.test(attributes))
  .map(([, attributes, labelMarkup]) => ({
    label: labelMarkup.replace(/<[^>]*>/g, '').trim(),
    prompt: attributes.match(/\bdata-prompt="([^"]*)"/)?.[1] ?? ''
  }));

test('image studio keeps the five original prompt categories', () => {
  assert.deepEqual(chips.map(({ label }) => label), [
    '电影感海报',
    '公众号封面',
    '3D 萌宠',
    '国风插画',
    '电商产品图'
  ]);
});

test('each image prompt category provides a complete, immediately usable prompt', () => {
  assert.equal(chips.length, 5);

  for (const { label, prompt } of chips) {
    assert.ok(prompt.length >= 160, `${label} should provide a full prompt, got ${prompt.length} characters`);
    assert.ok(prompt.length <= 1000, `${label} exceeds the prompt input limit`);
    assert.doesNotMatch(prompt, /\[[^\]]+\]|【[^】]+】|\b(?:TODO|TBD)\b/i, `${label} contains an unfilled placeholder`);
  }

  for (const [label, words] of [
    ['电影感海报', ['海报', '构图', '光', '标题']],
    ['公众号封面', ['公众号', '标题', '留白', '文字']],
    ['3D 萌宠', ['3D', '角色', '材质', '光']],
    ['国风插画', ['国风', '插画', '留白', '色']],
    ['电商产品图', ['电商', '产品', '材质', '品牌']]
  ]) {
    const prompt = chips.find((chip) => chip.label === label)?.prompt ?? '';
    for (const word of words) assert.ok(prompt.includes(word), `${label} prompt should mention ${word}`);
  }
});
