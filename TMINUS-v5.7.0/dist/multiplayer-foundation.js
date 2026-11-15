// Phase 4 foundation ONLY. Offline competitive mode is unchanged.
// Server-authoritative movement sample and snapshot wire format for a future
// WebSocket backend. Never trust client-supplied positions, timers, or scores.
export const WIRE_VERSION=1;
export const MATCH_CAPACITY=16;
export const SIMULATION_HZ=20;
export const ROOM_SIDES=4;
export const ROLES_PER_SIDE=4;
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export function validatePlayerJoin(join){
 if(!join||typeof join!=='object'||Array.isArray(join))return null;
 const {id,team,role}=join;
 if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,36}$/.test(id))return null;
 if(!Number.isInteger(team)||team<0||team>=ROOM_SIDES||!Number.isInteger(role)||role<0||role>=ROLES_PER_SIDE)return null;
 return {id,team,role,name:text(join.name,24)||'Crew'};
}
export function validateInputPacket(packet){
 if(!packet||typeof packet!=='object'||Array.isArray(packet)||packet.kind!=='input')return null;
 if(!Number.isSafeInteger(packet.sequence)||packet.sequence<0||packet.sequence>1e12)return null;
 if(!finite(packet.strafe)||!finite(packet.forward)||Math.abs(packet.strafe)>1||Math.abs(packet.forward)>1)return null;
 if(!Number.isInteger(packet.buttons)||packet.buttons<0||packet.buttons>15)return null;
 return {kind:'input',v:WIRE_VERSION,sequence:packet.sequence,
  strafe:packet.strafe,forward:packet.forward,buttons:packet.buttons};
}
export function createAuthoritativeRoom({speed=4.3,radius=80}={}){
 if(!finite(speed)||speed<=0||speed>50||!finite(radius)||radius<=1)throw Error('Invalid simulation parameters');
 const players=new Map();let tickId=0,time=0;
 const view=p=>({id:p.id,name:p.name,team:p.team,role:p.role,x:p.x,z:p.z,sequence:p.sequence});
 return {
  get size(){return players.size;},get tickId(){return tickId;},
  join(info){const p=validatePlayerJoin(info);if(!p||players.has(p.id)||players.size>=MATCH_CAPACITY)return false;
   if([...players.values()].some(q=>q.team===p.team&&q.role===p.role))return false;
   players.set(p.id,{...p,x:0,z:0,sequence:-1,input:{strafe:0,forward:0}});return true;},
  leave(id){return players.delete(id);},
  receive(id,raw){const p=players.get(id),input=validateInputPacket(raw);
   if(!p||!input||input.sequence<=p.sequence)return false;
   p.sequence=input.sequence;
   p.input={strafe:input.strafe,forward:input.forward};return true;},
  tick(dt=1/SIMULATION_HZ){if(!finite(dt)||dt<0||dt>1/SIMULATION_HZ+1e-8)throw Error('Invalid fixed step');
   time+=dt;tickId++;
   for(const p of players.values()){
    const {strafe,forward}=p.input;
    const mag=Math.hypot(strafe,forward)||1;
    p.x=limit(p.x+strafe/mag*speed*dt,-radius,radius);
    p.z=limit(p.z+forward/mag*speed*dt,-radius,radius);
   }
   return this.snapshot();},
  snapshot(){return {kind:'snapshot',v:WIRE_VERSION,tick:tickId,time,
    players:[...players.values()].map(view).sort((a,b)=>a.id.localeCompare(b.id))};}
 };
}
export function interpolateSnapshots(a,b,alpha){
 if(!a||!b||!Array.isArray(a.players)||!Array.isArray(b.players)||!finite(alpha))return null;
 const t=limit(alpha,0,1),old=new Map(a.players.map(p=>[p.id,p]));
 return b.players.map(p=>{const prev=old.get(p.id);return prev&&finite(prev.x)&&finite(prev.z)&&finite(p.x)&&finite(p.z)
  ? {...p,x:prev.x+(p.x-prev.x)*t,z:prev.z+(p.z-prev.z)*t}:{...p};});
}
