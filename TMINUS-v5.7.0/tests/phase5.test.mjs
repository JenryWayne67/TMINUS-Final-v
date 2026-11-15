import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../server/match.mjs';
import {readFile} from 'node:fs/promises';
import {ONLINE_BASES,ONLINE_SITES,ONLINE_ROLES} from '../dist/online-constants.js';
const step=(m,n=11)=>{for(let i=0;i<n;i++)m.tick();};
const join=(m,team,role,name)=>{const result=m.join({team,role,name});assert.ok(result.player,result.error);m.ready(result.player.id,true);return result.player;};

test('four teams fill exactly sixteen unique real-player seats',()=>{
 const match=new Match();const seat=new Set();
 for(let t=0;t<4;t++)for(let r=0;r<4;r++){
  const p=join(match,t,r,`real-${t}-${r}`);seat.add(`${p.team}-${p.role}`);
 }
 assert.equal(match.players.size,16);assert.equal(seat.size,16);
 assert.match(match.join({team:0,role:0}).error,/full/i);
 assert.equal(match.teams.length,4);assert.equal(ONLINE_ROLES.length,4);
});
test('host start requires opposing teams, team slots cannot be stolen',()=>{
 const m=new Match();const host=join(m,0,0,'host');const friend=join(m,0,1,'friend');
 assert.match(m.start(host.id).error,/two teams/i);
 const other=join(m,1,0,'rival');
 assert.match(m.start(other.id).error,/host/i);
 assert.equal(m.start(host.id).ok,true);
 assert.equal(m.phase,'build');
 assert.equal(m.teams.length,4);
 assert.ok(friend.team===0&&friend.role===1);
});
test('movement is server-authoritative, bounded, collision-resolved and replay-resistant',()=>{
 const m=new Match({minPlayers:1});const p=join(m,0,0,'runner');m.start(p.id);
 assert.equal(m.receiveInput(p.id,{kind:'input',v:1,sequence:1,strafe:1,forward:1,buttons:2,aim:0,x:1e8,score:999}),true);
 assert.equal(m.receiveInput(p.id,{kind:'input',v:1,sequence:1,strafe:1,forward:1,buttons:2,aim:0}),false);
 assert.equal(m.receiveInput(p.id,{kind:'input',v:1,sequence:2,strafe:10,forward:0,buttons:2,aim:0}),false);
 assert.equal(m.receiveInput(p.id,{kind:'input',v:2,sequence:2,strafe:0,forward:0,buttons:0,aim:0}),false);
 assert.equal(m.receiveInput(p.id,{kind:'input',v:1,sequence:2,strafe:0,forward:0,buttons:0,aim:Infinity}),false);
 step(m,22);
 assert.ok(Math.abs(p.x)<54&&Math.abs(p.z)<50);
 assert.ok(p.score<999&&p.x!==1e8);
 const beforeIdle=p.x;step(m,30);assert.ok(p.x-beforeIdle<1.0,'stale input stops moving even if socket stays open');
 // Client teleport packets have no recognized field to bypass movement.
 p.x=1;p.z=14.6;
 assert.equal(m.receiveInput(p.id,{kind:'input',v:1,sequence:3,strafe:0,forward:-1,buttons:0,aim:0}),true);
 step(m,10);
 assert.ok(Math.hypot(p.x-1,p.z-11)>=2.5,'central rock collision is respected');
});
test('build interaction is proximity-bound, fastener increments and role contribution is awarded',()=>{
 const m=new Match({minPlayers:1});const p=join(m,0,0,'pilot');m.start(p.id);
 p.x=0;p.z=0;assert.match(m.action(p.id).error,/move close/i);
 const [bx,bz]=ONLINE_BASES[0];p.x=bx-4;p.z=bz-5;
 step(m);assert.equal(m.action(p.id).ok,true);
 step(m);assert.equal(m.action(p.id).ok,true);
 step(m);assert.equal(m.action(p.id).ok,true);
 assert.equal(m.teams[0].modules[0],3);assert.equal(p.score,45);
 step(m);assert.match(m.action(p.id).error,/already installed/i);
});
test('finite science objects are carried, dropped, stowed and delivered; stowing never scores',()=>{
 const m=new Match({minPlayers:1});const p=join(m,0,3,'raider');m.start(p.id);m.changePhase('surface');
 p.x=m.sites[0].x;p.z=m.sites[0].z;
 assert.equal(m.action(p.id).ok,true);assert.equal(p.carry,0);
 const sample=m.sites[0];assert.equal(sample.state,'carried');
 m.dropHeld(p);assert.equal(sample.state,'ground');assert.equal(p.carry,null);
 step(m,11);assert.equal(m.action(p.id).ok,true);assert.equal(p.carry,0);
 const [bx,bz]=ONLINE_BASES[p.team];p.x=bx;p.z=bz+6;
 step(m,11);assert.equal(m.action(p.id).ok,true);
 assert.equal(m.teams[0].cargo,1);assert.equal(m.teams[0].delivered,0);
 assert.equal(sample.state,'onboard');
 m.changePhase('return');m.changePhase('delivery');p.x=bx+8;p.z=bz;
 step(m,11);assert.equal(m.action(p.id).ok,true);
 assert.equal(m.teams[0].delivered,1);assert.equal(m.teams[0].cargo,0);
 assert.equal(sample.state,'delivered');
});
test('enemy fire is range, facing, cover, health, rate and respawn bounded',()=>{
 const m=new Match({minPlayers:2});const a=join(m,0,2,'gunner'),b=join(m,1,3,'raider');
 m.start(a.id);m.changePhase('surface');
 a.x=0;a.z=0;a.aim=0;b.x=0;b.z=-8;
 m.fire(a);assert.equal(b.hp,68);
 m.fire(a);assert.equal(b.hp,68,'cooldown suppresses second shot');
 step(m,7);m.fire(a);assert.equal(b.hp,36);
 step(m,7);m.fire(a);assert.equal(b.hp,4);
 step(m,7);m.fire(a);assert.equal(b.hp,0);assert.equal(a.kills,1);
 m.fire(a);assert.equal(a.kills,1);
 step(m,105);assert.equal(b.hp,100,'player respawns after five seconds');
 a.x=0;a.z=0;a.aim=Math.PI;b.x=0;b.z=-8;b.hp=100;
 step(m,10);m.fire(a);assert.equal(b.hp,100,'shots aimed behind attacker miss');
 a.aim=0;a.x=13;a.z=6;b.x=13;b.z=-10; // central rock is on line between players
 step(m,10);m.fire(a);assert.equal(b.hp,100,'cover blocks line of fire');
});
test('reconnect requires secret token, reserves seat for 60 seconds and clears movement',()=>{
 const m=new Match();const p=join(m,0,1,'engineer');const token=p.token;
 p.input.strafe=1;
 assert.equal(m.leave(p.id,1000),true);
 assert.equal(p.input.strafe,0);
 assert.equal(m.seat(0,1),true);
 assert.equal(m.join({team:0,role:1,token:'guess'}).player.role,0,'new player receives next available role');
 const r=m.join({token});assert.equal(r.player.id,p.id);assert.equal(r.resumed,true);
 m.leave(p.id,1000);m.expire(61001);assert.equal(m.players.has(p.id),false);
});
test('time-based progression ends in server-owned final score and winner',()=>{
 const m=new Match({durations:{build:.1,flight:.1,surface:.1,return:.1,delivery:.1}});
 const a=join(m,0,0,'a'),b=join(m,1,0,'b');m.start(a.id);
 m.teams[0].delivered=2;m.teams[1].delivered=1;
 step(m,15);
 assert.equal(m.phase,'results');assert.equal(m.winner,0);
 assert.equal(m.snapshot().teams[0].delivered,2);
});
test('v5.7.0 online browser bundle and single server source have correct requirements',async()=>{
 const html=await readFile(new URL('../dist/online.html',import.meta.url),'utf8');
 const client=await readFile(new URL('../dist/online.js',import.meta.url),'utf8');
 const code=await readFile(new URL('../dist/crew-experience.js',import.meta.url),'utf8');
 assert.match(html,/online\.js/);assert.match(html,/ROOM CODE/);
 assert.match(client,/new WebSocket\(/);assert.match(client,/interpolateSnapshots/);
 assert.match(code,/ONLINE MULTIPLAYER · REAL PLAYERS/);
 assert.equal(ONLINE_SITES.length,12);
});
