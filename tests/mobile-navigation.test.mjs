import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const listeners={}; const classes=new Set(); const groups=[{open:true}];
 const nav={id:'',classList:{toggle(n,on){on?classes.add(n):classes.delete(n)},contains(n){return classes.has(n)}},contains(target){return target===nav||target.insideNav},querySelectorAll(){return groups},addEventListener(name,fn){listeners['nav:'+name]=fn}};
 const button={attrs:{},focusCount:0,setAttribute(n,v){this.attrs[n]=String(v)},addEventListener(n,fn){listeners['button:'+n]=fn},focus(){this.focusCount++},contains(target){return target===button}};
 const account={open:true}; const media={matches:true,addEventListener(n,fn){listeners['media:'+n]=fn}};
 const header={querySelector(sel){return sel==='.site-nav'?nav:sel==='.mobile-menu-button'?button:sel==='.header-account-menu'?account:null}};
 const document={querySelector(sel){return sel==='.site-header-shared'?header:null},addEventListener(n,fn){listeners[n]=fn}};
 vm.runInNewContext(readFileSync('public/header-account.js','utf8'),{document,window:{matchMedia(){return media}}});
 return {listeners,nav,button,account,media,groups,classes};
}
test('shared mobile navigation opens once, closes account menu and synchronizes accessibility',()=>{
 const f=fixture();assert.equal(f.button.attrs['aria-expanded'],'false');assert.equal(f.button.attrs['aria-controls'],f.nav.id);
 f.listeners['button:click']();assert.equal(f.classes.has('is-mobile-open'),true);assert.equal(f.button.attrs['aria-expanded'],'true');assert.equal(f.account.open,false);
 f.listeners['button:click']();assert.equal(f.classes.has('is-mobile-open'),false);assert.equal(f.button.attrs['aria-expanded'],'false');assert.equal(f.groups[0].open,false);
});
test('outside click and Escape close menu, but submenu headings do not dismiss it',()=>{
 const f=fixture();f.listeners['button:click']();f.listeners.click({target:{insideNav:true,closest(){return null}}});assert.equal(f.classes.has('is-mobile-open'),true);
 f.listeners.keydown({key:'Escape'});assert.equal(f.classes.has('is-mobile-open'),false);assert.equal(f.button.focusCount,1);
 f.listeners['button:click']();f.listeners.click({target:{closest(){return null}}});assert.equal(f.classes.has('is-mobile-open'),false);
});
test('selecting a destination and leaving mobile viewport clears menu state',()=>{
 const f=fixture();f.listeners['button:click']();f.listeners['nav:click']({target:{closest(){return {}}}});assert.equal(f.classes.has('is-mobile-open'),false);
 f.listeners['button:click']();f.media.matches=false;f.listeners['media:change']();assert.equal(f.classes.has('is-mobile-open'),false);assert.equal(f.button.attrs['aria-expanded'],'false');
});
