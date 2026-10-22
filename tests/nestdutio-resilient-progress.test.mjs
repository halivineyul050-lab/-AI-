import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeProgress,readProgress} from '../backend/nestdutio/progress.mjs';
test('file progress keeps only validated artifact paths and safe counters',()=>{
 for(const code of ['manifest_validated','file_started','file_saved','file_retry','checkpoint_reused']) {
 const event=safeProgress({phase:'generating',code,path:'assets/main.js',file:'index.html',index:1,total:3,content:'secret',apiKey:'secret'});
 assert.deepEqual(event,{phase:'generating',code,index:1,total:3,file:'index.html',path:'assets/main.js'});
 assert.equal(readProgress(JSON.stringify([{...event,at:new Date().toISOString()}])).length,1);
 }
 for(const path of ['../secret.js','https://secret.js','data/a.js','a.js?key=secret','<script>.js']) assert.equal(safeProgress({phase:'generating',code:'file_started',path}).path,undefined);
 assert.equal(safeProgress({phase:'generating',code:'file_split'}),null);
});
