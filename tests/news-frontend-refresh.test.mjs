import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('automatic revision refresh preserves more than 1000 loaded articles and reenables pagination',async()=>{
 const start=source.indexOf('async function refreshPublishedContent()');const end=source.indexOf('\nasync function checkContentRevision',start);let restored=false,apiCalls=0;const button={disabled:true};
 const context={newsRefreshing:false,newsLoading:false,newsItems:Array.from({length:1060},(_,id)=>({id})),newsTotal:1260,state:{activeView:'news',category:'all'},backendAvailable:true,categoryMap:{all:{}},captureNewsPosition:()=>({id:1040,top:120}),restoreNewsPosition:position=>{assert.equal(position.id,1040);restored=true;},loadBackendData:async()=>{context.newsItems.splice(1000);return true;},apiRequest:async()=>{apiCalls++;return {data:Array.from({length:60},(_,id)=>({id:id+1000}))};},rebuildDataMaps(){},loadToolResults:async()=>true,loadRankingTools:async()=>{},loadGrowthData:async()=>{},loadCollectionTools:async()=>{},renderNavigation(){},renderSponsor(){},renderTools(){},renderCollections(){},renderContentViews(){},renderDecisionModules(){},document:{getElementById:()=>button}};
 const result=await runInNewContext(source.slice(start,end)+'\nrefreshPublishedContent();',context);assert.equal(result,true);assert.equal(context.newsItems.length,1060);assert.equal(apiCalls,1);assert.equal(restored,true);assert.equal(context.newsRefreshing,false);assert.equal(button.disabled,false);
});
