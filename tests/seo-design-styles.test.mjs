import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('every server-rendered detail template loads shared design tokens before layout',()=>{
 const source=readFileSync('server.mjs','utf8');
 const heads=[...source.matchAll(/<head>[\s\S]*?<\/head>/g)].map(x=>x[0]).filter(x=>x.includes('/styles.css'));
 assert.equal(heads.length,5);
 for(const head of heads){assert.match(head,/design-system\.css\?v=/);assert.ok(head.indexOf('/design-system.css')<head.indexOf('/styles.css'));}
 const css=readFileSync('public/design-system.css','utf8');for(const token of ['--bg-page:','--text-primary:','--brand:'])assert.ok(css.includes(token));
});
