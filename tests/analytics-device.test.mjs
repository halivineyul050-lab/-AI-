import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const file of ['app.js','seo-analytics.js'])test(`${file} classifies operating systems rather than assuming WeChat is a phone`,()=>{
 const source=readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
 const fn=source.match(/function deviceType\(\) \{[\s\S]*?\n\s*\}/)?.[0];assert.ok(fn);
 const cases=[
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) MicroMessenger/3.9 wxwork/4','Win32',0,'desktop'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile MicroMessenger/8','iPhone',5,'mobile'],
  ['Mozilla/5.0 (Linux; Android 14; Pixel) Mobile','Linux',5,'mobile'],
  ['Mozilla/5.0 (Linux; Android 14; TabletModel)','Linux',1,'tablet'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)','MacIntel',5,'tablet'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)','MacIntel',0,'desktop'],
  ['','',0,'unknown']
 ];
 for(const [userAgent,platform,maxTouchPoints,expected]of cases)assert.equal(vm.runInNewContext(fn+';deviceType()',{navigator:{userAgent,platform,maxTouchPoints}}),expected,userAgent);
});
