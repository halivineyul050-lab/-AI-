import {HttpError} from '../validation.mjs';
// Business expectations come from the platform, not the model's own answer.
export function validateQualityPlan(profile,acceptance){
  if(profile?.kind!=='mortgage')return;
  if(acceptance.some(step=>step.kind==='fillText'))throw new HttpError(422,'nestdutio_artifact_invalid','计算器验收必须先用 fill 填完全部输入，再用 clickText 点击计算并核对结果；不能用 fillText 期待尚未计算的结果。');
  const values={};
  for(const step of acceptance){
    if(step.kind==='fill')for(const name of ['principal','annual-rate','months'])if(step.target.includes(name))values[name]=Number(step.input);
    const output=['monthly-payment','total-interest','total-payment'].find(name=>step.output?.includes(name));
    if(step.kind!=='clickText'||!output||!/^\d+(?:\.\d+)?$/.test(step.value))continue;
    const p=values.principal,r=values['annual-rate']/1200,n=values.months;
    if(!Number.isFinite(p)||!Number.isFinite(r)||!Number.isSafeInteger(n)||p<=0||r<0||n<=0)continue;
    const payment=r===0?p/n:p*r/(-Math.expm1(-n*Math.log1p(r)));
    const expected=output==='monthly-payment'?payment:output==='total-interest'?payment*n-p:payment*n;
    if(Number.isFinite(expected)&&Math.abs(Number(step.value)-expected)>.02)throw new HttpError(422,'nestdutio_artifact_invalid','房贷验收预期值算错：本金'+p+'、年利率'+values['annual-rate']+'%、'+n+'期的'+output+'应为'+expected.toFixed(2)+'。请修正规划，不得让代码迎合错误答案；优先使用零利率简单测试。');
  }
}
export function qualityProfile(prompt) {
  if (/房贷|等额本息|贷款.{0,12}(?:月供|计算)/i.test(prompt)) return {
    kind: 'mortgage', contract: '必须实现等额本息月供、总利息；金额单位元，利率输入为年利率百分数，期限输入为月数。为核心控件加 data-nest-check 标记：principal、annual-rate、months（输入）；calculate（按钮）；monthly-payment、total-interest（数值结果）；error（错误信息，合法输入时隐藏）。验收先用 fill 填完全部输入，再用 clickText 点击计算并核对结果，不使用 fillText。平台独立检查零利率、非零利率和非法输入，禁止硬编码结果。表单与说明必须向用户标清单位。'
  };
  if (/习惯|打卡|habit tracker/i.test(prompt)) return {
    kind: 'habits', contract: '必须支持添加多条习惯、独立打卡、删除和刷新恢复。用 localStorage 保存真实状态。给控件加 data-nest-check：habit-name（输入）、add-habit（添加按钮）、habit（每行）、check-in（行内复选框或 aria-pressed 按钮）、delete-habit（行内删除）。打卡后刷新仍保持，不影响其他习惯；删除后刷新不再出现。'
  };
  return null;
}
const selector = name => `[data-nest-check="${name}"]`;
export async function checkBusinessQuality(page, profile, { timeout = 3000 } = {}) {
  const checks = [], issues = [];
  async function check(name, run) {
    try { await run(); checks.push({ name, ok: true }); }
    catch { checks.push({ name, ok: false }); issues.push({ code: 'business_check_failed', path: `business.${profile.kind}.${name}` }); }
  }
  if (profile.kind === 'mortgage') {
    async function calculate(p, rate, months) {
      for (const [name, value] of [['principal', p], ['annual-rate', rate], ['months', months]]) await page.locator(selector(name)).fill(String(value), { timeout });
      await page.locator(selector('calculate')).click({ timeout });
    }
    async function number(name, expected) {
      await page.waitForFunction(({ name, expected }) => {
        const e = document.querySelector(`[data-nest-check="${name}"]`), text = e?.value ?? e?.textContent ?? '';
        return [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].some(m => Math.abs(Number(m[0].replaceAll(',', '')) - expected) <= 0.02);
      }, { name, expected }, { timeout });
    }
    await check('zero_rate', async () => { await calculate(120000, 0, 12); await number('monthly-payment', 10000); await number('total-interest', 0); });
    await check('nonzero_rate', async () => {
      const p = 240000, r = 0.06 / 12, n = 24, payment = p * r / (1 - (1 + r) ** -n);
      await calculate(p, 6, n); await number('monthly-payment', payment); await number('total-interest', payment * n - p);
    });
    await check('invalid_input', async () => { await calculate(-100, 6, 0); await page.locator(selector('error')).waitFor({ state: 'visible', timeout }); if (!(await page.locator(selector('error')).innerText()).trim()) throw Error('No validation'); });
  }
  if (profile.kind === 'habits') {
    const stamp = `验收习惯${Date.now()}`, other = stamp + '另一个';
    const row = name => page.locator(selector('habit')).filter({ hasText: name });
    const add = async name => { await page.locator(selector('habit-name')).fill(name, { timeout }); await page.locator(selector('add-habit')).click({ timeout }); await row(name).waitFor({ timeout }); };
    await check('add_independent_items', async () => { await add(stamp); await add(other); if (await row(stamp).count() !== 2) throw Error('Missing items'); });
    await check('check_in_persists', async () => {
      const target = row(stamp).filter({ hasNotText: other }).locator(selector('check-in'));
      if (await target.evaluate(e => e.tagName === 'INPUT')) await target.check({ timeout }); else await target.click({ timeout });
      await page.reload({ waitUntil: 'load', timeout });
      const checked = await row(stamp).filter({ hasNotText: other }).locator(selector('check-in')).evaluate(e => e.checked === true || e.getAttribute('aria-pressed') === 'true');
      const otherChecked = await row(other).locator(selector('check-in')).evaluate(e => e.checked === true || e.getAttribute('aria-pressed') === 'true');
      if (!checked || otherChecked) throw Error('State did not persist independently');
    });
    await check('delete_persists', async () => {
      await row(stamp).filter({ hasNotText: other }).locator(selector('delete-habit')).click({ timeout });
      await page.reload({ waitUntil: 'load', timeout });
      if (await row(stamp).filter({ hasNotText: other }).count() || await row(other).count() !== 1) throw Error('Deletion did not persist');
    });
  }
  return { checks, issues };
}
