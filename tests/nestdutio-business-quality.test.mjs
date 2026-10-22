import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPreviewServer } from '../backend/nestdutio/preview.mjs';
import { checkArtifact } from '../backend/nestdutio/checker.mjs';
import { qualityProfile } from '../backend/nestdutio/business-quality.mjs';

function calculator(script) {
  return { schemaVersion: 1, name: '房贷', entry: 'index.html', capabilities: [], acceptance: [{ kind: 'visible', target: 'h1' }], files: [{ path: 'index.html', content: `<h1>房贷</h1><input data-nest-check="principal" type="number"><input data-nest-check="annual-rate" type="number"><input data-nest-check="months" type="number"><button data-nest-check="calculate">计算</button><output data-nest-check="monthly-payment"></output><output data-nest-check="total-interest"></output><p data-nest-check="error" hidden></p><script>${script}</script>` }] };
}
const working = `const e=n=>document.querySelector('[data-nest-check="'+n+'"]');e('calculate').onclick=()=>{const p=+e('principal').value,r=+e('annual-rate').value/1200,n=+e('months').value;if(p<=0||n<=0||r<0){e('error').hidden=false;e('error').textContent='输入无效';return;}e('error').hidden=true;const m=r?p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):p/n;e('monthly-payment').textContent=m.toFixed(2);e('total-interest').textContent=(m*n-p).toFixed(2);};`;
test('independent mortgage benchmark rejects a static answer that passes model visibility checks', { timeout: 30000 }, async t => {
  const preview = await startPreviewServer(); t.after(() => preview.close());
  const fake = calculator(`document.querySelector('[data-nest-check="monthly-payment"]').textContent='10000';document.querySelector('[data-nest-check="total-interest"]').textContent='0';`);
  const report = await checkArtifact(fake, { preview, quality: qualityProfile('做一个房贷计算器'), deadline: Date.now() + 20000 });
  assert.equal(report.ok, false); assert.ok(report.issues.some(issue => issue.code === 'business_check_failed'));
});
test('mortgage benchmark checks zero rate, nonzero rate and invalid input against platform math', { timeout: 30000 }, async t => {
  const preview = await startPreviewServer(); t.after(() => preview.close());
  const report = await checkArtifact(calculator(working), { preview, quality: qualityProfile('房贷计算器'), deadline: Date.now() + 20000 });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.businessChecks.length, 3);
});

test('normal first-load storage initialization is not classified as cross-project leakage', { timeout: 30000 }, async t => {
  const preview = await startPreviewServer(); t.after(() => preview.close());
  const artifact = { schemaVersion: 1, name: 'Defaults', entry: 'index.html', capabilities: ['localStorage'], acceptance: [{ kind: 'visible', target: 'h1' }], files: [{ path: 'index.html', content: '<h1>Defaults</h1><script>if(!localStorage.getItem("items"))localStorage.setItem("items","[]")</script>' }] };
  const report = await checkArtifact(artifact, { preview, deadline: Date.now() + 20000 });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
});

test('habit benchmark verifies independent items, persistent check-in and persistent deletion', { timeout: 30000 }, async t => {
  const preview = await startPreviewServer(); t.after(() => preview.close());
  const content = `<h1>习惯</h1><input data-nest-check="habit-name"><button data-nest-check="add-habit">添加</button><div id="list"></div><script>
  let items=JSON.parse(localStorage.getItem('habits')||'[]');const input=document.querySelector('input'),list=document.querySelector('#list');
  function save(){localStorage.setItem('habits',JSON.stringify(items));draw();}
  function draw(){list.replaceChildren();items.forEach((item,index)=>{const row=document.createElement('div');row.dataset.nestCheck='habit';row.append(document.createTextNode(item.name));const check=document.createElement('input');check.type='checkbox';check.dataset.nestCheck='check-in';check.checked=item.done;check.onchange=()=>{item.done=check.checked;save();};const del=document.createElement('button');del.dataset.nestCheck='delete-habit';del.textContent='删除';del.onclick=()=>{items.splice(index,1);save();};row.append(check,del);list.append(row);});}
  document.querySelector('button').onclick=()=>{if(input.value.trim()){items.push({name:input.value,done:false});input.value='';save();}};draw();</script>`;
  const artifact = { schemaVersion: 1, name: '习惯', entry: 'index.html', capabilities: ['localStorage'], acceptance: [{ kind: 'visible', target: 'h1' }], files: [{ path: 'index.html', content }] };
  const report = await checkArtifact(artifact, { preview, quality: qualityProfile('习惯打卡'), deadline: Date.now() + 20000 });
  assert.equal(report.ok, true, JSON.stringify(report.issues)); assert.equal(report.businessChecks.length, 3);
});
