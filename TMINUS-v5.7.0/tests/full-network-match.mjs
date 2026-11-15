// Sixteen independent WebSocket clients complete the ordinary expedition without phase/position fixtures.
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createGameServer} from '../server/online-server.mjs';
import {createExpedition} from '../dist/expedition-core.js';
import {shelfPoint,baseFor,STOW_POINT,CHECK_STATIONS,RECEIVER_POINT,expeditionColliders,SYSTEM_STATIONS,SURFACE_ROCKS} from '../dist/expedition-network.js';
import {findPath} from '../dist/crew-navigation.js';
import {hullBoxes} from '../dist/hull-collision.js';
import {recoverPlanar} from '../dist/motion-physics.js';
import {boltPosition,footprintDistance} from '../dist/build-guide.js';
const seconds=Number(process.env.MATCH_TIMEOUT_SECONDS||720),latency=Number(process.env.MATCH_LATENCY_MS||80),out=process.env.QA_OUTPUT||'work/qa';await mkdir(out,{recursive:true});
const service=createGameServer({host:'127.0.0.1',port:0}),port=(await service.listen()).port,bots=[],started=performance.now();let timer,code,completed=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Bot{
 constructor(team,role){this.team=team;this.role=role;this.seq=0;this.commandSeq=-1;this.lastCommand=0;this.pending=-1;this.model=createExpedition(42);this.taskKey='';this.goalKey='';this.path=[];this.bytes=0;this.sent=0;this.events=new Set();}
 send(m){this.sent++;setTimeout(()=>{if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));},latency/2);}
 async join(room){this.ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:`http://127.0.0.1:${port}`,perMessageDeflate:true});this.ws.on('message',data=>{this.bytes+=data.length;setTimeout(()=>this.receive(JSON.parse(data.toString())),latency/2);});await new Promise((resolve,reject)=>{this.joined=resolve;this.ws.once('error',reject);this.room=room;});}
 receive(m){if(m.kind==='hello')this.send({kind:'join',mode:'expedition',room:this.room||'',team:this.team,role:this.role,name:`SIM-${this.team}-${this.role}`});if(m.kind==='joined'){this.id=m.id;this.room=m.room;this.commandSeq=m.commandSeq;this.send({kind:'ready',value:true});this.joined();}
  if(m.kind==='action-result'&&m.error)this.taskKey='';
  if(m.kind==='snapshot'){this.state=m;this.me=m.players.find(p=>p.id===this.id);if(this.me){this.commandSeq=Math.max(this.commandSeq,this.me.commandSeq??-1);if(this.pending<=this.me.commandSeq)this.pending=-1;}for(const e of m.combatEvents||[])this.events.add(e.type);}
 }
 action(m){if(this.pending>=0||performance.now()-this.lastCommand<145)return;this.lastCommand=performance.now();this.pending=++this.commandSeq;this.send({kind:'action',commandSeq:this.pending,...m});}
 walk(goal,m){const p=this.me,solids=expeditionColliders(m);if(m.phase==='surface'){const b=baseFor(this.team);solids.circles=SURFACE_ROCKS.map(r=>({...r,x:r.x-b.x,z:r.z-b.z}));for(let team=0;team<4;team++)if(team!==this.team&&this.state.missions[team].phase==='surface'){const other=baseFor(team);solids.boxes.push(...hullBoxes({x:other.x-b.x,z:other.z-b.z}));}}const target=recoverPlanar(goal.x,goal.z,solids.boxes,solids.circles,.6),key=m.phase+':'+target.x.toFixed(1)+':'+target.z.toFixed(1)+':'+solids.boxes.length;
  if(this.goalKey!==key||performance.now()-(this.pathAt||0)>4000){this.goalKey=key;this.path=findPath(p,target,solids.boxes,solids.circles);this.pathAt=performance.now();}
  while(this.path.length>1&&Math.hypot(p.x-this.path[0].x,p.z-this.path[0].z)<.7)this.path.shift();const next=this.path[0]||target,dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz),scale=Math.min(1,d/1.8)/(d||1);
  return {x:dx*scale,z:dz*scale,arrived:Math.hypot(p.x-target.x,p.z-target.z)<.7};
 }
 work(target){const key=JSON.stringify(target);if(this.taskKey!==key&&this.pending<0){this.action({op:'work',target});if(this.pending>=0)this.taskKey=key;}}
 update(){const state=this.state,p=this.me;if(!p||state.phase!=='expedition')return;const m=state.missions[this.team],parts=this.model.parts.map((q,i)=>({...q,...m.parts[i]})),model={...this.model,...m,parts};let move={x:0,z:0},buttons=0,aim=0;const dist=g=>Math.hypot(p.x-g.x,p.z-g.z);
  if(m.phase==='assembly'){
   const part=parts.find(q=>q.id===m.carry[this.role])||parts.find(q=>q.owner===this.role&&q.stage==='positioned')||parts.find(q=>q.owner===this.role&&q.stage==='shelf');
   if(part?.stage==='shelf'){move=this.walk(shelfPoint(model,part),model);if(dist(shelfPoint(model,part))<2.5)this.action({op:'pick',part:part.id});}
   else if(part?.stage==='carried'){move=this.walk({x:part.position[0],z:part.position[2]},model);if(m.rotation[this.role]!==part.angle)this.action({op:'rotate'});else if(footprintDistance(part,p.x,p.z)<=2.8)this.action({op:'place'});}
   else if(part?.stage==='positioned'){const bolt=part.bolts.findIndex(n=>n<1),[x,,z]=boltPosition(part,Math.max(0,bolt));move=this.walk({x,z},model);this.work({type:'bolt',id:part.id,bolt});buttons|=4;}
  }else if(m.phase==='outfit'){
   const cargo=this.model.cargo.find(c=>c.owner===this.role&&!m.cargo.find(q=>q.id===c.id).stowed);
   if(m.carry[this.role]?.startsWith('cargo:')){move=this.walk(STOW_POINT,model);if(dist(STOW_POINT)<2.4)this.action({op:'stow'});}
   else if(cargo){const at={x:cargo.position[0],z:cargo.position[2]};move=this.walk(at,model);if(dist(at)<2.4)this.action({op:'cargo',cargo:cargo.id});}
   else if(m.cargo.every(c=>c.stowed)){const check=CHECK_STATIONS.find(c=>c.role===this.role&&m.checks[c.id]<1);if(check){move=this.walk(check,model);this.work({type:'check',id:check.id,reading:{engine:73,power:55,pressure:101.3}[check.id]});buttons|=4;}}
  }else if(m.phase==='route'){if(this.role===0)this.action({op:'launch',route:'sheltered'});}
  else if(m.phase==='flight'){
   if(this.role===0){const dx=17-m.shipMotion.x,dz=-m.shipMotion.z;move={x:Math.max(-1,Math.min(1,dx)),z:Math.max(-1,Math.min(1,dz))};}
   if(this.role===1){const id=m.fault==='cooling'||m.temperature>60?'coolant':m.co2>1500||m.pressure<90||m.fault==='scrubber'?'scrubber':'reactor',c=SYSTEM_STATIONS.find(c=>c.id===id);move=this.walk({x:c.x+(c.x<0?1.7:-1.7),z:c.z},model);this.work({type:'system',id});buttons|=4;}
   if(this.role===2&&m.hazards.length){const h=m.hazards[0];aim=Math.atan2(h.x-m.shipMotion.x,-(h.z-m.shipMotion.z));buttons|=1;}
  }else if(m.phase==='surface'){
   const base=baseFor(this.team),own=state.flags.filter(f=>f.state==='onboard'&&f.owner===this.team),carried=state.flags.find(f=>f.state==='carried'&&f.owner===this.team);
   if(this.role===0&&own.length>=3&&!carried)this.action({op:'return'});
   if(this.role===3){if(p.carry!==null){move=this.walk({x:0,z:-17},model);if(dist({x:0,z:-17})<3.5)this.action({op:'load'});}
    else if(own.length<3){const f=state.flags.find(f=>f.id%4===this.team&&['site','ground','wreck'].includes(f.state)&&f.planet==='B');if(f){const target={x:f.position[0]-base.x,z:f.position[2]-base.z+1.7};move=this.walk(target,model);aim=Math.atan2(f.position[0]-base.x-p.x,-(f.position[2]-base.z-p.z));if(f.state==='site'){this.work({type:'scan',id:String(f.id)});buttons|=4;}else if(dist({x:f.position[0]-base.x,z:f.position[2]-base.z})<3)this.action({op:'recover',sample:f.id});}}
   }else if([1,2].includes(this.role)){const raider=state.players.find(q=>q.team===this.team&&q.role===3),rb=baseFor(raider.team);move=this.walk({x:raider.x+(this.role===1?-1.7:1.7),z:raider.z+1},model);}
  }else if(m.phase==='delivery'){
   if(this.role===3){move=this.walk(RECEIVER_POINT,model);if(dist(RECEIVER_POINT)<4)this.action(ownCargo(state,this.team)?{op:'deliver'}:{op:'finish'});}
  }
  if(Math.hypot(move.x,move.z)>.9&&!m.carry[this.role])buttons|=2;
  this.send({kind:'input',v:1,sequence:++this.seq,strafe:move.x||0,forward:move.z||0,buttons,aim});
 }
}
const ownCargo=(state,team)=>state.flags.filter(f=>f.state==='onboard'&&f.owner===team).length;
try{
 for(let t=0;t<4;t++)for(let r=0;r<4;r++){const bot=new Bot(t,r);await bot.join(code);code=bot.room;bots.push(bot);}
 while(!bots[0].state?.players.every(p=>p.ready))await sleep(50);bots[0].send({kind:'start'});timer=setInterval(()=>bots.forEach(b=>b.update()),50);
 let lastLog=0;
 while(performance.now()-started<seconds*1000){const s=bots[0].state;if(s?.phase==='results'){completed=true;break;}if(performance.now()-lastLog>10000){lastLog=performance.now();console.log('MATCH',Math.round((performance.now()-started)/1000),s?.missions.map((m,i)=>({team:i,phase:m.phase,parts:m.parts.filter(p=>p.stage==='secured').length,cargo:ownCargo(s,i),score:s.teams[i].delivered})));}await sleep(100);}
 assert.ok(completed,'normal-duration network expedition did not complete before timeout');const final=bots[0].state;assert.ok(final.teams.every(t=>t.delivered===3));assert.equal(final.flags.filter(f=>f.state==='delivered').length,12);assert.equal(new Set(final.flags.map(f=>f.id)).size,12);
 const report={method:'16 independent compressed WebSocket clients, authoritative snapshots and ordinary input/actions only; no state fixtures or timer acceleration',players:16,latencyMs:latency,elapsedSeconds:+((performance.now()-started)/1000).toFixed(1),delivered:final.teams.map(t=>t.delivered),events:[...new Set(bots.flatMap(b=>[...b.events]))],uncompressedReceivedBytes:bots.reduce((n,b)=>n+b.bytes,0),actualSocketBytes:bots.reduce((n,b)=>n+(b.ws._socket?.bytesRead||0),0)};await writeFile(out+'/full-network-match.json',JSON.stringify(report,null,2));console.log('FULL NETWORK PASS',JSON.stringify(report));
}finally{clearInterval(timer);bots.forEach(b=>b.ws?.terminate());await service.close();}
