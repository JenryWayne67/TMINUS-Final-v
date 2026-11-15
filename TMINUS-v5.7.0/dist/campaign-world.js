import {getPreferences} from './preferences.js';
import * as THREE from './vendor/three.module.js';
import {loadShipInterior,loadGLB} from './asset-loader.js';
import {createWalker,stepWalker,roomAt,cameraNavFraction,EYE_HEIGHT} from './ship-walk-core.js';
import {dressShip} from './campaign-dressing.js';
import {createCampaignCrew} from './campaign-crew.js';
import {attachSkin} from './characters.js';
import {stateFor} from './locomotion.js';

// A campaign owns its renderer and input lifecycle. Existing competitive state stays suspended.
export async function createCampaignWorld(canvas, callbacks={}) {
 const [nav,layout,gltf]=await Promise.all([
  fetch('./assets/ship/ship_nav.json').then(r=>{if(!r.ok)throw Error('Navigation data unavailable');return r.json();}),
  fetch('./assets/ship/ship_interior.scene.json').then(r=>{if(!r.ok)throw Error('Ship layout unavailable');return r.json();}),loadShipInterior()
 ]);
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#081321');
 const camera=new THREE.PerspectiveCamera(70,1,.05,2000);
 scene.add(new THREE.HemisphereLight('#e1f7ff','#354054',0.85));
 const sun=new THREE.DirectionalLight('#fff0cf',0.9);sun.position.set(-20,35,-30);sun.target.position.set(0,1,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
 Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:.5,far:130});sun.shadow.normalBias=.012;scene.add(sun,sun.target);
 const interior=new THREE.Group();scene.add(interior);interior.add(gltf.scene.clone(true));interior.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true;}});
 // Source walls are pure white; tint per-instance copies to a cabin grey so lights shape the room instead of washing it out.
 interior.traverse(o=>{if(o.isMesh&&o.material){o.material=[o.material].flat().map(m=>{const c=m.clone();if(c.color)c.color.multiplyScalar(.62);return c;});if(o.material.length===1)o.material=o.material[0];}});
 // Each module is dressed as a working room (deck, ribs, ceiling lights, furniture, hatch frames, signs) with its own
 // balanced lighting, instead of one over-bright light in an empty box.
 const ownedGeometries=[],ownedMaterials=[];
 dressShip(interior,layout,{owned:ownedGeometries,ownedMaterials});
 function box(parent,size,pos,color){const g=new THREE.BoxGeometry(...size),m=new THREE.MeshStandardMaterial({color,roughness:.7});ownedGeometries.push(g);ownedMaterials.push(m);const mesh=new THREE.Mesh(g,m);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 const avatar=new THREE.Group();scene.add(avatar);
 const avatarLegs=[],avatarArms=[];
 const footShadow=new THREE.Mesh(new THREE.CircleGeometry(.41,20),new THREE.MeshBasicMaterial({color:'#06121a',transparent:true,opacity:.23,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
 footShadow.rotation.x=-Math.PI/2;footShadow.position.y=.012;avatar.add(footShadow);
 ownedGeometries.push(footShadow.geometry);ownedMaterials.push(footShadow.material);box(avatar,[.48,.65,.32],[0,1.05,0],'#e6ede8');box(avatar,[.35,.38,.38],[0,1.58,0],'#e6ede8');box(avatar,[.29,.18,.04],[0,1.59,.21],'#142b38');box(avatar,[.35,.4,.18],[0,1.06,-.23],'#43bfb0');
 for(const sign of [-1,1]){
  const shoulder=new THREE.Group();shoulder.position.set(sign*.34,1.30,0);avatar.add(shoulder);
  box(shoulder,[.16,.55,.18],[0,-.28,0],'#e6ede8');avatarArms.push(shoulder);
  const hip=new THREE.Group();hip.position.set(sign*.14,.48,0);avatar.add(hip);
  box(hip,[.18,.48,.2],[0,-.24,0],'#e6ede8');avatarLegs.push(hip);
 }
 avatar.visible=false;
 // Player wears the same rigged crew character as everywhere else (Finn the frog); boxes stay as the loading fallback.
 const avatarBody=new THREE.Group();for(const c of [...avatar.children])if(c!==footShadow)avatarBody.add(c);avatar.add(avatarBody);
 const avatarRig={group:avatar,body:avatarBody};attachSkin(avatarRig,0,{height:1.9}).catch(()=>{});
 let crouch=false;
 const stations={};
 for(const room of layout.modules){const node=new THREE.Group();node.position.set(room.center[0]+.9,0,room.zmin+1.1);interior.add(node);box(node,[.45,.8,.4],[0,.4,0],'#263a48');const screen=box(node,[.39,.23,.04],[0,.82,-.2],'#4ee5c1');screen.material.emissive.set('#4ee5c1');screen.material.emissiveIntensity=.5;stations[room.name]=node;}
 // Role bots share the cabin: they walk between their room consoles and pick up faults and preparation work.
 const crew=createCampaignCrew(interior,layout,{getState:()=>callbacks.getState?.(),crewAct:(id,who)=>callbacks.crewAct?.(id,who),playerPosition:()=>({x:walker.x,z:walker.z})});
 // Starfield, Earth, ship airlock and a serviceable telescope for the EVA mission.
 const exterior=new THREE.Group();scene.add(exterior);exterior.visible=false;
 const earthGeo=new THREE.IcosahedronGeometry(130,3),earthMat=new THREE.MeshStandardMaterial({color:'#286baf',roughness:1,flatShading:true});ownedGeometries.push(earthGeo);ownedMaterials.push(earthMat);const earth=new THREE.Mesh(earthGeo,earthMat);earth.position.set(0,-190,-110);scene.add(earth);
 for(let i=0;i<65;i++){const a=i*2.39996,r=Math.sqrt(i/65)*110;box(earth,[14+(i%5)*3,2,7], [Math.cos(a)*r,Math.sqrt(Math.max(0,130*130-r*r)),Math.sin(a)*r],i%3?'#4eaa9a':'#d6ecdf');}
 const stars=new THREE.BufferGeometry(),vertices=[];for(let i=0;i<550;i++){const a=i*2.39996,z=1-2*(i+.5)/550,r=Math.sqrt(1-z*z);vertices.push(Math.cos(a)*r*650,z*650,Math.sin(a)*r*650);}stars.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const starMat=new THREE.PointsMaterial({color:'#d9e5f4',size:1.3,sizeAttenuation:false});scene.add(new THREE.Points(stars,starMat));ownedGeometries.push(stars);ownedMaterials.push(starMat);
 if(callbacks.ship){const ship=callbacks.ship.clone(true);ship.position.set(0,0,1);ship.rotation.set(0,0,0);ship.scale.setScalar(.25);ship.visible=true;ship.traverse(o=>{if(o.isMesh){const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const n=m.clone();n.transparent=false;n.opacity=1;ownedMaterials.push(n);return n;});o.material=Array.isArray(o.material)?materials:materials[0];}});exterior.add(ship);}else box(exterior,[6,4,9],[0,0,1],'#e2e8e3');
 box(exterior,[2,2,.18],[0,0,-3.6],'#365463');
 const telescope=new THREE.Group();telescope.position.set(0,0,-17);exterior.add(telescope);
 const telescopeFallback=new THREE.Group();telescope.add(telescopeFallback);
 box(telescopeFallback,[3,3,6],[0,0,0],'#c7ced1');box(telescopeFallback,[2.8,2.8,.12],[0,0,-3.1],'#172736');box(telescopeFallback,[1.1,.8,.2],[0,0,3.12],'#f1bc69');
 for(const sign of [-1,1]){box(telescopeFallback,[7,.1,3],[sign*5,0,0],'#2c5581');for(let j=0;j<6;j++)box(telescopeFallback,[.03,.13,3],[sign*5-3+j,0,0],'#7eacc3');}
 const tetherPositions=new Float32Array(6),tetherGeo=new THREE.BufferGeometry();tetherGeo.setAttribute('position',new THREE.BufferAttribute(tetherPositions,3));const tetherMat=new THREE.LineBasicMaterial({color:'#ffb458'});const tether=new THREE.Line(tetherGeo,tetherMat);tether.frustumCulled=false;exterior.add(tether);ownedGeometries.push(tetherGeo);ownedMaterials.push(tetherMat);
 const beacon=box(exterior,[.4,.4,.4],[0,0,-13.5],'#5ce8c5');beacon.material.emissive.set('#5ce8c5');beacon.material.emissiveIntensity=1;
 // Prop loads do not block entry; the primary ship and navigation data are required.
 let disposed=false;
 // Keep the gameplay beacon and interaction distance fixed; only the visual is replaced.
 loadGLB('./assets/nasa/hubble-space-telescope-a.glb').then(g=>{
  if(disposed)return;
  const model=g.scene.clone(true),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length())||size.length()===0)return;
  model.scale.setScalar(6/Math.max(size.x,size.y,size.z));
  bounds.setFromObject(model);model.position.sub(bounds.getCenter(new THREE.Vector3()));
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  telescope.add(model);telescopeFallback.visible=false;
 }).catch(()=>{});
 Promise.all(layout.props.map(async p=>{try{const g=await loadGLB('./assets/props/'+p.asset.split('/').pop());if(disposed)return;const m=g.scene.clone(true);m.position.set(...p.position);m.rotation.y=THREE.MathUtils.degToRad(p.rotation_y_deg||0);interior.add(m);}catch{}}));
 let walker=createWalker(nav,layout,'cockpit'),eva=false,first=false,paused=false,lastRoom='',dragging=false,near=false,walkPhase=0,walkDistance=0,prevWalk={x:walker.x,z:walker.z},walkSpeed=0;
 const float={x:0,y:0,z:-5};const keys=new Set();
 const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};resize();addEventListener('resize',resize);
 function key(e,down){if(callbacks.isBlocked?.())return;const k=e.key.toLowerCase();if(['input','select','textarea','button'].includes(document.activeElement?.tagName?.toLowerCase())&&k!=='escape')return;if(['w','a','s','d','shift',' ','control','arrowleft','arrowright'].includes(k)){e.preventDefault();if(down)keys.add(k);else keys.delete(k);}if(down&&!e.repeat&&k==='e')callbacks.interact?.();if(down&&!e.repeat&&k==='v')first=!first;if(down&&!e.repeat&&k==='c')crouch=!crouch;}
 const kd=e=>key(e,true),ku=e=>key(e,false);addEventListener('keydown',kd,true);addEventListener('keyup',ku,true);
 const mouse=e=>{if(paused||callbacks.isBlocked?.()||document.pointerLockElement!==canvas&&!dragging)return;walker.yaw-=e.movementX*.0025*getPreferences().sensitivity;walker.pitch=Math.max(-1.1,Math.min(1.1,walker.pitch-e.movementY*.0025*getPreferences().sensitivity*(getPreferences().invertY?-1:1)));};
 const down=()=>{if(paused||callbacks.isBlocked?.())return;dragging=true;canvas.focus();try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}};
 const up=()=>dragging=false;canvas.addEventListener('mousedown',down);addEventListener('mouseup',up);addEventListener('mousemove',mouse);
 const clear=()=>{keys.clear();dragging=false;};addEventListener('blur',clear);
 function context(){return {room:eva?(Math.hypot(float.x,float.y,float.z+5)<3?'airlock':'exterior'):roomAt(nav,walker.x,walker.z)||lastRoom,near:eva?true:near,atTelescope:eva&&Math.hypot(float.x,float.y,float.z+13.5)<3,atAirlock:eva&&Math.hypot(float.x,float.y,float.z+5)<3};}
 function tick(dt){if(disposed)return;dt=Math.min(dt,.05);const sequence=['launch','reentry'].includes(callbacks.getPhase?.());const blocked=paused||callbacks.isBlocked?.()||sequence;
  if(!blocked){walker.yaw+=((keys.has('arrowleft')?1:0)-(keys.has('arrowright')?1:0))*dt*1.6;
   const forward=(keys.has('w')?1:0)-(keys.has('s')?1:0),strafe=(keys.has('d')?1:0)-(keys.has('a')?1:0);
   if(eva){const speed=keys.has('shift')?3.4:2.1;float.x+=(Math.sin(walker.yaw)*forward-Math.cos(walker.yaw)*strafe)*speed*dt;float.z+=(Math.cos(walker.yaw)*forward+Math.sin(walker.yaw)*strafe)*speed*dt;float.y+=((keys.has(' ')?1:0)-(keys.has('control')?1:0))*speed*dt;const delta=new THREE.Vector3(float.x,float.y,float.z+5);if(delta.length()>16){delta.setLength(16);float.x=delta.x;float.y=delta.y;float.z=delta.z-5;}}
   else {
    // Immediate stop on key release; no phantom movement after browser focus changes.
    stepWalker(walker,nav,dt,{forward:crouch?forward*.55:forward,strafe:crouch?strafe*.55:strafe,run:keys.has('shift')&&!crouch});
   }
  }
  const p=eva?new THREE.Vector3(float.x,float.y,float.z):new THREE.Vector3(walker.x,0,walker.z);
  const dir=new THREE.Vector3(Math.sin(walker.yaw)*Math.cos(walker.pitch),Math.sin(walker.pitch),Math.cos(walker.yaw)*Math.cos(walker.pitch));
  avatar.position.copy(p);avatar.rotation.y=walker.yaw;avatar.visible=!first;avatar.rotation.z=eva?.12:0;
  const walked=eva?0:Math.hypot(walker.x-prevWalk.x,walker.z-prevWalk.z);
  prevWalk.x=walker.x;prevWalk.z=walker.z;
  walkSpeed+=(Math.min(5,dt>0?walked/dt:0)-walkSpeed)*(1-Math.exp(-12*dt));
  walkDistance+=walked;walkPhase+=walked*7;
  const weight=eva?0:Math.min(1,walkSpeed/2.8);
  avatarLegs.forEach((leg,i)=>leg.rotation.x=Math.sin(walkPhase+i*Math.PI)*.30*weight);
  avatarArms.forEach((arm,i)=>arm.rotation.x=Math.sin(walkPhase+i*Math.PI)*-.22*weight);
  if(avatarRig.skin){const sk=avatarRig.skin;sk.setState(eva?'idle':stateFor(walkSpeed*1.6,{crouch}),walkSpeed*1.6);sk.mixer.update(dt);sk.ground?.(dt,{grounded:!eva,speed:walkSpeed,floorAt:()=>0});sk.setLook?.(0,first?0:-walker.pitch*.6);}
  if(!eva)crew.tick(dt,camera);
  footShadow.visible=!eva;
  footShadow.material.opacity=.23*(1-.22*weight);
  const eye=p.clone().add(new THREE.Vector3(0,crouch&&!eva?EYE_HEIGHT-.6:EYE_HEIGHT,0));const offset=first?0:eva?3:crouch?1.9:2.4;
  const targetCamera=eye.clone().addScaledVector(dir,-offset);targetCamera.y+=first?0:.42;
  if(!eva&&!first){
    const t=cameraNavFraction(nav,walker.x,walker.z,targetCamera.x,targetCamera.z);
    targetCamera.lerpVectors(eye,targetCamera,t);
  }
  // Smooth only third-person framing. First-person movement must remain immediate.
  if(first||camera.position.distanceTo(targetCamera)>8)camera.position.copy(targetCamera);
  else camera.position.lerp(targetCamera,1-Math.exp(-dt*18));
  if(!eva&&!first){
    const t=cameraNavFraction(nav,walker.x,walker.z,camera.position.x,camera.position.z);
    if(t<1)camera.position.lerpVectors(eye,camera.position,t);
  }
  camera.lookAt(eye.clone().addScaledVector(dir,8));
  if(!eva){lastRoom=roomAt(nav,walker.x,walker.z)||lastRoom;const station=stations[lastRoom];near=!!station&&Math.hypot(walker.x-station.position.x,walker.z-station.position.z)<2.35;}
  tetherPositions[0]=0;tetherPositions[1]=0;tetherPositions[2]=-4;tetherPositions[3]=p.x;tetherPositions[4]=p.y+1;tetherPositions[5]=p.z;tetherGeo.attributes.position.needsUpdate=true;beacon.rotation.y+=dt;earth.rotation.y+=dt*.002;
  if(sequence){interior.visible=false;exterior.visible=true;avatar.visible=false;beacon.visible=false;telescope.visible=false;tether.visible=false;const t=performance.now()*.00012;camera.position.set(12*Math.cos(t),7,12*Math.sin(t));camera.lookAt(0,0,1);}else{interior.visible=!eva;exterior.visible=eva;beacon.visible=true;telescope.visible=true;tether.visible=true;}
  callbacks.onContext?.(context());renderer.render(scene,camera);
 }
 function setEVA(value){if(value===eva)return;eva=value;interior.visible=!eva;exterior.visible=eva;lastRoom='';if(eva){float.x=0;float.y=0;float.z=-5;walker.yaw=Math.PI;walker.pitch=0;}else walker=createWalker(nav,layout,'airlock');prevWalk={x:walker.x,z:walker.z};walkSpeed=0;walkPhase=0;clear();}
 return {tick,context,setEVA,get crew(){return crew;},get crouch(){return crouch;},get eva(){return eva;},setPaused(value){paused=value;if(value){clear();if(document.pointerLockElement===canvas)document.exitPointerLock?.();}},get room(){return context().room;},get position(){return eva?{...float}:{x:walker.x,z:walker.z};},setPosition(p){if(eva)Object.assign(float,p);else Object.assign(walker,p);prevWalk={x:walker.x,z:walker.z};walkSpeed=0;},dispose(){disposed=true;clear();crew.dispose();avatarRig.skin?.dispose();removeEventListener('resize',resize);removeEventListener('keydown',kd,true);removeEventListener('keyup',ku,true);removeEventListener('mouseup',up);removeEventListener('mousemove',mouse);removeEventListener('blur',clear);canvas.removeEventListener('mousedown',down);if(document.pointerLockElement===canvas)document.exitPointerLock?.();ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());renderer.dispose();}};
}
