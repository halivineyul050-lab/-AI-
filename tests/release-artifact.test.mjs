import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReleaseInventory, sealReleaseArchive, recordReleaseOutcome } from '../scripts/release-artifact.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'nikai-release-test-')), stage=join(root,'stage'), repo=join(root,'repo');
  t.after(()=>rmSync(root,{recursive:true,force:true})); mkdirSync(stage); mkdirSync(repo);
  const put=(base,p,value)=>{mkdirSync(dirname(join(base,p)),{recursive:true});writeFileSync(join(base,p),value);};
  const names=['package.json','package-lock.json','server.mjs','.env.example','scripts/active-database-backup.mjs','scripts/apply-production-migrations.mjs','public/app.js','backend/example.mjs','tests/example.test.mjs'];
  const baseline={releaseId:'base-1',files:names.map(path=>{put(stage,path,'baseline');put(repo,path,'baseline');return {path,sha256:hash('baseline')};})};
  put(repo,'backend/example.mjs','committed change');
  execFileSync('git',['init','--quiet'],{cwd:repo});execFileSync('git',['add','.'],{cwd:repo});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture'],{cwd:repo});
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  put(stage,'backend/example.mjs','committed change');
  const options={stageDir:stage,repoDir:repo,baseline,sourceCommit,releaseId:'candidate-1',overlayPaths:['backend/example.mjs']};
  return {root,stage,repo,put,options};
}
test('release inventory binds only committed overlays to a verified complete baseline',t=>{
  const f=fixture(t), inventory=createReleaseInventory(f.options);
  assert.equal(inventory.sourceCommit,f.options.sourceCommit);assert.equal(inventory.baselineReleaseId,'base-1');assert.equal(inventory.files.length,9);
  f.put(f.repo,'backend/example.mjs','uncommitted edit');
  assert.deepEqual(createReleaseInventory(f.options).files,inventory.files,'working tree edits cannot change approved commit');
  f.put(f.stage,'backend/example.mjs','uncommitted edit');assert.throws(()=>createReleaseInventory(f.options),/committed overlay/);
});
test('release inventory rejects extra, missing and changed baseline files',t=>{
  const f=fixture(t);f.put(f.stage,'public/extra.js','unexpected');assert.throws(()=>createReleaseInventory(f.options),/outside whitelist/);rmSync(join(f.stage,'public/extra.js'));
  f.put(f.stage,'public/app.js','changed');assert.throws(()=>createReleaseInventory(f.options),/baseline/);f.put(f.stage,'public/app.js','baseline');
  rmSync(join(f.stage,'.env.example'));assert.throws(()=>createReleaseInventory(f.options),/missing/);
});
test('release inventory rejects secrets, traversal and duplicate approved paths',t=>{
  const f=fixture(t);for(const p of ['.env','.mariadb.cnf','../outside','data/site.db','scripts/release-production.sh'])assert.throws(()=>createReleaseInventory({...f.options,overlayPaths:[p]}),/unsafe|protected/);
  assert.throws(()=>createReleaseInventory({...f.options,overlayPaths:['backend/example.mjs','backend/example.mjs']}),/duplicate/);
  f.put(f.stage,'.env','fixture-only');assert.throws(()=>createReleaseInventory(f.options),/unsafe/);
});
test('sealed archive verifies member contents and detects payload tampering',t=>{
  const f=fixture(t), inventory=createReleaseInventory(f.options), archive=join(f.root,'release.tgz');
  execFileSync('tar',['-czf',archive,'-C',f.stage,'.']);
  const receipt=sealReleaseArchive({inventory,archivePath:archive});assert.equal(receipt.archiveSha256,hash(readFileSync(archive)));assert.equal(receipt.inventory.sourceCommit,f.options.sourceCommit);
  f.put(f.stage,'public/app.js','tampered');execFileSync('tar',['-czf',archive,'-C',f.stage,'.']);assert.throws(()=>sealReleaseArchive({inventory,archivePath:archive}),/archive content/);
});
test('successful release record requires matching upload, backups and internal/public health',t=>{
  const f=fixture(t), inventory=createReleaseInventory(f.options), archive=join(f.root,'release.tgz');execFileSync('tar',['-czf',archive,'-C',f.stage,'.']);const receipt=sealReleaseArchive({inventory,archivePath:archive});
  const result={releaseId:'candidate-1',status:'success',remotePackageSha256:receipt.archiveSha256,service:'active',ready:{database:true},publicReady:{database:true},databaseBackup:'/opt/nikai-ai-backups/mariadb/test.sql.gz',codeBackup:'/opt/nikai-ai-backups/releases/test.tgz',rollbackSnapshot:'/opt/nikai-ai-backups/releases/previous-test'};
  assert.equal(recordReleaseOutcome({receipt,result}).deployment.status,'success');
  for(const patch of [{releaseId:'other'},{status:'failed'},{remotePackageSha256:'0'.repeat(64)},{publicReady:{database:false}},{databaseBackup:''},{rollbackSnapshot:'/tmp/unverified'}])assert.throws(()=>recordReleaseOutcome({receipt,result:{...result,...patch}}));
});

test('archive verifier detects changed member boundaries with identical concatenated payload',t=>{
  const f=fixture(t);
  f.put(f.stage,'public/app.js','a');f.put(f.stage,'server.mjs','bcd');
  const inventory=createReleaseInventory({...f.options,baseline:{...f.options.baseline,files:f.options.baseline.files.map(row=>({...row,sha256:row.path==='public/app.js'?hash('a'):row.path==='server.mjs'?hash('bcd'):row.sha256}))}});
  inventory.files.find(row=>row.path==='public/app.js').bytes=2;
  inventory.files.find(row=>row.path==='public/app.js').sha256=hash('ab');
  inventory.files.find(row=>row.path==='server.mjs').bytes=2;
  inventory.files.find(row=>row.path==='server.mjs').sha256=hash('cd');
  const archive=join(f.root,'release.tgz');
  execFileSync('tar',['-czf',archive,'-C',f.stage,'public/app.js','server.mjs',...inventory.files.map(row=>row.path).filter(path=>!['public/app.js','server.mjs'].includes(path))]);
  assert.throws(()=>sealReleaseArchive({inventory,archivePath:archive}),/archive content mismatch/);
});

test('archive verifier refuses extra directories and symbolic links',t=>{
  const f=fixture(t), inventory=createReleaseInventory(f.options), archive=join(f.root,'release.tgz');
  mkdirSync(join(f.stage,'extra'));execFileSync('tar',['-czf',archive,'-C',f.stage,'.']);assert.throws(()=>sealReleaseArchive({inventory,archivePath:archive}),/outside inventory/);rmdirSync(join(f.stage,'extra'));
  if(process.platform !== 'win32') {
    execFileSync('ln',['-s','public/app.js',join(f.stage,'link')]);
    execFileSync('tar',['-czf',archive,'-C',f.stage,'.']);assert.throws(()=>sealReleaseArchive({inventory,archivePath:archive}),/link or file type/);
  }
});
