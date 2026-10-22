import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(message); };
const releaseId = value => /^[A-Za-z0-9._-]{1,64}$/.test(value || '') || fail('invalid release ID');
function safePath(value) {
  if (typeof value !== 'string' || !value || /[\\:\r\n\t\0]/.test(value) || value.startsWith('/')
    || value.split('/').some(part => !part || part === '.' || part === '..'
      || /^(?:\.git|node_modules|data|imports|output)$/i.test(part)
      || (/^\.env/i.test(part) && part !== '.env.example') || /^\.mariadb\.cnf/i.test(part))
    || /\.(?:db|sqlite|sqlite3|key|pem|sql\.gz)$/i.test(value)) fail('unsafe release path');
  return value;
}
function walk(root, directory = '') {
  const files = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const name = directory ? directory + '/' + entry.name : entry.name;
    safePath(name);
    const stat = lstatSync(join(root, name));
    if (stat.isSymbolicLink()) fail('unsafe release link');
    if (stat.isDirectory()) files.push(...walk(root, name));
    else if (stat.isFile()) files.push(name);
    else fail('unsafe release file type');
  }
  return files.sort();
}
export function createReleaseInventory({ stageDir, repoDir = process.cwd(), baseline, releaseId: id, sourceCommit, overlayPaths }) {
  releaseId(id); releaseId(baseline?.releaseId);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) fail('sourceCommit must be a full Git commit');
  if (!Array.isArray(baseline.files) || !Array.isArray(overlayPaths) || !overlayPaths.length) fail('baseline and overlay whitelist required');
  if (lstatSync(stageDir).isSymbolicLink()) fail('unsafe stage link');
  const expected = new Map();
  for (const row of baseline.files) {
    safePath(row.path);
    if (expected.has(row.path)) fail('duplicate baseline path');
    if (!/^[a-f0-9]{64}$/.test(row.sha256 || '')) fail('invalid baseline hash');
    expected.set(row.path, row.sha256);
  }
  const approved = new Set();
  for (const name of overlayPaths) {
    safePath(name);
    if (['scripts/release-production.sh', 'scripts/rollback-production.sh'].includes(name)) fail('protected production switch script');
    if (approved.has(name)) fail('duplicate overlay path');
    approved.add(name);
    const committed = execFileSync('git', ['show', sourceCommit + ':' + name], { cwd: repoDir, maxBuffer: 64 * 1024 * 1024 });
    const hash = sha256(committed);
    if (sha256(readFileSync(join(stageDir, name))) !== hash) fail('stage differs from committed overlay: ' + name);
    expected.set(name, hash);
  }
  const actual = walk(stageDir);
  for (const name of expected.keys()) if (!actual.includes(name)) fail('missing release file: ' + name);
  for (const name of actual) {
    if (!expected.has(name)) fail('release file outside whitelist: ' + name);
    if (sha256(readFileSync(join(stageDir, name))) !== expected.get(name)) fail('changed baseline file: ' + name);
  }
  for (const name of ['package.json', 'package-lock.json', 'server.mjs', '.env.example', 'scripts/active-database-backup.mjs', 'scripts/apply-production-migrations.mjs']) if (!expected.has(name)) fail('missing required application file: ' + name);
  for (const directory of ['public', 'backend', 'tests']) if (!actual.some(name => name.startsWith(directory + '/'))) fail('missing application directory: ' + directory);
  return { schemaVersion: 1, releaseId: id, sourceCommit, baselineReleaseId: baseline.releaseId,
    baselineSha256: sha256(JSON.stringify([...baseline.files].map(({ path, sha256 }) => ({ path, sha256 })).sort((a,b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)))),
    overlays: [...approved].sort(), files: actual.map(path => { const bytes = readFileSync(join(stageDir, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; }) };
}
export function sealReleaseArchive({ inventory, archivePath }) {
  releaseId(inventory.releaseId);
  if (inventory.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(inventory.sourceCommit || '') || !Array.isArray(inventory.files)) fail('invalid release inventory');
  const expected = new Map(); let total = 0;
  for (const file of inventory.files) {
    safePath(file.path);
    if (expected.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) fail('invalid inventory file');
    expected.set(file.path, file); total += file.bytes;
  }
  if (!expected.size || total > 256 * 1024 * 1024) fail('archive verification size exceeds 256 MiB limit');
  const archive = resolve(archivePath);
  const archiveStat = lstatSync(archive);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink() || archiveStat.size > 256 * 1024 * 1024) fail('unsafe or oversized archive');
  const initialArchiveSha256 = sha256(readFileSync(archive));
  const options = { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 };
  const verbose = execFileSync('tar', ['-tvzf', archive], options).split(/\r?\n/).filter(Boolean);
  if (verbose.some(line => !['-', 'd'].includes(line[0]))) fail('unsafe archive link or file type');
  const members = execFileSync('tar', ['-tzf', archive], options).split(/\r?\n/).filter(Boolean);
  const names = [];
  for (const member of members) {
    const name = member.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
    if (!name || member.endsWith('/')) { if (name) { safePath(name); if (![...expected.keys()].some(file => file.startsWith(name + '/'))) fail('archive directory outside inventory'); } continue; }
    safePath(name);
    if (names.some(row => row.name === name) || !expected.has(name)) fail('archive member outside inventory or duplicate');
    names.push({name, member});
  }
  if (names.length !== expected.size) fail('archive missing inventory members');
  // Read each member independently: concatenating payloads would hide changes
  // to file boundaries. Separate calls also avoid Windows argument limits.
  for (const {name, member} of names) {
    const file = expected.get(name);
    const bytes = execFileSync('tar', ['-xOzf', archive, '--', member], { maxBuffer: Math.max(file.bytes + 1, 1024 * 1024) });
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) fail('archive content mismatch: ' + name);
  }
  if (initialArchiveSha256 !== sha256(readFileSync(archive))) fail('archive changed while verifying');
  return { schemaVersion: 1, inventory, archiveSha256: initialArchiveSha256, archiveBytes: archiveStat.size, sealedAt: new Date().toISOString() };
}
export function recordReleaseOutcome({ receipt, result }) {
  if (receipt?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(receipt.archiveSha256 || '')) fail('invalid package receipt');
  if (result.releaseId !== receipt.inventory.releaseId || result.status !== 'success' || result.remotePackageSha256 !== receipt.archiveSha256
    || result.service !== 'active' || result.ready?.database !== true || result.publicReady?.database !== true) fail('release success and health evidence required');
  for (const field of ['databaseBackup', 'codeBackup', 'rollbackSnapshot']) {
    const value = result[field];
    if (typeof value !== 'string' || !value.startsWith('/opt/nikai-ai-backups/') || value.includes('..') || /[\r\n\0]/.test(value)) fail('verified backup paths required');
  }
  return { ...receipt, deployment: { releaseId: result.releaseId, status: 'success', service: 'active', ready: { database: true }, publicReady: { database: true },
    databaseBackup: result.databaseBackup, codeBackup: result.codeBackup, rollbackSnapshot: result.rollbackSnapshot, recordedAt: new Date().toISOString() } };
}

function main(args) {
  const [command, ...values] = args, options = {};
  for (let i=0; i<values.length; i+=2) { if (!values[i].startsWith('--') || !values[i+1] || values[i+1].startsWith('--')) fail('arguments require --name value'); options[values[i].slice(2)] = values[i+1]; }
  if (!options.out) fail('--out is required; output must be a new file');
  const json = name => JSON.parse(readFileSync(options[name], 'utf8'));
  let result;
  if (command === 'inventory') {
    const inside = relative(resolve(options.stage), resolve(options.out));
    if (inside === '' || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + sep))) fail('inventory output must be outside stage');
    const baseline = json('baseline'); baseline.releaseId = options['baseline-release-id'];
    const repoDir = options.repo || process.cwd();
    const sourceCommit = options['source-commit'] || execFileSync('git', ['rev-parse', 'HEAD'], {cwd:repoDir,encoding:'utf8'}).trim();
    result = createReleaseInventory({stageDir:options.stage,repoDir,baseline,releaseId:options['release-id'],sourceCommit,overlayPaths:json('overlays')});
  } else if (command === 'seal') result = sealReleaseArchive({inventory:json('inventory'),archivePath:options.archive});
  else if (command === 'record') result = recordReleaseOutcome({receipt:json('receipt'),result:json('result')});
  else fail('use inventory, seal or record');
  writeFileSync(options.out, JSON.stringify(result,null,2)+'\n', {flag:'wx'});
  console.log(command + ' verified; receipt written');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
