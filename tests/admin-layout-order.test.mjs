import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
test('sidebar destinations match content order and every module stays inside page-content',()=>{
 const links=[...html.matchAll(/class="side-nav-item[^\"]*"[^>]*href="#([^\"]+)"/g)].map(m=>m[1]);
 assert.equal(links.length,18);
 assert.ok(links.includes('newsletter-admin'));
 assert.ok(links.includes('explainer-admin'));
 assert.ok(links.includes('nestdutio-admin')); 
 const start=html.indexOf('<div class="page-content">');
 const end=html.indexOf('</main>',start);
 const positions=links.map(id=>html.indexOf(`id="${id}"`,start));
 assert.ok(positions.every(p=>p>start&&p<end));
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.ok(html.slice(positions.at(-1),end).trim().endsWith('</div>'));
});

test('admin page cache versions include the unified stylesheet',()=>{assert.match(html,/admin\.css\?v=20261020-analytics-1/)});
