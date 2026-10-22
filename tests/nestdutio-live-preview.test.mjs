import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../backend/database.mjs';
import { createJobs } from '../backend/nestdutio/jobs.mjs';
import { createProjects } from '../backend/nestdutio/projects.mjs';
import { createCheckpoints } from '../backend/nestdutio/generation-checkpoints.mjs';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, createServer } from 'node:http';
import { launchSandboxedBrowser } from '../backend/nestdutio/browser.mjs';

test('live preview exposes only the owner’s completed checkpoint files after the entry exists', async t => {
  const db = openDatabase(':memory:');
  db.prepare(`INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version)
    VALUES('owner','owner@example.test','owner@example.test','Owner','hash','salt','test')`).run();
  const projects = createProjects(db), project = projects.create('owner', { name: 'Live' });
  const jobs = createJobs(db, projects, {}, {});
  t.after(async () => { await jobs.shutdown(); db.close(); });
  db.prepare(`INSERT INTO nestdutio_tasks(id,user_id,project_id,request_key,prompt,state,created_at,updated_at)
    VALUES('task','owner',?,'live-test','test','generating','now','now')`).run(project.id);
  const checkpoints = createCheckpoints(db);
  const snapshot = { schemaVersion: 1, promptHash: 'a'.repeat(64), baseHash: 'b'.repeat(64), configHash: 'c'.repeat(64),
    plan: { name: 'Live', capabilities: [], acceptance: [{ kind: 'visible', target: 'h1' }] },
    manifest: { entry: 'index.html', files: [{ path: 'index.html', purpose: 'page', dependencies: [] }, { path: 'style.css', purpose: 'style', dependencies: [] }] },
    files: [{ path: 'style.css', content: 'h1{color:purple}' }] };
  checkpoints.save('task', snapshot);
  assert.equal(jobs.previewArtifact('owner', 'task'), null);
  snapshot.files.push({ path: 'index.html', content: '<h1>Actual generated content</h1>' });
  checkpoints.save('task', snapshot);
  const result = jobs.previewArtifact('owner', 'task');
  assert.equal(result.projectId, project.id);
  assert.match(result.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.artifact.files, snapshot.files);
  snapshot.files[1].content = '<h1>Repaired generated content</h1>';
  checkpoints.save('task', snapshot);
  assert.notEqual(jobs.previewArtifact('owner', 'task').revision, result.revision);
  assert.throws(() => jobs.previewArtifact('other', 'task'), { status: 404 });
  assert.throws(() => jobs.previewArtifact('owner', 'missing'), { status: 404 });
});

test('task preview API uses an isolated origin, caches revisions and enforces ownership', { timeout: 45000 }, async t => {
  const reserve = createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port; await new Promise(r => reserve.close(r));
  const base = `http://127.0.0.1:${port}`;
  const root = mkdtempSync(join(tmpdir(), 'nikai-live-preview-'));
  const app = buildApplication({ dbPath: join(root, 'test.db'), logger: false, publicBaseUrl: base, allowedOrigins: base });
  let browser, cleanup = async () => {};
  t.after(async () => { await browser?.close(); await cleanup(); await app.close(); rmSync(root, { recursive: true, force: true }); });
  await app.listen(port, '127.0.0.1');
  const owner = await registerUser(app.db, { email: 'live@example.test', normalizedEmail: 'live@example.test', displayName: 'Live', password: 'long-safe-password', consentVersion: 'test' });
  const other = await registerUser(app.db, { email: 'other@example.test', normalizedEmail: 'other@example.test', displayName: 'Other', password: 'long-safe-password', consentVersion: 'test' });
  const project = createProjects(app.db).create(owner.user.id, { name: 'Live' }), task = randomUUID();
  app.db.prepare(`INSERT INTO nestdutio_tasks(id,user_id,project_id,request_key,prompt,state,created_at,updated_at)
    VALUES(?,?,?,'preview-api','test','generating','now','now')`).run(task, owner.user.id, project.id);
  createCheckpoints(app.db).save(task, { schemaVersion: 1, promptHash: 'a'.repeat(64), baseHash: 'b'.repeat(64), configHash: 'c'.repeat(64),
    plan: { name: 'Live', capabilities: [], acceptance: [{ kind: 'visible', target: 'h1' }] },
    manifest: { entry: 'index.html', files: [{ path: 'index.html', purpose: 'page', dependencies: [] }] },
    files: [{ path: 'index.html', content: '<h1>Actual checkpoint preview</h1>' }] });
  const request = token => fetch(`${base}/api/v1/nestdutio/tasks/${task}/preview`, { method: 'POST', headers: token ? { Cookie: `nikai_auth=${token}` } : {} });
  assert.equal((await request()).status, 401);
  assert.equal((await request(other.token)).status, 404);
  const response = await request(owner.token); assert.equal(response.status, 200);
  const { data } = await response.json(); assert.equal(data.partial, true);
  assert.equal((await (await request(owner.token)).json()).data.id, data.id);
  const url = new URL(data.url); assert.notEqual(url.origin, new URL(base).origin);
  const preview = await new Promise((resolve, reject) => {
    const req = httpRequest(`http://127.0.0.1:${url.port}${url.pathname}`, { headers: { Host: url.host } }, res => {
      let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }); req.on('error', reject); req.end();
  });
  assert.equal(preview.status, 200); assert.match(preview.body, /Actual checkpoint preview/);
  assert.match(preview.headers['content-security-policy'], /sandbox/);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM nestdutio_versions').get().n, 0);
  const executable = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await (await import('@sparticuz/chromium')).default.executablePath();
  ({ browser, cleanup } = await launchSandboxedBrowser(executable, 20000));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'nikai_auth', value: owner.token, url: base }]);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.goto(`${base}/nestdutio?project=${project.id}`);
  await page.locator('#canvas-progress').filter({ hasText: '正在生成完整网页' }).waitFor();
  await page.frameLocator('#preview').getByRole('heading', { name: 'Actual checkpoint preview' }).waitFor();
  assert.match(await page.locator('#preview-name').innerText(), /生成中/);
  const checkpoint = createCheckpoints(app.db).read(task).snapshot;
  checkpoint.files[0].content = '<h1>Updated while generating</h1>';
  createCheckpoints(app.db).save(task, checkpoint);
  await page.frameLocator('#preview').getByRole('heading', { name: 'Updated while generating' }).waitFor();
  const evidence = process.env.NIKAI_LIVE_CANVAS_EVIDENCE;
  if (evidence) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, 'generating-desktop.png') }); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#preview-tab').click();
  assert.ok(await page.locator('#canvas-progress').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1));
  if (evidence) await page.screenshot({ path: join(evidence, 'generating-mobile.png') });
  const final = createProjects(app.db).saveVersion(owner.user.id, project.id, { schemaVersion: 1, ...checkpoint.plan, entry: 'index.html', files: [{ path: 'index.html', content: '<h1>Final checked version</h1>' }] }, null);
  app.db.prepare("UPDATE nestdutio_tasks SET state='ready',version_id=?,updated_at=? WHERE id=?").run(final.id, new Date().toISOString(), task);
  await page.frameLocator('#preview').getByRole('heading', { name: 'Final checked version' }).waitFor();
  assert.equal(await page.locator('#canvas-progress').isHidden(), true);
});
