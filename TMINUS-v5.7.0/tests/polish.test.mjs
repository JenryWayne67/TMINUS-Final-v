import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {solveLeg} from '../dist/rig-grounding.js';
import {groundObject} from '../dist/model-grounding.js';
import {normalizePreferences,updatePreferences,getPreferences} from '../dist/preferences.js';
import {estimateSceneMemory} from '../dist/performance-core.js';
import {ExpeditionMatch} from '../server/expedition-match.mjs';
test('two-bone IK reaches a foot target without changing bone lengths or model origin',()=>{
 const model=new THREE.Group(),hip=new THREE.Bone(),knee=new THREE.Bone(),foot=new THREE.Bone();model.add(hip);hip.add(knee);knee.add(foot);hip.position.y=2;knee.position.set(0,-1,.1);foot.position.set(0,-1,-.1);model.updateMatrixWorld(true);const target=new THREE.Vector3(.2,.2,.1),length=knee.position.length();assert.ok(solveLeg(hip,knee,foot,target));assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(target)<.0001);assert.equal(knee.position.length(),length);assert.equal(model.position.y,0);
});
test('model grounding uses the actual rotated mesh bounds on a parent-space shelf',()=>{
 const parent=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,3),new THREE.MeshBasicMaterial());parent.position.y=4;parent.add(mesh);mesh.rotation.z=.3;groundObject(mesh,.48);parent.updateMatrixWorld(true);assert.ok(Math.abs(new THREE.Box3().setFromObject(mesh).min.y-4.48)<1e-6);
});
test('preferences clamp corrupt storage values and preserve independent audio and motion controls',()=>{
 const p=normalizePreferences({textScale:99,sensitivity:-5,highContrast:'true',masterVolume:NaN});assert.equal(p.textScale,1.5);assert.equal(p.sensitivity,.3);assert.equal(p.highContrast,false);assert.equal(p.masterVolume,.7);assert.doesNotThrow(()=>normalizePreferences(null));updatePreferences({effectsVolume:.2,cameraShake:0});assert.equal(getPreferences().effectsVolume,.2);assert.equal(getPreferences().cameraShake,0);
});
test('memory estimate counts shared buffers and maps once',()=>{
 const g=new THREE.BoxGeometry(),t=new THREE.Texture({width:32,height:16}),m=new THREE.MeshBasicMaterial({map:t}),s=new THREE.Scene();s.add(new THREE.Mesh(g,m),new THREE.Mesh(g,m));const out=estimateSceneMemory(s);assert.equal(out.materials,1);assert.ok(out.geometryBytes>0);assert.equal(out.textureBytes,Math.ceil(32*16*4*4/3));
});
function fixture(){const m=new ExpeditionMatch();for(let team=0;team<2;team++){const p=m.join({team,role:2}).player;m.ready(p.id,true);}m.start([...m.players.keys()][0]);return m;}
test('short jump and fire presses survive a release before the next server tick',()=>{
 const m=fixture(),p=[...m.players.values()][0];m.missions[0].phase='surface';m.science.teams[0].planet='B';p.x=25;p.z=25;p.loadout.current=2;let seq=0;
 for(const buttons of [9,0])assert.equal(m.receiveInput(p.id,{kind:"input",v:1,sequence:++seq,strafe:0,forward:0,aim:0,buttons}),true);
 const before=p.loadout.guns.scatter.mag;m.tick();assert.ok(p.y>0);assert.equal(p.loadout.guns.scatter.mag,before-1);for(let i=0;i<50;i++)m.tick();assert.equal(p.loadout.guns.scatter.mag,before-1);
});
test('flight turret damages opposing hulls, respects defensive abilities, and emits authoritative shots',()=>{
 const m=fixture(),[p]=m.players.values();for(const s of m.missions){s.phase='flight';s.route={duration:100};s.flightTime=0;}p.aim=Math.PI/2;m.fire(p);assert.equal(m.missions[1].hull,98);assert.equal(m.combatEvents.at(-1).type,'ship-hit');m.time+=1;m.missions[1].shield=3;m.fire(p);assert.equal(m.missions[1].hull,98);
});
test('surface abilities recharge and role handoffs preserve an airborne motor',()=>{
 const m=fixture(),p=[...m.players.values()][0],s=m.missions[0];s.phase='surface';s.abilityCD[2]=.1;p.motor.y=p.y=.5;p.motor.vy=2;p.motor.grounded=false;assert.ok(m.chooseSeat(p.id,0,1).ok);assert.equal(p.motor.y,.5);assert.equal(p.motor.vy,2);m.tick();m.tick();assert.equal(s.abilityCD[2],0);
});
test('height-aware camera boom clears low gear and stops at the elevated hull',async()=>{
 const {cameraBoomFraction}=await import('../dist/motion-physics.js');const box={x0:2,x1:4,z0:-2,z1:2,y0:0,y1:.45};assert.equal(cameraBoomFraction({x:0,y:2,z:0},{x:8,y:3,z:0},[box]),1);assert.ok(cameraBoomFraction({x:0,y:2,z:0},{x:8,y:3,z:0},[{...box,y0:1,y1:4}])<.5);
});
test('campaign telemetry preserves a task button and its focus target across updates',async()=>{
 const {parseHTML}=await import('linkedom'),{patchMarkup}=await import('../dist/dom-patch.js'),{document}=parseHTML('<div id="root"></div>');const prior=globalThis.document;globalThis.document=document;try{const root=document.getElementById('root');patchMarkup(root,'<p>1 SEC</p><button data-task="deploy">DEPLOY</button>');const button=root.querySelector('button');let clicks=0;button.addEventListener('click',()=>clicks++);patchMarkup(root,'<p>2 SEC</p><button data-task="deploy">DEPLOY</button>');assert.equal(root.querySelector('button'),button);button.click();assert.equal(clicks,1);assert.equal(root.querySelector('p').textContent,'2 SEC');}finally{globalThis.document=prior;}
});
