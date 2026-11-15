import {createSpacecraft} from './spacecraft-model.js';
import {SHIP_SCALE,SHIP_Y,RACKS,CARGO_SPOTS} from './ship-scale.js';
import * as THREE from './vendor/three.module.js';
import {sampleTerrainTriangleHeight} from './terrain-height.js';
export {THREE};
export const canvas=document.querySelector('#scene');
export let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){document.querySelector('#loading').style.display='none';document.querySelector('#webgl-error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
export const scene=new THREE.Scene();scene.background=new THREE.Color('#20182e');scene.fog=new THREE.FogExp2('#241b35',.012);
export const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,450);camera.position.set(29,33,36);camera.lookAt(0,0,0);
const hemi=new THREE.HemisphereLight('#e4d8ff','#3b254c',2.6);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffddce',3.6);sun.position.set(-25,35,-18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:100});sun.shadow.normalBias=.014;sun.shadow.bias=-.0002;scene.add(sun);
const fill=new THREE.DirectionalLight('#9e82fa',2);fill.position.set(20,10,20);scene.add(fill);
const geoCache={},matCache={};
export const colors=['#b7a0f3','#9cdeb1','#ed919d','#edbd81'];
const resourceCache=new WeakSet();
export function isCachedResource(object){return !!object&&resourceCache.has(object);}
const toonRamp=new THREE.DataTexture(new Uint8Array([70,135,200,255]),4,1,THREE.RedFormat);toonRamp.minFilter=THREE.NearestFilter;toonRamp.magFilter=THREE.NearestFilter;toonRamp.needsUpdate=true;
export function material(c,metal=.1,rough=.7,emissive=false){const key=[c,metal,rough,emissive].join();const existing=matCache[key];if(existing)return existing;const created=new THREE.MeshToonMaterial({color:c,gradientMap:toonRamp,emissive:emissive?c:'#000',emissiveIntensity:emissive?.65:0});resourceCache.add(created);return matCache[key]=created;}
export function mesh(g,m,parent=scene,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
export function box(w,h,d,c,parent=scene,x=0,y=0,z=0,metal=.1){const key=`b${w},${h},${d}`;let geo=geoCache[key];if(!geo){geo=new THREE.BoxGeometry(w,h,d);resourceCache.add(geo);geoCache[key]=geo;}return mesh(geo,material(c,metal),parent,x,y,z);}
export function sphere(r,c,parent=scene,x=0,y=0,z=0,detail=16){const key=`s${r},${detail}`;let geo=geoCache[key];if(!geo){geo=new THREE.SphereGeometry(r,detail,12);resourceCache.add(geo);geoCache[key]=geo;}return mesh(geo,material(c,.25,.5),parent,x,y,z);}
export function cylinder(rt,rb,h,c,parent=scene,x=0,y=0,z=0,n=32){const key=`c${rt},${rb},${h},${n}`;let geo=geoCache[key];if(!geo){geo=new THREE.CylinderGeometry(rt,rb,h,n);resourceCache.add(geo);geoCache[key]=geo;}return mesh(geo,material(c,.35,.55),parent,x,y,z);}
export function glow(w,h,d,c,parent=scene,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),material(c,.2,.4,true),parent,x,y,z);}
export function ring(r,width,c,parent=scene,y=.06){const o=mesh(new THREE.RingGeometry(r-width,r,96),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.75,side:THREE.DoubleSide}),parent,0,y,0);o.rotation.x=-Math.PI/2;o.castShadow=false;return o;}
let seed=724;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const PLATFORM_CENTERS=[[0,0],[-60,-44],[60,-44],[0,-92]];
export const ground=new THREE.Group();scene.add(ground);
const terrainGeo=new THREE.PlaneGeometry(200,200,90,90);terrainGeo.rotateX(-Math.PI/2);const pos=terrainGeo.attributes.position;const tcols=[];const c=new THREE.Color();for(let i=0;i<pos.count;i++){let x=pos.getX(i),z=pos.getZ(i);let d=Math.min(...PLATFORM_CENTERS.map(([px,pz])=>Math.hypot(x-px,z-pz)));let h=(Math.abs(x)<50&&z>-40&&z<45)?-.11:d<28?-.23:Math.sin(x*.12)*Math.cos(z*.1)*1.4+(rand()-.5)*Math.min(3,(d-28)*.15)-.4;pos.setY(i,h);c.setHSL(.37+rand()*.035,.19+rand()*.05,.3+rand()*.065);tcols.push(c.r,c.g,c.b);}terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(tcols,3));terrainGeo.computeVertexNormals();const terrainSurface=mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),ground);
// Sample the same indexed triangles that are rendered. O(1) per actor; avoids per-frame raycasts.
export function floorHeightAt(x,z){
 const radius=Math.min(...PLATFORM_CENTERS.map(([px,pz])=>Math.hypot(x-px,z-pz)));
 // Foot contact on the two-level spaceport deck; otherwise use rendered terrain triangles.
 if(radius<=7.8*SHIP_SCALE)return .22;
 if(radius<=8.1*SHIP_SCALE)return .145;
 return sampleTerrainTriangleHeight(pos,x,z,200,90);
}

// Static terrain decorations: instanced batches preserve positions and palette while
// reducing 153 individual draw calls to four. Collision uses independent CPU shapes.
const rockGeometry=new THREE.IcosahedronGeometry(1,0);
const rockColors=['#64746b','#73817a','#52645f'];
const rockBatches=rockColors.map((color,i)=>{
 const count=Math.floor((124-i)/3)+1;
 const batch=new THREE.InstancedMesh(rockGeometry,material(color,0,1),count);
 batch.castShadow=true;batch.receiveShadow=true;batch.frustumCulled=false;
 ground.add(batch);return batch;
});
export const terrainRockColliders=[];
const instance=new THREE.Object3D(),rockVertex=new THREE.Vector3();
for(let i=0;i<125;i++){
 const a=rand()*Math.PI*2,d=34+rand()*62;
 instance.position.set(Math.cos(a)*d,0,Math.sin(a)*d);
 let scale=.2+rand()*1.8;if(d>35)scale*=2.5;
 instance.scale.set(scale*1.5,scale*.7,scale);
 instance.rotation.set(rand(),rand()*6,rand());instance.updateMatrix();
 let lowest=Infinity,radius=0;const vertices=rockGeometry.attributes.position;
 for(let v=0;v<vertices.count;v++){rockVertex.fromBufferAttribute(vertices,v).applyMatrix4(instance.matrix);lowest=Math.min(lowest,rockVertex.y);radius=Math.max(radius,Math.hypot(rockVertex.x-instance.position.x,rockVertex.z-instance.position.z));}
 // Keep assembly racks, supplies and rival pads physically clear of scenery.
 const reserved=[...RACKS,...CARGO_SPOTS,[-38,16]];
 for(let tries=0;tries<24&&(reserved.some(([x,z])=>Math.hypot(instance.position.x-x,instance.position.z-z)<radius+8)||PLATFORM_CENTERS.some(([x,z])=>Math.hypot(instance.position.x-x,instance.position.z-z)<radius+30));tries++){
  const angle=a+(tries+1)*2.399963,distance=58+rand()*38;
  instance.position.x=Math.cos(angle)*distance;instance.position.z=Math.sin(angle)*distance;
 }
 instance.position.y=floorHeightAt(instance.position.x,instance.position.z)-lowest;instance.updateMatrix();
 terrainRockColliders.push({x:instance.position.x,z:instance.position.z,r:radius*.9});
 rockBatches[i%3].setMatrixAt(Math.floor(i/3),instance.matrix);
}
for(const b of rockBatches)b.instanceMatrix.needsUpdate=true;
const distantGeometry=new THREE.ConeGeometry(1,1,5,1);
const distantBatch=new THREE.InstancedMesh(distantGeometry,material('#687d73',0,1),28);
distantBatch.castShadow=true;distantBatch.receiveShadow=true;distantBatch.frustumCulled=false;
ground.add(distantBatch);
for(let i=0;i<28;i++){
 const a=i/28*Math.PI*2,r=9+rand()*9,h=8+rand()*17;
 instance.position.set(Math.cos(a)*150,2,Math.sin(a)*150);
 instance.rotation.set(0,rand()*6,0);instance.scale.set(r,h,r);
 instance.updateMatrix();distantBatch.setMatrixAt(i,instance.matrix);
}
distantBatch.instanceMatrix.needsUpdate=true;
export const terrainBatchCount=rockBatches.length+1;
// Distant ringed world and a soft star field.
const starPositions=[];for(let i=0;i<1700;i++){let v=new THREE.Vector3((rand()-.5)*2,rand()*.9+.1,(rand()-.5)*2).normalize().multiplyScalar(180);starPositions.push(v.x,v.y,v.z);}const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));const stars=new THREE.Points(sg,new THREE.PointsMaterial({color:'#eee3ff',size:.21,transparent:true,opacity:.7,sizeAttenuation:true,fog:false}));scene.add(stars);
const planet=new THREE.Group();planet.position.set(-40,40,-100);scene.add(planet);
const pg=new THREE.SphereGeometry(19,64,48);const pm=new THREE.ShaderMaterial({uniforms:{base:{value:new THREE.Color('#bd849e')},lightDir:{value:new THREE.Vector3(-1,1,1).normalize()}},vertexShader:`varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vP;varying vec3 vN;uniform vec3 base;uniform vec3 lightDir;void main(){float band=sin(vP.y*.7+sin(vP.x*.3)*1.3)*.045+sin(vP.y*2.)*.016;float light=max(.15,dot(normalize(vN),lightDir));vec3 color=base*(.65+light*.55)+band;gl_FragColor=vec4(color,1.);}`});mesh(pg,pm,planet);
const pr=mesh(new THREE.RingGeometry(25,37,128),new THREE.MeshBasicMaterial({color:'#cfafcb',transparent:true,opacity:.2,side:THREE.DoubleSide,fog:false}),planet);pr.rotation.x=1.25;pr.rotation.y=.25;
export const base=new THREE.Group();scene.add(base);
const padG=new THREE.Group();padG.scale.set(SHIP_SCALE,1,SHIP_SCALE);base.add(padG);const pad=cylinder(8.1,8.5,.45,'#363342',padG,0,-.08,0,64);cylinder(7.8,7.8,.08,'#4b4656',padG,0,.18,0,64);ring(7.5,.07,'#b9a5dd',padG,.24);ring(6,.035,'#aaa0bb',padG,.24);ring(3.6,.055,'#82748d',padG,.24);
for(let i=0;i<32;i++){const a=i/32*Math.PI*2;const o=box(.12,.025,.55,'#c4b6ca',padG,Math.sin(a)*7,.235,Math.cos(a)*7);o.rotation.y=a;}
for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const l=glow(.18,.07,.5,'#b7a2e9',padG,Math.sin(a)*7.95,.2,Math.cos(a)*7.95);l.rotation.y=a;}
// Painted access paths and landing guidance.
for(let s of [-1,1])for(let i=0;i<9;i++)box(.08,.015,.75,'#82798e',base,s*2.5,-.08,8.7+i*1.35);
for(let i=0;i<3;i++){box(4.5,.02,.09,'#b4a6bd',base,0,-.07,11.5+i*1.3);}
export const {ship,engineFlames}=createSpacecraft({THREE,SHIP_SCALE,SHIP_Y,cylinder,sphere,box,mesh,material,glow},base);
// Modular work stations.
export const stationPositions=RACKS;
export const stations=stationPositions.map(([x,z],i)=>{const group=new THREE.Group();group.position.set(x,0,z);base.add(group);cylinder(1.5,1.7,.22,'#3e374d',group,0,0,0,8);ring(2.1,.04,colors[i],group,.035);box(1.65,.95,1.3,'#676073',group,0,.57,0,.4);box(1.75,.1,1.4,'#a4a0af',group,0,1.08,0,.6);const screen=box(1.16,.08,.72,'#2d263e',group,0,1.17,-.08);screen.rotation.x=.3;const panel=glow(.9,.014,.41,colors[i],group,0,1.225,-.04);panel.rotation.x=.3;for(let k=0;k<3;k++)glow(.06,.2,.025,colors[i],group,-.55+k*.15,.7,.66);box(.12,1.9,.12,'#7c6f89',group,1.03,1,0);const lamp=sphere(.14,colors[i],group,1.03,2,0);lamp.material=material(colors[i],.1,.5,true);const part=new THREE.Group();part.position.set(-.5,1.8,-.3);group.add(part);if(i===0){box(.75,.15,1.3,'#b7b3c8',part);box(.5,.1,.9,colors[i],part,0,.1,0);}else if(i===1){cylinder(.35,.35,.8,'#616572',part);ring(.48,.08,colors[i],part,.42);}else if(i===2){box(.65,.4,.65,'#a5a1b1',part);cylinder(.04,.04,1.1,'#a5a1b1',part,0,.5,0);const dish=mesh(new THREE.SphereGeometry(.43,12,8,0,Math.PI*2,0,Math.PI/2),material('#c4bfd3',.6),part,0,1,0);dish.rotation.z=.5;}else{cylinder(.32,.32,1,'#bd9a7b',part);box(.65,.16,.65,'#494454',part,0,.3,0);}
return {group,part,index:i,progress:0,done:false};});
// Cargo, lamp posts, and outpost details.
export const obstacles=[];
for(let i=0;i<9;i++){let x=i<5?-38-(i%2)*1.3:38+(i%2)*1.2,z=i<5?-4+i*2:-7+(i-5)*2;box(1.2,.9,1.1,i%2?'#756177':'#686177',base,x,.35,z);box(1.3,.09,1.2,'#9e8b9e',base,x,.84,z);box(.09,.94,1.15,'#33303e',base,x-.35,.37,z);obstacles.push({x,z,r:.9});}
for(const [x,z] of [[-42,-30],[41,-30],[-42,28],[41,28]]){cylinder(.07,.13,4.3,'#716477',base,x,2,z,8);box(.9,.13,.45,'#b5acb9',base,x,4.1,z);glow(.72,.04,.3,'#f2d9e9',base,x,4.04,z);const l=new THREE.PointLight('#d4b4fa',7,12,2);l.position.set(x,3.8,z);base.add(l);}
export function astronaut(i){const g=new THREE.Group();const col=colors[i];const torso=box(.57,.7,.35,'#d6d4df',g,0,1.05,0,.35);box(.45,.3,.12,col,g,0,1.17,.22);box(.42,.56,.25,'#5b546a',g,0,1.12,-.27);glow(.22,.06,.03,col,g,0,1.33,-.41);sphere(.37,'#e9e5ed',g,0,1.69,0,20);const visor=sphere(.3,'#242437',g,0,1.71,.16,20);visor.scale.set(1,.62,.75);visor.material=material('#26263a',.85,.15);glow(.3,.035,.025,col,g,0,1.73,.38);const legs=[],arms=[];for(let s of [-1,1]){const leg=new THREE.Group();leg.position.set(s*.16,.72,0);g.add(leg);box(.22,.52,.24,'#a8a1b7',leg,0,-.27,0);box(.25,.17,.36,'#423a51',leg,0,-.52,.07);legs.push(leg);const arm=new THREE.Group();arm.position.set(s*.4,1.35,0);g.add(arm);box(.19,.53,.23,'#b1aabd',arm,0,-.23,.06);box(.21,.16,.23,col,arm,0,-.48,.07);arms.push(arm);}const gun=box(.17,.19,.8,'#444052',g,.4,1.03,.52,.7);glow(.1,.04,.5,col,g,.4,1.13,.52);const selection=ring(.67,.035,col,g,.015);selection.visible=false;scene.add(g);return {group:g,legs,arms,selection,gun};}
export function enemyMesh(){const g=new THREE.Group();const body=mesh((geoCache.drone??=new THREE.IcosahedronGeometry(.65,1)),material('#51465f',.65,.5),g,0,0,0);body.scale.y=.65;for(let s of [-1,1]){box(.75,.12,.48,'#7b5b76',g,s*.68,0,0);const e=glow(.3,.05,.05,'#fa758e',g,s*.65,.04,.25);}const eye=sphere(.21,'#ff7b92',g,0,.05,.45);eye.material=material('#ff657c',0,.2,true);scene.add(g);return g;}
export const captureGroup=new THREE.Group();scene.add(captureGroup);captureGroup.visible=false;
export const beacons=[[-12,-9],[11,-6],[0,12]].map(([x,z],i)=>{const g=new THREE.Group();captureGroup.add(g);g.position.set(x,0,z);cylinder(1.7,2,.25,'#54445e',g,0,0,0,8);cylinder(.28,.55,2.2,'#8a788e',g,0,1,0,8);const core=sphere(.55,'#c8a1f8',g,0,2.45,0);core.material=material('#b49adc',.2,.5,true);const rg=ring(3,.04,'#b7a0f3',g,.04);const beam=mesh(new THREE.CylinderGeometry(.04,.04,9,8),new THREE.MeshBasicMaterial({color:'#d4b3ff',transparent:true,opacity:.45}),g,0,6,0);return {group:g,core,ring:rg,x,z,index:i,progress:0,done:false};});
export const effects=new THREE.Group();scene.add(effects);
export function setQuality(q){renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?2:q==='medium'?1.5:1));renderer.shadowMap.enabled=q!=='low';sun.shadow.mapSize.set(q==='high'?2048:1024,q==='high'?2048:1024);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}renderer.setSize(innerWidth,innerHeight);}
export function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);
