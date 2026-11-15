import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceGovernor} from '../dist/performance-core.js';
import {disposeDetachedTree} from '../dist/resource-lifecycle.js';
import {WIRE_VERSION,createAuthoritativeRoom,validateInputPacket,interpolateSnapshots} from '../dist/multiplayer-foundation.js';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL('../dist/'+path,import.meta.url),'utf8');

test('governor rejects invalid quality modes and behaves deterministically',()=>{
 const g=createPerformanceGovernor();assert.equal(g.setMode('ultra'),false);
 assert.equal(g.mode,'auto');assert.equal(g.ratio,1.5);
 assert.equal(g.setMode('low'),true);assert.equal(g.ratio,1);
 assert.equal(g.setMode('auto'),true);assert.equal(g.ratio,1.5);
});
test('automatic pixel ratio drops only after sustained slow windows; does not respond to suspended tabs',()=>{
 const g=createPerformanceGovernor({cooldownMs:0});
 for(let i=0;i<60;i++)g.observe(1000/24); // ~2.5 seconds slow window
 assert.equal(g.ratio,1.5,'one slow window is not enough');
 for(let i=0;i<60;i++)g.observe(1000/24);
 assert.ok(g.ratio<1.5);
 const ratio=g.ratio;
 for(let i=0;i<40;i++)g.observe(300,{visible:false});
 assert.equal(g.ratio,ratio);
});
test('governor returns to higher resolution after sustained fast frames, with bounds',()=>{
 const g=createPerformanceGovernor({min:0.75,max:1.5,initial:0.9,cooldownMs:0});
 for(let i=0;i<4*175;i++)g.observe(1000/60);
 assert.ok(g.ratio>0.9&&g.ratio<=1.5);
 g.setMode('medium');const fixed=g.ratio;
 for(let i=0;i<160;i++)g.observe(1000/20);
 assert.equal(g.ratio,fixed,'manual selection overrides autoscaling');
});
test('GPU resource cleanup deduplicates per-match geometry and preserves cached or imported assets',()=>{
 const count={g:0,m:0,shared:0};
 const geo={dispose(){count.g++;}}, mat={dispose(){count.m++;}},shared={dispose(){count.shared++;}};
 const children=[{geometry:geo,material:[mat,mat]},{geometry:geo,material:shared},{geometry:{dispose(){count.shared++;}},material:mat,userData:{tminusAssetShared:true}}];
 const root={traverse(fn){for(const o of children)fn(o);}};
 const out=disposeDetachedTree([root,root],r=>r===shared);
 assert.deepEqual(out,{geometries:1,materials:1});assert.deepEqual(count,{g:1,m:1,shared:0});
});
test('network packet validation rejects NaN, teleport requests, oversized identifiers and bad sequence values',()=>{
 const input={kind:'input',sequence:1,strafe:0.5,forward:-0.5,buttons:1};
 assert.equal(validateInputPacket(input).v,WIRE_VERSION);
 assert.equal(validateInputPacket({...input,forward:NaN}),null);
 assert.equal(validateInputPacket({...input,x:9999}).x,undefined,'client position is discarded');
 assert.equal(validateInputPacket({...input,sequence:-1}),null);
 assert.equal(validateInputPacket({...input,strafe:2}),null);
 assert.equal(validateInputPacket({...input,buttons:65536}),null);
});
test('authoritative room supports four teams of four unique slots, ignores replayed packets',()=>{
 const room=createAuthoritativeRoom();
 for(let t=0;t<4;t++)for(let r=0;r<4;r++)assert.equal(room.join({id:`${t}-${r}`,team:t,role:r,name:'player'}),true);
 assert.equal(room.size,16);
 assert.equal(room.join({id:'17',team:0,role:0}),false);
 assert.equal(room.receive('0-0',{kind:'input',sequence:1,forward:1,strafe:0,buttons:1}),true);
 assert.equal(room.receive('0-0',{kind:'input',sequence:1,forward:-1,strafe:0,buttons:1}),false);
 const first=room.tick();assert.equal(first.tick,1);
 assert.ok(first.players.find(p=>p.id==='0-0').z>0);
 assert.throws(()=>room.tick(1),/fixed step/);
});
test('server clamps player movement, ignores fake client speed and enforces team-role occupancy',()=>{
 const room=createAuthoritativeRoom({speed:4,radius:5});
 assert.equal(room.join({id:'abc',team:1,role:2}),true);
 assert.equal(room.join({id:'def',team:1,role:2}),false);
 assert.equal(room.receive('abc',{kind:'input',sequence:0,forward:1,strafe:1,buttons:0,speed:100000}),true);
 for(let i=0;i<150;i++)room.tick();
 const p=room.snapshot().players[0];assert.ok(p.x<=5&&p.z<=5);
 assert.equal(room.leave('abc'),true);assert.equal(room.size,0);
});
test('snapshot interpolation is bounded and tolerates joins and departures',()=>{
 const a={players:[{id:'x',x:0,z:0}]},b={players:[{id:'x',x:10,z:4},{id:'new',x:5,z:2}]};
 const out=interpolateSnapshots(a,b,.5);assert.equal(out[0].x,5);assert.equal(out[1].x,5);
 assert.equal(interpolateSnapshots(a,b,-1)[0].x,0);
 assert.equal(interpolateSnapshots(a,b,2)[0].x,10);
});
test('production uses explicit render path; never globally overrides the WebGLRenderer',async()=>{
 const game=await source('game.js'),crew=await source('crew-experience.js');
 assert.match(game,/experience\.renderWorld\?\.\(scene,camera\)/);
 assert.match(crew,/function renderWorld\(/);
 assert.doesNotMatch(crew,/renderer\.render\s*=/);
 assert.match(crew,/function onFocusLost\(/);
});
