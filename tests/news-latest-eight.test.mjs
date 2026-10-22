import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function filterMergedContent(');
const end=source.indexOf('\nfunction ',start+1);
function render(kind='all',count=20){
  const newsItems=Array.from({length:count},(_,i)=>({id:`news-${i}`,date:`2026-10-${String(i+1).padStart(2,'0')}`}));
  const tutorials=Array.from({length:count},(_,i)=>({id:`tutorial-${i}`,date:`2026-09-${String(i+1).padStart(2,'0')}`}));
  const more={hidden:false},hot={hidden:false};let rendered;
  const context={newsItems,tutorials,mergedContentKind:'all',newsTotal:100,newsLoading:false,newsRefreshing:false,
    renderArticles(target,items){assert.equal(target,'news-list');rendered=items;},refreshIcons(){},
    document:{getElementById:()=>more,querySelector:()=>hot,querySelectorAll:()=>[]}};
  runInNewContext(source.slice(start,end)+`\nfilterMergedContent(${JSON.stringify(kind)});`,context);
  return {ids:Array.from(rendered,item=>item.id),more,hot};
}
for(const kind of ['all','news','tutorials'])test(`${kind} content displays only its latest eight entries without pagination`,()=>{
  const {ids,more,hot}=render(kind);
  const prefix=kind==='tutorials'?'tutorial':'news';
  assert.deepEqual(ids,Array.from({length:8},(_,i)=>`${prefix}-${19-i}`));
  assert.equal(more.hidden,true);assert.equal(hot.hidden,true);
});
test('short and empty lists show only existing articles',()=>{
  assert.equal(render('all',2).ids.length,4);
  assert.deepEqual(render('all',0).ids,[]);
});
