import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, launch, step } from '../breakout-core.mjs';
test('wall reflection keeps ball in bounds',()=>{const g=createGame();launch(g);Object.assign(g.ball,{x:9,y:300,vx:-350,vy:-100});step(g,.04);assert.ok(g.ball.vx>0);assert.ok(g.ball.x>=8);});
test('paddle reflects direction based on impact position',()=>{const g=createGame();launch(g);Object.assign(g.ball,{x:g.paddle.x+45,y:465,vx:0,vy:350});step(g,.04);assert.ok(g.ball.vy<0);assert.ok(g.ball.vx>0);});
test('brick collision awards points and removes brick',()=>{const g=createGame();launch(g);const b=g.bricks.at(-1);Object.assign(g.ball,{x:b.x+b.w/2,y:b.y+b.h+10,vx:0,vy:-350});step(g,.03);assert.equal(b.alive,false);assert.equal(g.score,100);});
test('loss resets ball then third loss ends game',()=>{const g=createGame();for(let i=0;i<3;i++){launch(g);Object.assign(g.ball,{y:550,vy:350});step(g,.02);}assert.equal(g.lives,0);assert.equal(g.status,'over');});
test('destroying last brick wins finite game',()=>{const g=createGame();g.bricks=g.bricks.slice(0,1);const b=g.bricks[0];launch(g);Object.assign(g.ball,{x:b.x+b.w/2,y:b.y+b.h+10,vx:0,vy:-350});step(g,.03);assert.equal(g.status,'won');});
test('large frame remains collision safe',()=>{const g=createGame();launch(g);Object.assign(g.ball,{x:480,y:430,vx:0,vy:900});step(g,.1);assert.ok(g.ball.vy<0);assert.equal(g.lives,3);});
