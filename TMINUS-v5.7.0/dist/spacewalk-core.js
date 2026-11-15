// Shared suit/tether and external maintenance coordinates. All inputs are intentions.
import {SHIP_SCALE} from './ship-scale.js';
export const EVA={radius:11*SHIP_SCALE,speed:4.5,oxygenUse:.65,refillRate:8,airlock:{x:1.65*SHIP_SCALE,y:5.0,z:-.6*SHIP_SCALE}};
export function createSuit(){return {oxygen:100,vx:0,vy:0,vz:0};}
export function advanceSpacewalk(suit,position,input,ship,dt){
 const t=Math.max(0,Math.min(.05,dt)),mag=Math.max(1,Math.hypot(input.x||0,input.y||0,input.z||0)),response=1-Math.exp(-8*t);
 for(const [velocity,axis]of[['vx','x'],['vy','y'],['vz','z']])suit[velocity]+=(EVA.speed*(input[axis]||0)/mag-suit[velocity])*response;
 const next={x:position.x+suit.vx*t,y:position.y+suit.vy*t,z:position.z+suit.vz*t};
 const dx=next.x-ship.x,dy=next.y-ship.y,dz=next.z-ship.z,d=Math.hypot(dx,dy,dz);
 if(d>EVA.radius){const k=EVA.radius/d;next.x=ship.x+dx*k;next.y=ship.y+dy*k;next.z=ship.z+dz*k;const dot=(suit.vx*dx+suit.vy*dy+suit.vz*dz)/(d*d);if(dot>0){suit.vx-=dot*dx;suit.vy-=dot*dy;suit.vz-=dot*dz;}}
 const port={x:ship.x+EVA.airlock.x,y:ship.y+EVA.airlock.y,z:ship.z+EVA.airlock.z};
 const near=Math.hypot(next.x-port.x,next.y-port.y,next.z-port.z)<4;
 suit.oxygen=Math.max(0,Math.min(100,suit.oxygen+t*(near?EVA.refillRate:-EVA.oxygenUse)));
 return next;
}
export function suitBlocked(point,ship,radius=.48){
 const x=point.x-ship.x,y=point.y+1.2-ship.y,z=point.z-ship.z;
 const ellipse=(cx,cy,cz,rx,ry,rz)=>((x-cx)/(rx+radius))**2+((y-cy)/(ry+radius))**2+((z-cz)/(rz+radius))**2<1;
 if(Math.abs(z+.36)<8.46+radius&&((x/(4.032+radius))**2+((y-5.04)/(4.032+radius))**2<1))return true;
 if(ellipse(0,5.04,-8.82,4.032,4.032,5.76))return true;
 for(const sign of[-1,1]){
  if(Math.abs(z-4.68)<5.22+radius&&((x-sign*6.48)/(1.764+radius))**2+((y-4.032)/(1.764+radius))**2<1)return true;
  if(Math.abs(x-sign*11.88)<3.06+radius&&Math.abs(y-5.04)<.126+radius&&Math.abs(z-.36)<4.14+radius)return true;
 }
 return false;
}
export function moveSuit(position,next,ship){
 const d=Math.hypot(next.x-position.x,next.y-position.y,next.z-position.z),steps=Math.max(1,Math.ceil(d/.15)),out={...position};
 for(let i=1;i<=steps;i++){
  const q={x:position.x+(next.x-position.x)*i/steps,y:position.y+(next.y-position.y)*i/steps,z:position.z+(next.z-position.z)*i/steps};
  if(!suitBlocked(q,ship)){Object.assign(out,q);continue;}
  for(const axis of['x','y','z']){const trial={...out,[axis]:q[axis]};if(!suitBlocked(trial,ship))out[axis]=q[axis];}
 }
 return out;
}
