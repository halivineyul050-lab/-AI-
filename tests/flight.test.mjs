import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight } from '../flight-core.mjs';
test('movement stays within the flight field',()=>{const s=createFlight();for(let i=0;i<100;i++){s.items=[];stepFlight(s,.05,{x:-100,y:100},()=>.5);}assert.ok(s.player.x>=s.player.r);assert.ok(s.player.y<=540-s.player.r);});
test('energy gives 100 points and is collected once',()=>{const s=createFlight();s.items=[{x:s.player.x,y:s.player.y,r:12,type:'energy'}];stepFlight(s,0,{},()=>.5);assert.equal(s.score,100);assert.equal(s.items.length,0);});
test('overlapping rocks cause only one hit during cooldown',()=>{const s=createFlight();s.items=[1,2].map(()=>({x:s.player.x,y:s.player.y,r:25,type:'rock'}));stepFlight(s,0,{},()=>.5);assert.equal(s.hp,2);s.items.push({x:s.player.x,y:s.player.y,r:25,type:'rock'});stepFlight(s,.01,{},()=>.5);assert.equal(s.hp,2);});
test('fatal hit freezes score, movement, and timer',()=>{const s=createFlight();s.hp=1;s.items=[{x:s.player.x,y:s.player.y,r:25,type:'rock'}];stepFlight(s,0,{},()=>.5);assert.equal(s.dead,true);const snap=JSON.stringify(s);stepFlight(s,1,{x:1},()=>.5);assert.equal(JSON.stringify(s),snap);});
test('survival increases score and difficulty over time',()=>{const s=createFlight();for(let i=0;i<1000;i++){s.items=[];stepFlight(s,.05,{},()=>.5);}assert.ok(s.score>=490);assert.ok(s.level>1);});

