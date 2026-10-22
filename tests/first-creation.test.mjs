import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const core = async () => import('../public/first-creation-core.mjs');
test('three audiences have two complete cases and real preview assets each', async () => {
  const { CREATION_CASES } = await core();
  assert.equal(CREATION_CASES.length, 6);
  for (const audience of ['content', 'personal', 'commerce']) assert.equal(CREATION_CASES.filter(c => c.audience === audience).length, 2);
  for (const c of CREATION_CASES) {
    assert.ok(c.prompt.length > 80 && c.prompt.length <= 1000);
    assert.ok(existsSync(new URL('../public' + c.image, import.meta.url)));
  }
});
test('case selection respects ratio, reference requirements and current compatible model', async () => {
  const { chooseCaseModel, CREATION_CASES } = await core();
  const models = [{ id: 'a', supportedRatios: ['1:1'], supportsReferenceImage: false }, { id: 'b', supportedRatios: ['1:1', '16:9'], supportsReferenceImage: true }];
  assert.equal(chooseCaseModel(CREATION_CASES[0], models, 'a').id, 'b');
  assert.equal(chooseCaseModel(CREATION_CASES[5], models, 'a').id, 'b');
  assert.equal(chooseCaseModel(CREATION_CASES[5], [models[0]], 'a'), null);
});
test('unknown pricing and insufficient usable balance cannot generate', async () => {
  const { creationCost } = await core();
  assert.equal(creationCost(null, 'a', 1, { balance: 60, frozen: 0 }).ready, false);
  assert.deepEqual(creationCost({ defaultImageCredits: 20, modelPrices: { a: 30 } }, 'a', 2, { balance: 60, frozen: 10 }), { ready: true, total: 60, available: 50, sufficient: false });
  assert.equal(creationCost({ defaultImageCredits: 20 }, 'a', 1, null).sufficient, false);
});
test('refund language requires confirmed zero-charge settlement', async () => {
  const { settlementText } = await core();
  assert.match(settlementText(null), /核对|查询/);
  assert.doesNotMatch(settlementText(null), /已释放|未扣费/);
  assert.match(settlementText({ settled: true, charged: 0, released: 20 }), /已释放 20 积分/);
  assert.match(settlementText({ settled: true, charged: 20, released: 0 }), /实际使用 20 积分/);
});
test('timing ranges require verified samples and recovery has owner-specific storage', async () => {
  const { timingText, pendingKey } = await core();
  assert.doesNotMatch(timingText({ sampleCount: 19, minSeconds: 20, maxSeconds: 30 }), /20.*30/);
  assert.match(timingText({ sampleCount: 20, minSeconds: 20, maxSeconds: 30 }), /20.*30/);
  assert.notEqual(pendingKey('one'), pendingKey('two'));
});
