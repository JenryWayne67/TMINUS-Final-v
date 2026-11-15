// T-MINUS Phase 5 — deterministic, server-authoritative competitive match rules.
// No DOM, Three.js, or WebSocket dependency. All positions, combat, objectives,
// transitions and scoring are owned by the Node process; clients send intentions.
import {randomBytes, randomUUID} from './random.js';
import {SIMULATION_HZ, MATCH_CAPACITY, ROOM_SIDES, ROLES_PER_SIDE,validateInputPacket} from '../multiplayer-foundation.js';

import {ONLINE_TEAMS as TEAM_NAMES,ONLINE_COLORS as TEAM_COLORS,ONLINE_ROLES as ROLE_NAMES,ONLINE_MODULES as MODULES,ONLINE_BASES as BASES,ONLINE_MODULE_OFFSETS as MODULE_OFFSETS,ONLINE_SITES as SITES,ONLINE_ROCKS as ROCKS} from '../online-constants.js';
export {TEAM_NAMES,TEAM_COLORS,ROLE_NAMES,MODULES,BASES,SITES};
export const PHASES=['lobby','build','flight','surface','return','delivery','results'];
export const DEFAULT_DURATIONS={build:120,flight:15,surface:150,return:12,delivery:48};
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
const sane=n=>typeof n==='number'&&Number.isFinite(n);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ntext=(x,max=26)=>typeof x==='string'?x.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,max):'';
const center=(team)=>({x:BASES[team][0],z:BASES[team][1]});
const location=(team,role)=>({x:BASES[team][0]+MODULE_OFFSETS[role][0],z:BASES[team][1]+MODULE_OFFSETS[role][1]});
const pos=(x,z)=>({x,z});
const vector=(dx,dz)=>{const l=Math.hypot(dx,dz);return l>0?{x:dx/l,z:dz/l}:{x:0,z:0};};
const PHASE_TIME=(durations,phase)=>durations[phase]??0;
function isInObstacle(x,z){
 // Central rocks are authoritative geometry, not just graphical scenery.
 return ROCKS.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r+.52) || BASES.some(([bx,bz])=>Math.hypot(x-bx,z-bz)<3.25);
}
function blocksLine(x,z,tx,tz){
 return ROCKS.some(([cx,cz,r])=>{
  const dx=tx-x,dz=tz-z,den=dx*dx+dz*dz||1;
  const t=limit(((cx-x)*dx+(cz-z)*dz)/den,0,1);
  return Math.hypot(x+dx*t-cx,z+dz*t-cz)<r;
 });
}
const teamState=team=>({team,name:TEAM_NAMES[team],color:TEAM_COLORS[team],modules:[0,0,0,0],cargo:0,delivered:0,kills:0,hull:100,launched:false,checks:0});

export class Match {
 constructor({code,durations={},minPlayers=2}={}){
  this.code=code||randomBytes(3).toString('hex').toUpperCase();
  if(!/^[A-Z0-9]{4,8}$/.test(this.code))throw Error('Invalid room code');
  this.players=new Map();this.tokens=new Map();this.teams=Array.from({length:ROOM_SIDES},(_,i)=>teamState(i));
  this.phase='lobby';this.phaseLeft=0;this.durations={...DEFAULT_DURATIONS,...durations};
  this.minPlayers=minPlayers;this.tickNumber=0;this.time=0;this.hostId=null;this.events=[];
  this.sites=SITES.map(([x,z],id)=>({id,x,z,state:'ground',holder:null,team:null}));
  this.winner=null;this.lastActivity=Date.now();this.inputPerSecond=new Map();
 }
 sendEvent(text,team=null){this.events.push({t:Math.round(this.time),text:ntext(text,140),team});if(this.events.length>16)this.events.shift();}
 get participants(){return [...this.players.values()].filter(p=>p.connected);}
 get occupied(){return this.players.size;}
 seat(team,role){return [...this.players.values()].some(p=>p.team===team&&p.role===role);}
 join({name,team,role,token}={}){
  this.lastActivity=Date.now();
  if(typeof token==='string'&&this.tokens.has(token)){
   const id=this.tokens.get(token),p=this.players.get(id);
   if(p&&!p.connected){p.connected=true;p.expireAt=0;p.input={strafe:0,forward:0,buttons:0};p.lastInputAt=this.time;if(!this.hostId)this.hostId=p.id;this.sendEvent(`${p.name} reconnected`,p.team);return {player:p,resumed:true};}
   if(p?.connected)return {error:'This session is already connected'};
  }
  if(this.players.size>=MATCH_CAPACITY)return {error:'Room is full (16 players)'};
  // The host's requested seat is optional, never trusted or allowed to steal an occupied one.
  const seats=[];for(let t=0;t<4;t++)for(let r=0;r<4;r++)if(!this.seat(t,r))seats.push([t,r]);
  const preferred=seats.find(([t,r])=>t===team&&r===role);
  const sameTeam=seats.find(([t])=>t===team);
  const [pickedTeam,pickedRole]=preferred||sameTeam||seats[0];
  const id=randomUUID(),session=randomBytes(24).toString('base64url');
  const home=location(pickedTeam,pickedRole);
  const p={id,token:session,name:ntext(name)||'Astronaut',team:pickedTeam,role:pickedRole,
   x:home.x,z:home.z,aim:0,hp:100,connected:true,expireAt:0,
   input:{strafe:0,forward:0,buttons:0},lastInputAt:this.time,sequence:-1,score:0,kills:0,downs:0,
   carry:null,ready:false,lastAction:-1e6,lastFire:-1e6,reviveAt:0};
  this.players.set(id,p);this.tokens.set(session,id);
  if(!this.hostId)this.hostId=id;
  this.sendEvent(`${p.name} joined ${TEAM_NAMES[p.team]} as ${ROLE_NAMES[p.role]}`,p.team);
  return {player:p,resumed:false};
 }
 leave(id,now=Date.now()){
  const p=this.players.get(id);if(!p)return false;
  p.connected=false;p.expireAt=now+60000;p.input={strafe:0,forward:0,buttons:0};
  this.dropHeld(p);
  if(this.hostId===id)this.hostId=this.participants[0]?.id||null;
  this.sendEvent(`${p.name} disconnected`,p.team);this.lastActivity=now;return true;
 }
 expire(now=Date.now()){
  for(const p of this.players.values())if(!p.connected&&p.expireAt&&now>=p.expireAt){this.players.delete(p.id);this.tokens.delete(p.token);}
  if(!this.hostId)this.hostId=this.participants[0]?.id||null;
 }
 dropHeld(p){if(p.carry===null)return;const s=this.sites[p.carry];if(s){s.state='ground';s.holder=null;s.team=null;s.x=p.x;s.z=p.z;}p.carry=null;}
 start(id){
  if(this.phase!=='lobby')return {error:'Match has already started'};
  if(id!==this.hostId)return {error:'Only the room host can start'};
  if(this.participants.length<this.minPlayers)return {error:`At least ${this.minPlayers} connected players required`};
  if(new Set(this.participants.map(p=>p.team)).size<2&&this.minPlayers>1)return {error:'Competitive match requires players on at least two teams'};
  if(this.participants.some(p=>!p.ready))return {error:'Every connected player must READY UP before launch'};
  this.changePhase('build');return {ok:true};
 }
 changePhase(next){
  if(!PHASES.includes(next))throw Error('Bad phase');
  if(next==='return')for(const p of this.players.values())this.dropHeld(p);
  this.phase=next;this.phaseLeft=PHASE_TIME(this.durations,next);
  for(const p of this.players.values()){
   const b=center(p.team);
   if(next!=='results'){
    // Every stage has clear spawn/reset positions, avoiding stale movement through transit.
    p.x=b.x+[-3,3,-3,3][p.role];p.z=b.z+[7,7,10,10][p.role];
    p.hp=100;p.reviveAt=0;p.input={strafe:0,forward:0,buttons:0};p.sequence=-1;
   }
  }
  if(next==='flight')this.teams.forEach(t=>{
    const parts=t.modules.reduce((sum,n)=>sum+(n===3?1:0),0);
    t.launched=parts>=3;t.hull=Math.max(30,60+parts*10);
  });
  if(next==='results'){
   const ordered=[...this.teams].sort((a,b)=>b.delivered-a.delivered||a.team-b.team);
   this.winner=ordered[0].delivered===ordered[1].delivered?null:ordered[0].team;
   this.phaseLeft=0;
  }
  this.sendEvent(next==='surface'?'LANDING CONFIRMED: collect science samples':`MISSION PHASE: ${next.toUpperCase()}`);
 }
 receiveInput(id,packet){
  const p=this.players.get(id);const input=validateInputPacket(packet);
  if(!p?.connected||!input||packet.v!==1||!sane(packet.aim)||Math.abs(packet.aim)>Math.PI||input.sequence<=p.sequence)return false;
  p.sequence=input.sequence;p.aim=packet.aim;
  p.input={strafe:input.strafe,forward:input.forward,buttons:input.buttons};p.lastInputAt=this.time;return true;
 }
 ready(id,flag){const p=this.players.get(id);if(!p?.connected||this.phase!=='lobby')return false;p.ready=!!flag;return true;}
 action(id){
  const p=this.players.get(id);
  if(!p?.connected||p.hp<=0||this.time-p.lastAction<.48)return {error:'Not ready'};
  p.lastAction=this.time;
  const t=this.teams[p.team],b=center(p.team);
  if(this.phase==='build'){
   const found=MODULE_OFFSETS.map((_,r)=>({r,dist:distance(p,location(p.team,r))})).sort((a,b)=>a.dist-b.dist)[0];
   if(!found||found.dist>4.5)return {error:'Move close to a glowing module terminal'};
   if(t.modules[found.r]>=3)return {error:'Module already installed'};
   t.modules[found.r]++;p.score+=found.r===p.role?15:10;
   if(t.modules[found.r]===3)this.sendEvent(`${t.name} completed ${MODULES[found.r]}`,p.team);
   return {ok:true,message:`${MODULES[found.r]}: ${t.modules[found.r]}/3 fasteners`};
  }
  if(this.phase==='flight'){
   if(distance(p,b)>10)return {error:'Move to your ship to service systems'};
   t.checks++;t.hull=Math.min(100,t.hull+3);p.score+=4;
   return {ok:true,message:'System stabilized · hull integrity +3'};
  }
  if(this.phase==='surface'){
   if(p.carry!==null){
    if(distance(p,b)<7){const s=this.sites[p.carry];if(t.cargo>=4)return {error:'Cargo bay full (4 samples)'};
     if(!s)return {error:'Sample unavailable'};
     s.state='onboard';s.holder=null;s.team=p.team;p.carry=null;t.cargo++;p.score+=40;
     return {ok:true,message:`Sample secured · ${t.cargo}/4 cargo`};}
    return {error:'Bring your sample to your team spacecraft'};
   }
   const candidate=this.sites.filter(s=>s.state==='ground').sort((a,b)=>distance(p,a)-distance(p,b))[0];
   if(!candidate||distance(p,candidate)>3)return {error:'Find a glowing sample to collect'};
   if(t.cargo>=4)return {error:'Cargo bay full (4 samples)'};
   candidate.state='carried';candidate.holder=p.id;candidate.team=p.team;p.carry=candidate.id;p.score+=15;
   return {ok:true,message:'Science sample collected · return to your ship'};
  }
  if(this.phase==='delivery'){
   if(distance(p,{x:b.x+8,z:b.z})>5)return {error:'Walk to the receiving beacon beside your ship'};
   if(t.cargo<1)return {error:'No cargo remains to deliver'};
   t.cargo--;t.delivered++;p.score+=100;
   const s=this.sites.find(s=>s.state==='onboard'&&s.team===p.team);
   if(s){s.state='delivered';s.team=p.team;}
   this.sendEvent(`${t.name} delivered science ${t.delivered}`,p.team);
   return {ok:true,message:`DELIVERED! ${t.delivered} points for ${t.name}`};
  }
  return {error:'No interaction available in this phase'};
 }
 fire(p){
  if(this.phase!=='surface'||p.hp<=0||this.time-p.lastFire<(p.role===2?.24:.38))return;
  p.lastFire=this.time;
  const direction={x:Math.sin(p.aim),z:-Math.cos(p.aim)};
  let target=null,best=1e9;
  for(const q of this.players.values()){
   if(!q.connected||q.team===p.team||q.hp<=0||q.reviveAt>this.time)continue;
   const dx=q.x-p.x,dz=q.z-p.z,dist=Math.hypot(dx,dz);
   if(dist>23||dist<.01)continue;
   const along=dx*direction.x+dz*direction.z;
   const away=Math.abs(dx*direction.z-dz*direction.x);
   if(along<=0||away>Math.max(.7,dist*.035)||blocksLine(p.x,p.z,q.x,q.z))continue;
   if(dist<best){target=q;best=dist;}
  }
  if(!target)return;
  target.hp=Math.max(0,target.hp-(p.role===2?32:23));
  if(target.hp===0){p.kills++;p.score+=50;this.teams[p.team].kills++;target.downs++;
   target.reviveAt=this.time+5;this.dropHeld(target);
   this.sendEvent(`${p.name} knocked out ${target.name}`,p.team);
  }
 }
 tick(dt=1/SIMULATION_HZ){
  if(!sane(dt)||dt<=0||dt>1/SIMULATION_HZ+.00001)throw Error('Invalid fixed timestep');
  this.time+=dt;this.tickNumber++;
  if(!['lobby','results'].includes(this.phase)){
   this.phaseLeft=Math.max(0,this.phaseLeft-dt);
   if(this.phaseLeft<=0){const n=PHASES.indexOf(this.phase);this.changePhase(PHASES[n+1]);}
  }
  for(const p of this.players.values()){
   if(!p.connected)continue;
   if(p.reviveAt>0){if(this.time<p.reviveAt)continue;
    const b=center(p.team);p.x=b.x;p.z=b.z;p.hp=100;p.reviveAt=0;}
   if(this.phase==='lobby'||this.phase==='results')continue;
   if(this.time-p.lastInputAt>.5)p.input={strafe:0,forward:0,buttons:0};
   const {strafe,forward,buttons}=p.input;
   const direction=vector(strafe,forward),speed=buttons&2?6.4:4.65;
   let nx=limit(p.x+direction.x*speed*dt,-53,53),nz=limit(p.z+direction.z*speed*dt,-49,49);
   if(this.phase==='flight'||this.phase==='return'){
    const [bx,bz]=BASES[p.team],dx=nx-bx,dz=nz-bz,d=Math.hypot(dx,dz);
    if(d>13){nx=bx+dx/d*13;nz=bz+dz/d*13;}
   }
   if(!isInObstacle(nx,p.z))p.x=nx;
   if(!isInObstacle(p.x,nz))p.z=nz;
   if(buttons&1)this.fire(p);
  }
  return this.snapshot();
 }
 snapshot(){
  return {kind:'snapshot',v:1,room:this.code,tick:this.tickNumber,time:Math.round(this.time*100)/100,
   phase:this.phase,phaseLeft:Math.ceil(this.phaseLeft),hostId:this.hostId,winner:this.winner,
   teams:this.teams.map(t=>({...t,modules:[...t.modules]})),
   players:[...this.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,role:p.role,x:+p.x.toFixed(3),z:+p.z.toFixed(3),aim:+p.aim.toFixed(3),hp:p.hp,connected:p.connected,ready:p.ready,kills:p.kills,score:p.score,carry:p.carry,sequence:p.sequence,revive:p.reviveAt>this.time?Math.ceil(p.reviveAt-this.time):0})),
   sites:this.sites.map(s=>({...s})),events:[...this.events]};
 }
}
export function makeRoomCode(){return randomBytes(3).toString('hex').toUpperCase();}
