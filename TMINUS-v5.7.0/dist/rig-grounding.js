// Two-bone foot placement on the imported skeleton, after its animation mixer.
// It adjusts leg bones, preserving the model's origin and animation timing.
import * as THREE from './vendor/three.module.js';
const P=()=>new THREE.Vector3();
export function solveLeg(upper,lower,foot,target,weight=1){
 upper.updateWorldMatrix(true,true);const a=upper.getWorldPosition(P()),b=lower.getWorldPosition(P()),c=foot.getWorldPosition(P()),l1=a.distanceTo(b),l2=b.distanceTo(c);if(l1<1e-5||l2<1e-5)return false;
 const goal=c.clone().lerp(target,weight),axis=goal.clone().sub(a),distance=Math.min(l1+l2-.00001,Math.max(.0001,axis.length()));axis.normalize();
 let bend=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));if(bend.lengthSq()<1e-8)bend.set(0,0,1).addScaledVector(axis,-axis.z);if(bend.lengthSq()<1e-8)bend.set(1,0,0);bend.normalize();
 const projection=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-projection*projection)),knee=a.clone().addScaledVector(axis,projection).addScaledVector(bend,height);
 const rotate=(bone,from,to)=>{const q=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()),world=bone.getWorldQuaternion(new THREE.Quaternion());world.premultiply(q);const parent=bone.parent?.getWorldQuaternion(new THREE.Quaternion()).invert()||new THREE.Quaternion();bone.quaternion.copy(parent.multiply(world));bone.updateWorldMatrix(false,true);};
 rotate(upper,b.clone().sub(a),knee.clone().sub(a));const newB=lower.getWorldPosition(P()),newC=foot.getWorldPosition(P());rotate(lower,newC.sub(newB),goal.sub(newB));return true;
}
export function createFootGrounding(model){
 model.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(model,true),legs=[];
 const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o);});const clean=n=>n.toLowerCase().replace(/[^a-z0-9]/g,'');
 for(const side of ['L','R']){
  const suffix=side.toLowerCase(),find=name=>bones.find(b=>clean(b.name)===name+suffix),foot=find('foot')||bones.find(b=>clean(b.name)===(side==='L'?'robotleftfoot':'robotrightfoot'));if(!foot)continue;
  const lower=find('lowerleg')||foot.parent,upper=find('upperleg')||lower?.parent;if(!lower?.isBone||!upper?.isBone)continue;
  const pos=foot.getWorldPosition(P()),linked=foot.parent===lower;let effector=foot;
  // The supplied Quaternius rigs animate feet as independent root controls.
  // A temporary ankle endpoint lets the actual thigh/shin follow that control.
  if(!linked){effector=new THREE.Object3D();lower.add(effector);effector.position.copy(lower.worldToLocal(pos.clone()));}
  legs.push({upper,lower,foot,effector,linked,sole:Math.max(.02,pos.y-bounds.min.y),previous:pos});
 }
 return {legs,apply(dt,{grounded=true,floorAt=()=>0,speed=0}={}){
  if(!grounded)return;model.updateWorldMatrix(true,true);
  for(const leg of legs){const pos=leg.foot.getWorldPosition(P()),floor=floorAt(pos.x,pos.z)+leg.sole,dy=floor-pos.y;
   // A rising swing foot keeps its animation. Stance and penetration receive IK.
   if(dy>0||((speed<.35||Math.abs(pos.y-leg.previous.y)<.025)&&Math.abs(dy)<.20)){
    const target=pos.clone();target.y=floor;const weight=Math.min(1,Math.max(.2,dt*20)),goal=pos.clone().lerp(target,weight);
    if(!leg.linked)leg.effector.position.copy(leg.lower.worldToLocal(pos.clone()));
    solveLeg(leg.upper,leg.lower,leg.effector,goal,1);
    if(!leg.linked)leg.foot.position.copy(leg.foot.parent.worldToLocal(goal));
   }
   leg.previous.copy(pos);
  }
 }};
}
