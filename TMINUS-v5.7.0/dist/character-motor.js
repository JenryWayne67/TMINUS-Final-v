// Shared metres/seconds character dynamics. Rendering never owns movement truth.
import {movePlanar} from './motion-physics.js';
export const MOTOR={acceleration:32,braking:44,gravity:18,jumpSpeed:6.4,maxStep:.05};
export function createMotor(){return {vx:0,vz:0,y:0,vy:0,grounded:true,jumpHeld:false};}
export function clearMotor(m){m.vx=0;m.vz=0;m.jumpHeld=false;}
export function advanceMotor(m,{x=0,z=0,speed=6.2,jump=false,enabled=true}={},dt=.05){
 const t=Math.max(0,Math.min(MOTOR.maxStep,Number.isFinite(dt)?dt:0)),mag=Math.max(1,Math.hypot(x,z));
 const tx=enabled?x/mag*speed:0,tz=enabled?z/mag*speed:0,dx=tx-m.vx,dz=tz-m.vz,d=Math.hypot(dx,dz);
 const a=(Math.hypot(tx,tz)<Math.hypot(m.vx,m.vz)?MOTOR.braking:MOTOR.acceleration)*t,k=d>0?Math.min(1,a/d):0;
 m.vx+=dx*k;m.vz+=dz*k;
 if(jump&&!m.jumpHeld&&m.grounded&&enabled){m.vy=MOTOR.jumpSpeed;m.grounded=false;}
 m.jumpHeld=jump;
 if(!m.grounded){m.y+=m.vy*t-.5*MOTOR.gravity*t*t;m.vy-=MOTOR.gravity*t;if(m.y<=0){m.y=0;m.vy=0;m.grounded=true;}}
 return {dx:m.vx*t,dz:m.vz*t,y:m.y};
}
export function moveCharacter(m,position,input,dt,boxes=[],circles=[]){
 const step=advanceMotor(m,input,dt),next=movePlanar(position.x,position.z,step.dx,step.dz,boxes,circles);
 if(Math.abs(next.x-position.x)<1e-7&&Math.abs(step.dx)>.001)m.vx=0;
 if(Math.abs(next.z-position.z)<1e-7&&Math.abs(step.dz)>.001)m.vz=0;
 return {...next,y:m.y};
}
