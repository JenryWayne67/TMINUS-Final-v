import {parseHTML} from 'linkedom';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/',import.meta.url)).replace(/\/$/,'');
const {window}=parseHTML(await readFile(root+'/index.html','utf8'));
globalThis.window=window;globalThis.document=window.document;
Object.defineProperty(document,'activeElement',{value:document.body,configurable:true});
globalThis.location={hash:'',origin:'https://example.test',pathname:'/'};Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
Object.defineProperty(document,'pointerLockElement',{value:document.querySelector('#scene'),configurable:true});
globalThis.innerWidth=1440;globalThis.innerHeight=900;globalThis.devicePixelRatio=1;
globalThis.getComputedStyle=()=>({top:'85px'});
const handlers={};globalThis.addEventListener=(name,fn)=>(handlers[name]??=[]).push(fn);
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const timers=[];globalThis.setTimeout=(fn)=>{timers.push(fn);return timers.length;};
const noop=()=>{};const context=new Proxy({createConicGradient:()=>({addColorStop:noop})},{get:(target,key)=>key in target?target[key]:noop,set:(target,key,value)=>(target[key]=value,true)});
window.HTMLCanvasElement.prototype.getContext=()=>context;window.HTMLCanvasElement.prototype.setPointerCapture=noop;
let frameQueue=[];globalThis.requestAnimationFrame=fn=>{frameQueue.push(fn);};
const emit=(name,key)=>{for(const cb of handlers[name]??[])cb({key,repeat:false,preventDefault:noop});};
const runtime=await mkdtemp(join(tmpdir(),'tminus-integration-'));process.on('exit',()=>rmSync(runtime,{recursive:true,force:true}));
for(const name of ['dom-patch','model-grounding','preferences','character-motor','part-model','terrain-height','spacecraft-model','crew-navigation','motion-physics','performance-core','resource-lifecycle','multiplayer-foundation','world','game','core','engineering','planner','crew-world','crew-experience','expedition-core','phase3-core','better-core','match-extras','science-match','science-world','design-science','asset-loader','ship-walk','repairs-core','repairs-ui','go-nogo','science-log','ship-scale','fps-core','input-mode','fps-view','build-guide','locomotion','characters','crew-status','minimap','minimap-view','launch-pose','hull-collision','campaign-core','campaign-ui','campaign-world','ship-walk-core']){let s=name==='minimap-view'?"export const createMinimapView=()=>({draw(){},setVisible(){},cycleZoom(){return 1;},zoom:1});":name==='characters'?"export const SPECIES=['frog','robot','bee','flamingo'];export const attachSkin=()=>Promise.resolve(null);export const portraitFor=()=>Promise.resolve(null);":name==='fps-view'?"const P=()=>new Proxy(function(){},{get:(t,k)=>k==='fov'?70:k==='models'?{}:k==='spawnGrenadeMesh'?()=>({position:{set(){}},rotation:{x:0},removeFromParent(){}}):k==='muzzleWorld'?()=>({clone(){return this;},toArray(){return [0,0,0];}}):P(),apply:()=>P()});export const createSfx=()=>P();export const createFpsView=()=>P();":name==='ship-walk'?"export const openShipWalk=()=>{};export const isShipWalkOpen=()=>false;":name==='asset-loader'?"export const loadShipInterior=()=>Promise.reject(new Error('no loader in the mocked runtime'));export const loadGLB=()=>Promise.reject(new Error('no loader in the mocked runtime'));export const namedNodes=()=>new Map();":await readFile(root+'/'+name+'.js','utf8');if(name!=='world')s=s.replace("'./vendor/three.module.js'",JSON.stringify(root+'/vendor/three.module.js'));if(name==='world')s=s.replace("import * as THREE from './vendor/three.module.js';",`import * as RealTHREE from '${root}/vendor/three.module.js';\nclass MockRenderer{constructor(){this.shadowMap={};this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};}getPixelRatio(){return 1;}setPixelRatio(){}setSize(){}render(s,c){s.updateMatrixWorld();c.updateMatrixWorld();}}\nconst THREE={...RealTHREE,WebGLRenderer:MockRenderer};`);s=s.replace(/from ['"]\.\/([a-z0-9-]+)\.js['"]/g,"from './$1.mjs'");await writeFile(runtime+'/'+name+'.mjs',s);}
await import(pathToFileURL(runtime+'/game.mjs').href);
const api=window.tminus,ce=api.crewExperience;let now=performance.now();const step=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;const q=frameQueue;frameQueue=[];q.forEach(fn=>fn(now));}};
const click=selector=>{const b=document.querySelector(selector);assert.ok(b,selector);b.dispatchEvent(new window.Event('click',{bubbles:true}));};
const pointer=(name,button=0)=>{const e=new window.Event(name,{bubbles:true});Object.assign(e,{button,clientX:720,clientY:450,pointerId:1,preventDefault:noop});document.querySelector('#scene').dispatchEvent(e);};
step(5);assert.ok(!document.querySelector('#crew-menu').hidden);click('[data-screen="select"]');assert.equal(document.querySelectorAll('.ce-character').length,4);assert.equal(document.querySelectorAll('.ag-roster section').length,3);assert.ok(document.querySelector('#crew-menu').textContent.includes('15 BOTS'));click('.ce-character[data-role="0"]');ce.start();const modelWorld=await import(pathToFileURL(runtime+'/world.mjs').href);const bounds=new modelWorld.THREE.Box3().setFromObject(api.ship);const sz=bounds.getSize(new modelWorld.THREE.Vector3());assert.ok(sz.z>30&&sz.z<36,'the ship is about 33 m long, the size of the walkable interior (got '+sz.z.toFixed(1)+')');assert.ok(sz.x>20&&sz.x<34,'ship span with radiator wings is shuttle-scale (got '+sz.x.toFixed(1)+')');const tagged=new Set();api.ship.children.forEach(o=>{if(o.userData.partId)tagged.add(o.userData.partId);});assert.equal(tagged.size,12,'every one of the 12 parts has a visible piece on the one ship (got '+[...tagged].join()+')');const BGm=await import(pathToFileURL(runtime+'/build-guide.mjs').href);for(const v of ce.world.partVisuals){v.bolts.forEach((b,k)=>{const g=BGm.boltPosition(v.part,k);assert.ok(Math.hypot(b.position.x-g[0],b.position.y-g[1],b.position.z-g[2])<1e-6,'guide and game agree on where bolt '+k+' of '+v.part.id+' is');});}assert.equal(ce.state.mode,'cutscene');step(5);ce.skipIntro();assert.equal(ce.state.phase,'assembly');emit('keydown','v');assert.equal(ce.state.views[0],'first');step(3);assert.equal(ce.world.actors[0].group.visible,false);
console.log('PASS: APOGEX lobby, anthropomorphic cast, four faction rosters, 3D intro and per-role camera switch');
// Phase 3: the player owns an actual build task while bot teammates work nearby.
assert.equal(ce.state.autoBuild.enabled,false,'guided construction is the default');
const exp=await import(pathToFileURL(runtime+'/expedition-core.mjs').href);
for(const part of ce.state.parts.filter(p=>p.owner===0)){
 assert.ok(exp.pickPart(ce.state,part.id,0),'player can pick up '+part.id);
 while(ce.state.rotation[0]!==part.angle)exp.rotateCarried(ce.state,0);
 assert.ok(exp.placePart(ce.state,0,2),'player can align '+part.id);
 for(let j=0;j<3;j++) assert.ok(exp.fastenBolt(ce.state,part.id,j,0,1,2,true));
}
assert.equal(ce.state.crewActions.humanModules,3);
console.log('PASS: player can pick up, rotate, place and physically fasten own assigned modules');
// Exercise normal spatial AI through role handoffs. No remote-build watchdog or
// automatic construction fallback may complete this regression.
for(let i=0;i<10000&&ce.state.phase==='assembly';i++){
 if([300,900,1500,2100].includes(i)){
  const prior=ce.state.parts.map(p=>({id:p.id,stage:p.stage,bolts:[...p.bolts]}));
  ce.selectRole({300:1,900:2,1500:3,2100:0}[i]);
  assert.deepEqual(ce.state.parts.map(p=>({id:p.id,stage:p.stage,bolts:[...p.bolts]})),prior,'role changes preserve all construction work');
 }
 step();
}
assert.equal(ce.state.autoBuild.enabled,false,'normal crew navigation finishes without automatic recovery');
assert.equal(ce.state.phase,'outfit',JSON.stringify(ce.state.parts.map(p=>[p.id,p.stage,p.bolts])));
assert.ok(ce.state.parts.every(p=>p.stage==='secured'));
assert.ok(ce.state.teams.slice(1).every(t=>t.progress>0));
console.log('PASS: visible AI teammates complete the other nine components; all three rivals advance');
const cargo=ce.world.cargoVisuals.find(v=>v.cargo.owner===0);ce.world.actors[0].group.position.copy(cargo.group.position);ce.world.actors[0].group.position.y=0;step(60);assert.ok(ce.interact());const stowObj=ce.world.targets.find(o=>o.userData.action?.type==='stow');const priorView=ce.state.views[0];ce.state.views[0]='first';ce.world.actors[0].group.position.set(0,0,stowObj.position.z+.9);step(60);ce.lookAt(stowObj.position);step(3);assert.ok(ce.interact(),'stow the cargo at the aft ring');ce.state.views[0]=priorView;for(let i=0;i<6000&&!ce.state.cargo.every(c=>c.stowed);i++)step();assert.ok(ce.state.cargo.every(c=>c.stowed));
const check=ce.world.checks.find(c=>c.id==='engine');ce.world.actors[0].group.position.set(check.group.position.x,0,check.group.position.z+2);ce.lookAt(check.group.position);step(2);let ev=new window.Event('wheel',{bubbles:true});Object.assign(ev,{deltaY:-1,preventDefault:noop});for(let i=0;i<8;i++)document.querySelector('#scene').dispatchEvent(ev);pointer('pointerdown');step(360);pointer('pointerup');assert.equal(ce.state.checks.engine,1);for(let i=0;i<5000&&ce.state.phase!=='route';i++)step();assert.equal(ce.state.phase,'route');assert.equal(document.querySelectorAll('.ce-route-card').length,3);
console.log('PASS: manual cargo stowage, AI supply loading, calibrated engine test, power/pressure checks and calculated route choices');
ce.renderGoNoGo('sheltered');assert.equal(document.querySelectorAll('.ag-poll-card').length,4,'four crew report in the Go/No-Go poll');assert.ok(document.querySelector('[data-launch="sheltered"]')&&!document.querySelector('[data-launch="sheltered"]').disabled,'an all-GO poll lets the ship launch');assert.match(document.querySelector('.ag-poll-summary').textContent,/4 OF 4/);document.querySelector('[data-launch="sheltered"]').click();assert.match(document.querySelector('.ag-poll-summary').textContent,/T-MINUS 5/,'countdown starts');document.querySelector('[data-hold]').click();assert.notEqual(ce.state.mode,'launch','HOLD stops the countdown');document.querySelector('[data-launch="sheltered"]').click();await (await import('node:timers/promises')).setTimeout(5300);assert.equal(ce.state.mode,'launch','Launch in the poll starts the launch sequence after the countdown');
console.log('PASS: Go/No-Go poll shows four crew verdicts and its Launch button starts the launch');
if(false)ce.beginFlight('sheltered');step(5);ce.finishLaunch();assert.equal(ce.state.phase,'flight');step(5);assert.ok(ce.world.cockpitFrame.visible,'first-person cockpit frame');ce.state.aiAssist=false;ce.state.fault='reactor';step(30);{const el=document.querySelector('.ag-fault-alert');assert.ok(el&&/PRESS K/i.test(el.textContent),'a reactor fault shows the K-to-repair hint without opening the systems panel');}ce.state.fault='cooling';step(30);assert.ok(!/PRESS K/i.test(document.querySelector('.ag-fault-alert')?.textContent||''),'cooling has no hand repair, so no K hint');assert.match(document.querySelector('.ag-fault-alert')?.textContent||'',/thermal console/);ce.state.fault=null;step(30);assert.ok(!document.querySelector('.ag-fault-alert'),'no alert when nothing is wrong');ce.state.aiAssist=true;

for(let role=0;role<4;role++){ce.selectRole(role);ce.state.views[role]='first';step(3);assert.equal(ce.world.actors[role].group.visible,false);emit('keydown','v');emit('keyup','v');step(3);assert.equal(ce.state.views[role],'third');}
assert.ok(ce.world.actors[1].group.position.x>80,'engineer occupies the maintenance deck');assert.ok(ce.world.actors[3].group.position.x>80,'raider monitors cargo/scanning inside');
console.log('PASS: first/third person for Pilot, Engineer, Gunner and Raider; dedicated turret and interior stations');
ce.state.shield=200;ce.selectRole(0);for(let i=0;i<7000&&ce.state.phase==='flight';i++)step();assert.equal(ce.state.phase,'surface');assert.equal(ce.state.match.teams[0].planet,'B');assert.equal(ce.state.match.flags.filter(f=>f.state==='delivered').length,0);
ce.selectRole(3);ce.state.views[3]='first';const {THREE}=await import(pathToFileURL(runtime+'/world.mjs').href);
for(const id of [8,9]){const f=ce.state.match.flags[id];assert.equal(f.state,'site');ce.world.actors[3].group.position.set(f.position[0],0,f.position[2]+2);ce.lookAt(new THREE.Vector3(...f.position).setY(1.32));step(4);emit('keydown','e');step(360);emit('keyup','e');assert.equal(f.state,'carried','holding E through three scanner stages releases the flag');assert.equal(ce.state.match.teams[0].delivered,0);if(id===8){emit('keydown','g');emit('keyup','g');assert.equal(f.state,'ground');assert.ok(ce.interact(),'recover same dropped flag');assert.equal(f.state,'carried');}ce.world.actors[3].group.position.copy(api.ship.position).add(new THREE.Vector3(0,-.6,3));assert.ok(ce.interact(),'physically load the ship');assert.equal(f.state,'onboard');assert.equal(ce.state.match.teams[0].delivered,0);}
assert.equal(ce.state.match.flags.filter(f=>f.state==='onboard'&&f.owner===0).length,2);
// --- firefight controls on the surface
assert.ok(ce.fpsOn(),'the firefight layer is active on Planet B');
{const fp=ce.fps,key=k=>{emit('keydown',k);emit('keyup',k);},up=b=>{for(const cb of handlers.pointerup??[])cb({button:b});};
 ce.world.actors[3].group.position.set(0,0,0);step(5);
 assert.equal(fp.load.current,0,'starts with the carbine');
 key('2');assert.equal(fp.load.current,1,'key 2 selects the sidearm');key('3');assert.equal(fp.load.current,2,'key 3 selects the scatter blaster');key('1');assert.equal(fp.load.current,0);
 assert.equal(ce.state.selected,3,'number keys no longer switch crew on the surface');
 step(60);const mag0=fp.load.guns.carbine.mag;pointer('pointerdown',0);step(2);up(0);assert.ok(fp.load.guns.carbine.mag<mag0,'left click fires the weapon');
 pointer('pointerdown',2);step(2);assert.ok(fp.ads,'right click aims down sights');up(2);step(2);assert.ok(!fp.ads,'releasing right click stops aiming');
 const g0=fp.load.grenades;pointer('pointerdown',1);step(2);up(1);assert.equal(fp.load.grenades,g0-1,'middle click throws a grenade');assert.ok(fp.grenades.length>=1);
 step(300);assert.equal(fp.grenades.length,0,'the grenade exploded and was removed');
 step(60);key('r');assert.ok(fp.load.reloading>0,'R reloads');step(200);assert.equal(fp.load.guns.carbine.mag,30,'reload refilled the magazine');
 const v=fp.vitals,sh=v.shield,hp=v.health;ce.fpsHurt(20);assert.equal(v.shield,sh-20,'shield takes damage first');assert.equal(v.health,hp,'health untouched while the shield holds');
 ce.fpsHurt(100);assert.ok(v.health<hp&&v.shield===0,'when the shield is gone health takes damage');step(60*6);assert.ok(v.shield>0,'the shield recharges after a few seconds');
 key('Tab');assert.ok(!ce.lookOn(),'Tab switches to cursor mode');const m1=fp.load.guns.carbine.mag;step(60);pointer('pointerdown',0);step(3);up(0);assert.equal(fp.load.guns.carbine.mag,m1,'clicks do not fire in cursor mode');
 key('Tab');assert.ok(ce.lookOn(),'Tab switches back to look mode');
 FPSreset:{const {resetVitals}=await import(pathToFileURL(runtime+'/fps-core.mjs').href);resetVitals(fp.vitals);}
}
console.log('PASS: firefight controls: weapon keys, fire, aim, grenade, reload, shield and health, Tab cursor toggle');
console.log('PASS: Planet B landing; mouse-aligned SCAN → STABILIZE → EXTRACT; carry/drop/recover/load with delivered score still zero');
emit('keydown','n');emit('keyup','n');assert.equal(ce.state.flightLeg,'return');ce.selectRole(0);ce.state.shield=200;for(let i=0;i<4000&&ce.state.phase==='flight';i++)step();assert.equal(ce.state.phase,'delivery');assert.equal(ce.state.match.teams[0].planet,'A');ce.world.actors[0].group.position.set(0,0,38);assert.ok(ce.interact());assert.equal(ce.state.match.teams[0].delivered,1);assert.ok(ce.interact());assert.equal(ce.state.match.teams[0].delivered,2);assert.equal(ce.state.phase,'spectator');
console.log('PASS: defended return to Planet A; physical receiving station is the only scoring operation');
for(let i=0;i<10000&&!ce.state.ended;i++)step();assert.ok(ce.state.ended);assert.equal(ce.state.phase,'spectator');assert.ok(ce.state.match.over);assert.ok(document.querySelector('.ag-science-log'));assert.ok(document.querySelector('.ce-debrief').textContent.includes('2/12 FLAGS DELIVERED'));assert.ok(document.querySelectorAll('.ag-cause article').length>=3,'debrief traces outcomes to build choices');assert.match(document.querySelector('.ag-cause').textContent,/BECAUSE[\s\S]*SO/);assert.ok(document.querySelectorAll('.ag-history article').length>=1,'a real-history card is shown');console.log('PASS: debrief traces the flight back to build choices and shows a real-history card');
api.missionControl.open();assert.ok(!document.querySelector('#mission-control').hidden);assert.ok(document.querySelector('#crew-menu').hidden);api.missionControl.close();assert.ok(document.querySelector('.ag-science-log'));
console.log('PASS: finite AI capture/delivery, match evaluation, Science Log, progression and Mission Control reopening');
ce.start();ce.skipIntro();ce.state.phase='flight';ce.state.flightLeg='outbound';ce.state.route={duration:100,hazard:1,returnReserve:10};ce.state.match.teams[0].planet='space';ce.state.match.flags[0].state='onboard';ce.state.match.flags[0].owner=0;ce.state.hull=0;step(20);assert.ok(ce.state.match.teams[0].eliminated);assert.equal(ce.state.phase,'spectator');assert.equal(ce.state.match.flags[0].state,'wreck');assert.equal(ce.state.match.wrecks.length,1);assert.ok(document.querySelector('#expedition-hud').textContent.includes('CREW ELIMINATED'));
console.log('PASS: ship destruction eliminates the full orange crew, leaves a recovery beacon and activates spectator controls');
