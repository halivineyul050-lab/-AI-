import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const authHtml = readFileSync('auth.html', 'utf8');
const authCss = readFileSync('auth.css', 'utf8');
const adminCss = readFileSync('admin.css', 'utf8');

test('management token screen remains inside the responsive auth panel', () => {
  assert.match(authHtml, /<main class="auth-main">[\s\S]*<section class="auth-panel"/);
  assert.match(authHtml, /<section class="admin-auth-panel" id="admin-auth-panel" hidden>/);
  assert.match(authHtml, /<form class="auth-form" id="admin-auth-form">[\s\S]*id="admin-login-token"/);
  assert.match(authCss, /\.auth-main\s*\{[^}]*place-items:\s*start center/s);
  assert.match(authCss, /\.auth-panel\s*\{[^}]*width:\s*min\(100%,\s*480px\)/s);
  assert.match(authCss, /\.admin-auth-panel\[hidden\]\s*\{\s*display:\s*none/s);
  assert.match(authCss, /@media\s*\(max-width:\s*520px\)[\s\S]*\.auth-panel\s*\{/s);
  assert.doesNotMatch(authCss, /\.admin-auth-panel[^{}]*\{[^}]*margin-(?:top|left|right|bottom):\s*-/s);
});

test('operations workspace defines spacious cards and responsive navigation', () => {
  for (const token of ['--admin-content-max:', '--admin-card-radius:', '--admin-control-height:']) {
    assert.ok(adminCss.includes(token), token);
  }
  assert.match(adminCss, /\.main\s*\{[^}]*min-width:\s*0/s);
  assert.match(adminCss, /\.page-content\s*\{[^}]*max-width:\s*var\(--admin-content-max\)[^}]*margin:\s*0 auto/s);
  assert.match(adminCss, /\.kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(adminCss, /@media\s*\(max-width:\s*760px\)[\s\S]*\.admin-shell\s*\{[^}]*display:\s*block/s);
  assert.match(adminCss, /@media\s*\(max-width:\s*760px\)[\s\S]*\.sidebar\s*\{[^}]*position:\s*sticky[^}]*height:\s*auto/s);
  assert.match(adminCss, /\.cms-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.match(adminCss, /:focus-visible/);
  assert.match(adminCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('dynamic admin content keeps logos and analytics metrics inside their cards', () => {
  assert.match(adminCss, /\.cms-item-primary\s*\{[^}]*display:\s*flex[^}]*min-width:\s*0/s);
  assert.match(adminCss, /\.cms-logo\s*\{[^}]*display:\s*(?:grid|flex)[^}]*flex:\s*0 0 56px[^}]*overflow:\s*hidden/s);
  assert.match(adminCss, /\.cms-logo img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain/s);
  assert.match(adminCss, /\.cms-search\s*>\s*(?:i|svg),?[^}]*width:\s*18px/s);
  assert.match(adminCss, /\.analytics-breakdown-row\s+\.search-query\s*\{[^}]*text-align:\s*left/s);
  assert.match(adminCss, /\.funnel-row\s*\{[^}]*grid-template-columns:\s*minmax\(110px,\s*\.8fr\)\s+minmax\(180px,\s*4fr\)\s+minmax\(108px,\s*\.8fr\)/s);
  assert.match(adminCss, /\.table-empty\s*>\s*(?:i|svg),?[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(adminCss, /\.table-empty\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*180px/s);
});

test('image provider workspace keeps cards bounded and model capabilities scrollable on mobile', () => {
  assert.match(adminCss, /\.image-provider-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*320px\),\s*1fr\)\)/s);
  assert.match(adminCss, /\.image-provider-card\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(adminCss, /\.image-model-table-wrap\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
  assert.match(adminCss, /\.image-model-table\s*\{[^}]*min-width:\s*880px/s);
  assert.match(adminCss, /@media\s*\(max-width:\s*760px\)[\s\S]*\.image-workspace-toolbar\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch/s);
  assert.match(adminCss, /@media\s*\(max-width:\s*760px\)[\s\S]*\.image-dialog-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
