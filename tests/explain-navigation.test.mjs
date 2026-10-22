import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('explainer uses the shared navigation, account and mobile menu with a current-page entry',()=>{
 const html=readFileSync(new URL('../public/explain.html',import.meta.url),'utf8');
 assert.match(html,/class="site-header site-header-shared"/);
 assert.match(html,/data-page="explain"/);
 assert.match(html,/href="\/explain" aria-current="page"/);
 for(const id of ['utility-menu-open','header-account','utility-theme'])assert.ok(html.includes(id),id);
 for(const asset of ['site-header.js','header-account.js','utility-theme.js','site-header.css'])assert.ok(html.includes('/'+asset),asset);
 const nav=JSON.parse(readFileSync(new URL('../scripts/frontend/site-navigation.json',import.meta.url),'utf8'));
 assert.equal(nav.pages['explain.html'].active,'explain');
 assert.ok(nav.groups.some(g=>g.links.some(([href])=>href==='/explain')));
 assert.ok(html.includes('class="explainer-content"'));
});
