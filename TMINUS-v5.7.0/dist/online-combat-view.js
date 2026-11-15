// Presentation only. Ammo, hits, health and projectile motion come from snapshots.
import * as THREE from './vendor/three.module.js';
import * as FPS from './fps-core.js';
import {createFpsView,createSfx} from './fps-view.js';
import {getPreferences} from './preferences.js';
import {disposeDetachedTree} from './resource-lifecycle.js';
import {scanFraction} from './science-match.js';
export function createOnlineCombatView(camera,scene){
 const sfx=createSfx(()=>!getPreferences().audioEnabled),view=createFpsView({camera,scene,sfx}),seen=new Set(),grenades=new Map(),tether=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#c7d8ee'}));scene.add(tether);tether.visible=false;
 view.loadModels();let soundLoaded=false,priorHealth=160;
 return {sfx,update(snapshot,player,{dt,yaw,pitch,viewMode,ads,crouch,base,ship,objective}){
  const m=snapshot.missions[player.team],surface=m.phase==='surface',p=getPreferences();if(p.audioEnabled&&!soundLoaded){soundLoaded=true;sfx.load();}
  const l=player.loadout||FPS.createLoadout(),v=player.vitals||FPS.createVitals(),moving=Math.hypot(player.x-(this.lastX??player.x),player.z-(this.lastZ??player.z))>.001,speed=moving?6:0;this.lastX=player.x;this.lastZ=player.z;
  view.setVisible(surface);view.root.visible=surface&&(viewMode==='first'||ads);
  if(surface){const fov=view.update({loadout:l,dt,ads,sprinting:false,crouch,moving,speed,look:{yaw,pitch},carrying:player.carry!==null});if(fov){camera.fov=fov.fov;camera.updateProjectionMatrix();}}
  else view.update({loadout:l,dt,ads:false,sprinting:false,crouch:false,moving:false,speed:0,look:{yaw,pitch},carrying:false});
  view.updateHud({visible:surface,loadout:l,vitals:v,spread:FPS.spreadAngle(l,{ads,moving,crouch}),ads,crouch,sprinting:false,cursor:document.pointerLockElement===null,capture:objective?.target?.type==='scan'?{frac:scanFraction(snapshot.flags[Number(objective.target.id)]),label:'HOLD E · '+Math.round(scanFraction(snapshot.flags[Number(objective.target.id)])*100)+'%'}:null,carrying:player.carry!==null});
  const health=v.health+v.shield;if(surface&&health<priorHealth)sfx.play('shield_hit',{volume:.4});priorHealth=health;
  for(const event of snapshot.combatEvents||[]){if(seen.has(event.id))continue;seen.add(event.id);if(snapshot.time-event.time>1.5)continue;
   if(event.type==='shot'&&surface){const from=new THREE.Vector3(...event.origin),to=from.clone().addScaledVector(new THREE.Vector3(...event.direction),FPS.WEAPONS[event.weapon].range);if(event.attacker===player.id)view.onFire(event.weapon,FPS.WEAPONS[event.weapon].recoil.pitch);view.tracer(from,to);}
   if(event.type==='hit'&&surface&&event.attacker===player.id)view.hitMarker(event.kill);
   if(event.type==='explosion'&&surface)view.explosion(new THREE.Vector3(...event.pos));
   if(event.type==='turret-shot'&&m.phase==='flight'){const from=new THREE.Vector3(...event.origin),to=from.clone().addScaledVector(new THREE.Vector3(...event.direction),75);view.tracer(from,to,'#a4dcf3');if(event.attacker===player.id)sfx.play('shot_carbine',{volume:.3});}
  }
  if(seen.size>100)for(const k of [...seen].slice(0,seen.size-50))seen.delete(k);
  const ids=new Set();for(const g of snapshot.grenades||[]){ids.add(g.id);let object=grenades.get(g.id);if(!object){object=view.spawnGrenadeMesh();grenades.set(g.id,object);}object.visible=surface;object.position.fromArray(g.pos);}
  for(const [id,object]of grenades)if(!ids.has(id)){object.removeFromParent();disposeDetachedTree(object,r=>r.userData?.tminusAssetShared);grenades.delete(id);}
  tether.visible=!!player.eva;if(player.eva){const points=tether.geometry.attributes.position;points.setXYZ(0,base.x+player.x,player.y+1,base.z+player.z);points.setXYZ(1,base.x+ship.x+5.94,ship.y+5,base.z+ship.z-2.16);points.needsUpdate=true;}
 },dispose(){view.setVisible(false);tether.removeFromParent();tether.geometry.dispose();tether.material.dispose();for(const m of grenades.values()){m.removeFromParent();disposeDetachedTree(m,r=>r.userData?.tminusAssetShared);}}};
}
