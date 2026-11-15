import test from 'node:test';import assert from 'node:assert/strict';
import {createMotor,advanceMotor,moveCharacter,clearMotor} from '../dist/character-motor.js';
import {createSuit,advanceSpacewalk,moveSuit,EVA,suitBlocked} from '../dist/spacewalk-core.js';
import {ExpeditionMatch} from '../server/expedition-match.mjs';
import {spaceBaseFor,baseFor} from '../dist/expedition-network.js';
const room=()=>{const m=new ExpeditionMatch();for(let team=0;team<2;team++){const p=m.join({team,role:team?3:2}).player;m.ready(p.id,true);}m.start([...m.players.keys()][0]);return m;};
const ticks=(m,n)=>{for(let i=0;i<n;i++){for(const p of m.players.values())p.lastInputAt=m.time;m.tick();}};
const command=(m,p,data)=>{ticks(m,3);return m.action(p.id,{commandSeq:p.commandSeq+1,...data});};
test('shared motor accelerates, brakes, jumps once per press and respects swept walls',()=>{
 const m=createMotor();let p={x:0,z:0};const first=advanceMotor(m,{x:1,speed:6.2},.05);assert.ok(first.dx>0&&first.dx<6.2*.05);
 for(let i=0;i<30;i++){const q=moveCharacter(m,p,{x:1,speed:6.2},.05,[{x0:2,x1:3,z0:-3,z1:3}]);p=q;}assert.ok(p.x<=1.55+.0001);
 clearMotor(m);advanceMotor(m,{jump:true},.05);assert.ok(m.y>0);for(let i=0;i<100;i++)advanceMotor(m,{jump:true},.05);assert.equal(m.y,0);assert.equal(m.grounded,true);advanceMotor(m,{jump:false},.05);advanceMotor(m,{jump:true},.05);assert.ok(m.y>0);
});
test('suit movement preserves tether, avoids the physical hull and consumes/refills oxygen',()=>{
 const s=createSuit(),ship={x:0,y:1.476,z:0};let p={x:20,y:6,z:-20};for(let i=0;i<1000;i++)p=advanceSpacewalk(s,p,{x:1,y:1,z:-1},ship,.05);assert.ok(Math.hypot(p.x-ship.x,p.y-ship.y,p.z-ship.z)<=EVA.radius+.0001);assert.ok(s.oxygen<100);
 const near={x:EVA.airlock.x,y:ship.y+EVA.airlock.y,z:EVA.airlock.z};s.vx=s.vy=s.vz=0;advanceSpacewalk(s,near,{},ship,.05);assert.ok(s.oxygen>60);
 assert.ok(suitBlocked({x:0,y:5,z:0},ship));const safe=moveSuit({x:10,y:5,z:-5},{x:0,y:5,z:0},ship);assert.equal(suitBlocked(safe,ship),false);
});
test('online weapons use shared ammo, reload, pellet damage, shields and team rules',()=>{
 const m=room(),[a,b]=[...m.players.values()];for(let team=0;team<2;team++){m.missions[team].phase='surface';m.science.teams[team].planet='B';}
 const ba=baseFor(0),bb=baseFor(1);a.x=-ba.x;a.z=-ba.z;a.aim=0;b.x=-bb.x;b.z=-8-bb.z;
 a.input={strafe:0,forward:0,buttons:1};const before=a.loadout.guns.carbine.mag;ticks(m,8);assert.ok(a.loadout.guns.carbine.mag<before);assert.ok(b.vitals.shield<60||b.hp<100);
 a.input.buttons=0;assert.ok(command(m,a,{op:'reload'}).ok);ticks(m,45);assert.equal(a.loadout.guns.carbine.mag,30);
 assert.ok(command(m,a,{op:'weapon',slot:2}).ok);assert.equal(a.loadout.current,2);assert.ok(command(m,a,{op:'weapon',slot:1.5}).error);
 const gren=a.loadout.grenades;assert.ok(command(m,a,{op:'grenade'}).ok);assert.equal(a.loadout.grenades,gren-1);assert.equal(m.grenades.length,1);ticks(m,50);assert.equal(m.grenades.length,0);
});
test('Raider can repair exterior panels with server suit oxygen, range and spare validation',()=>{
 const m=room(),a=[...m.players.values()][0];a.role=3;const s=m.missions[0];s.phase='flight';s.route={duration:100,hazard:1};s.flightTime=0;s.panels[0].health=30;
 assert.ok(command(m,a,{op:'eva'}).ok);assert.equal(a.eva,true);const panel=s.panels[0];a.x=panel.offset[0]-1;a.y=1.476+panel.offset[1]-1;a.z=panel.offset[2];
 assert.ok(command(m,a,{op:'remove-panel',panel:panel.id}).ok);assert.ok(command(m,a,{op:'work',target:{type:'panel',id:panel.id}}).ok);a.input={strafe:0,forward:0,buttons:4,vertical:0};ticks(m,55);assert.equal(panel.health,100);assert.equal(s.spares,5);
 assert.ok(command(m,a,{op:'eva'}).error,'cannot board from a remote exterior panel');a.x=s.shipMotion.x+EVA.airlock.x;a.y=1.476+EVA.airlock.y;a.z=s.shipMotion.z+EVA.airlock.z;assert.ok(command(m,a,{op:'eva'}).ok);assert.equal(a.eva,false);
});
