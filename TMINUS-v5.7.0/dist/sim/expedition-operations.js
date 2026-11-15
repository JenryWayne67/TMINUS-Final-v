// Combat and spacewalk operations share the original offline rules, owned by the server.
import * as FPS from '../fps-core.js';
import {createMotor,clearMotor,moveCharacter} from '../character-motor.js';
import {speedFor} from '../locomotion.js';
import {createSuit,EVA,advanceSpacewalk,moveSuit} from '../spacewalk-core.js';
import {movePlanar} from '../motion-physics.js';
import {SURFACE_ROCKS,baseFor,spaceBaseFor} from '../expedition-network.js';
import {removePanel,repairPanel,useSkill} from '../expedition-core.js';
import {recoverWreckFlag} from '../science-match.js';
export function ensureOperator(p){p.motor??=createMotor();p.loadout??=FPS.createLoadout();p.vitals??=FPS.createVitals();p.suit??=createSuit();p.y??=0;p.eva??=false;p.aimPitch??=0;}
export function recordCombat(room,event){room.combatSerial=(room.combatSerial||0)+1;(room.combatEvents??=[]).push({id:room.combatSerial,time:room.time,...event});if(room.combatEvents.length>32)room.combatEvents.shift();}
export function hitOperator(room,target,amount,attacker){
 ensureOperator(target);if(target.hp<=0)return false;
 const out=FPS.damage(target.vitals,room.missions[target.team].shield>0?amount*.25:amount);target.hp=target.vitals.health;
 if(out.health>0||out.shieldBroke)room.dropHeld(target);
 if(attacker){attacker.contribution+=Math.min(2,amount/12);recordCombat(room,{type:'hit',attacker:attacker.id,target:target.id,damage:out.health+out.shield,kill:out.died});}
 if(out.died){target.downs++;target.reviveAt=room.time+5;target.task=null;target.input={strafe:0,forward:0,buttons:0};clearMotor(target.motor);if(attacker){attacker.kills++;room.sendEvent(`${attacker.name} downed ${target.name}`,attacker.team);}}
 return true;
}
export function operatorAction(room,p,m){
 ensureOperator(p);const s=room.missions[p.team],surface=s.phase==='surface';
 if(m.op==='weapon')return {handled:true,ok:surface&&Number.isInteger(m.slot)&&m.slot>=0&&m.slot<3&&FPS.switchTo(p.loadout,m.slot),message:'Weapon selected'};
 if(m.op==='reload')return {handled:true,ok:surface&&FPS.startReload(p.loadout),message:'Reloading'};
 if(m.op==='grenade'){
  if(!surface||p.hp<=0)return {handled:true,error:'Grenades are available on Planet B'};
  const w=room.world(p),pitch=p.aimPitch,d=[Math.sin(p.aim)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(p.aim)*Math.cos(pitch)],g=FPS.throwGrenade(p.loadout,[w.x,(p.y||0)+1.5,w.z],d);
  if(!g)return {handled:true,error:'No grenades remaining'};
  g.id=room.tickNumber+'-'+p.id+'-'+p.loadout.grenades;g.owner=p.id;g.team=p.team;(room.grenades??=[]).push(g);recordCombat(room,{type:'grenade',attacker:p.id,pos:[...g.pos]});return {handled:true,ok:true,message:'Grenade thrown'};
 }
 if(m.op==='ability'){
  const valid=['q','alt','f'].includes(m.slot),allowed=valid&&useSkill(s,p.role,m.slot,p.team);
  if(allowed){if(p.role===3&&m.slot==='f')p.suit.oxygen=100;p.contribution++;recordCombat(room,{type:'ability',attacker:p.id,role:p.role,slot:m.slot});}
  return {handled:true,ok:!!allowed,error:allowed?undefined:'Ability is recharging',message:'Crew ability activated'};
 }
 if(m.op==='eva'){
  if(s.phase!=='flight'||p.role!==3)return {handled:true,error:'Raider exits through the flight airlock'};
  if(p.eva){const a={x:s.shipMotion.x+EVA.airlock.x,y:1.476+EVA.airlock.y,z:s.shipMotion.z+EVA.airlock.z};if(Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z)>4)return {handled:true,error:'Return to the illuminated airlock'};p.eva=false;p.x=2.4;p.z=5.5;p.y=0;clearMotor(p.motor);return {handled:true,ok:true,message:'Airlock sealed · crew aboard'};}
  p.eva=true;p.x=s.shipMotion.x+EVA.airlock.x;p.y=1.476+EVA.airlock.y;p.z=s.shipMotion.z+EVA.airlock.z;p.suit.vx=p.suit.vy=p.suit.vz=0;return {handled:true,ok:true,message:'Tether attached · suit oxygen active'};
 }
 if(m.op==='remove-panel'){
  const panel=s.panels.find(q=>q.id===m.panel),at=panel&&{x:s.shipMotion.x+panel.offset[0],y:1.476+panel.offset[1],z:s.shipMotion.z+panel.offset[2]};
  return {handled:true,ok:!!(p.eva&&panel&&Math.hypot(p.x-at.x,p.y+1-at.y,p.z-at.z)<3.5&&removePanel(s,panel.id,p.role)),message:'Damaged plate removed'};
 }
 if(m.op==='salvage'){
  if(s.phase!=='flight')return {handled:true,error:'Fly close to the cargo beacon'};
  const f=room.science.flags.find(f=>f.id===m.sample),b=spaceBaseFor(p.team),ship={x:b.x+s.shipMotion.x,z:b.z+s.shipMotion.z};
  const distance=f?Math.hypot(ship.x-f.position[0],ship.z-f.position[2]):Infinity;
  return {handled:true,ok:!!(f&&recoverWreckFlag(room.science,f.id,p.team,distance)),message:'Wreck cargo secured · deliver it on Planet A'};
 }
 return {handled:false};
}
export function operatorWork(room,p,task,dt){
 if(task.type!=='panel')return false;
 const s=room.missions[p.team],panel=s.panels.find(q=>q.id===task.id);
 if(p.eva&&panel&&Math.hypot(p.x-s.shipMotion.x-panel.offset[0],p.y+1-1.476-panel.offset[1],p.z-s.shipMotion.z-panel.offset[2])<3.5){const changed=repairPanel(s,panel.id,p.role,dt);if(changed)p.contribution+=dt;return changed;}
 return false;
}
export function advanceOperator(room,p,dt,stale){
 ensureOperator(p);const s=room.missions[p.team];FPS.tickLoadout(p.loadout,dt);FPS.tickVitals(p.vitals,dt);p.hp=p.vitals.health;
 if(stale){clearMotor(p.motor);p.suit.vx=p.suit.vy=p.suit.vz=0;}
 if(p.eva){
  const ship={x:s.shipMotion.x,y:1.476,z:s.shipMotion.z},next=advanceSpacewalk(p.suit,{x:p.x,y:p.y,z:p.z},{x:p.input.strafe,y:p.input.vertical||0,z:p.input.forward},ship,dt),safe=moveSuit({x:p.x,y:p.y,z:p.z},next,ship);Object.assign(p,safe);s.oxygenSuit=p.suit.oxygen;if(p.suit.oxygen<=0)hitOperator(room,p,dt*4);return;
 }
 const carrying=s.carry[p.role]?'heavy':room.science.flags.some(f=>f.state==='carried'&&f.owner===p.team&&f.carrier===p.role)?'light':'none';
 const c=room.colliders(p),speed=speedFor({sprint:!!(p.input.buttons&2),ads:p.input.ads,crouch:p.input.crouch,carrying,forward:true});
 const q=moveCharacter(p.motor,p,{x:p.input.strafe,z:p.input.forward,speed,jump:(!!(p.input.buttons&8)||!!p.jumpPressed)&&s.phase!=='flight'},dt,c.boxes,c.circles);
 p.x=Math.max(s.phase==='flight'?-5:-180,Math.min(s.phase==='flight'?5:180,q.x));p.z=Math.max(s.phase==='flight'?-7:-170,Math.min(s.phase==='flight'?7:170,q.z));p.y=q.y;
}
export function fireSurface(room,p){
 ensureOperator(p);const s=room.missions[p.team];if(s.phase!=='surface'||p.hp<=0)return;
 const weapon=FPS.currentWeapon(p.loadout);if(!weapon.auto&&!p.firePressed)return;
 const burst=FPS.fire(p.loadout,{ads:p.input.ads,crouch:p.input.crouch,sprint:!!(p.input.buttons&2),moving:Math.hypot(p.input.strafe,p.input.forward)>.1});if(!burst.ok)return;
 const a=room.world(p),origin=[a.x,p.y+1.5,a.z],forward=[Math.sin(p.aim)*Math.cos(p.aimPitch),-Math.sin(p.aimPitch),-Math.cos(p.aim)*Math.cos(p.aimPitch)];
 recordCombat(room,{type:'shot',attacker:p.id,weapon:weapon.id,origin,direction:forward});
 for(const shot of burst.shots){
  const direction=FPS.applySpread(forward,shot.yaw,shot.pitch),targets=[...room.players.values()].filter(q=>q.connected&&q.team!==p.team&&q.hp>0&&room.missions[q.team].phase==='surface').map(q=>{const at=room.world(q);return {id:q.id,center:[at.x,(q.y||0)+1.25,at.z],radius:.7};});
  const hit=FPS.firstHit(origin,direction,targets,weapon.range);if(!hit)continue;
  const target=room.players.get(hit.target.id),at=room.world(target);
  if(movePlanar(a.x,a.z,at.x-a.x,at.z-a.z,[],SURFACE_ROCKS,.03).hit)continue;
  hitOperator(room,target,shot.damage*FPS.falloff(weapon,hit.distance),p);
 }
}
export function tickOrdnance(room,dt){
 const active=[];
 for(const g of room.grenades||[]){FPS.stepGrenade(g,dt);if(!g.exploded){active.push(g);continue;}
  const owner=room.players.get(g.owner);recordCombat(room,{type:'explosion',attacker:g.owner,pos:[...g.pos]});
  for(const q of room.players.values())if(q.connected&&q.hp>0&&q.team!==g.team&&room.missions[q.team].phase==='surface'){
   const at=room.world(q),damage=FPS.explosionDamage(Math.hypot(at.x-g.pos[0],(q.y||0)+1-g.pos[1],at.z-g.pos[2]));
   if(damage>0&&!movePlanar(g.pos[0],g.pos[2],at.x-g.pos[0],at.z-g.pos[2],[],SURFACE_ROCKS,.03).hit)hitOperator(room,q,damage,owner);
  }
 }
 room.grenades=active;
}
export function operatorSnapshot(p){ensureOperator(p);return {y:+p.y.toFixed(3),eva:p.eva,oxygen:+p.suit.oxygen.toFixed(2),shield:+p.vitals.shield.toFixed(2),vitals:{...p.vitals},loadout:structuredClone(p.loadout),aimPitch:p.aimPitch};}
