import {ExpeditionMatch} from './expedition-match.mjs';
import {ProgressionStore} from './progression-store.mjs';
import {FederatedStore} from './federated-store.mjs';
import {createAccountHandler} from './account-http.mjs';
import {trustedHeader,sendJSON,createProfileRPC} from './internal-rpc.mjs';
import {Match,makeRoomCode} from './match.mjs';
import {acceptWebSocket} from './ws.mjs';
import {SIMULATION_HZ} from '../dist/multiplayer-foundation.js';
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.fbx':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
export function createGameServer({port=Number(process.env.PORT||8095),host=process.env.HOST||'0.0.0.0',minPlayers=2,durations={},allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),maxRooms=64,storePath=':memory:',windowSeconds=1800,profileServiceUrl,clusterKey,workerId,tls}={}){
 const rooms=new Map(),clients=new Set(),sockets=new Set(),store=profileServiceUrl?new FederatedStore(storePath,profileServiceUrl,clusterKey):new ProgressionStore(storePath);
 const settlement=new Map();let stopping=false,persistenceError=null;
 const reply=(socket,obj)=>socket?.send(obj),broadcast=(room,message)=>{for(const c of clients)if(c.room===room)reply(c.socket,message);};
 async function publishProfile(client){const p=client.room?.players.get(client.id);if(p?.profileId)reply(client.socket,{kind:'profile',profile:await store.get(p.profileId)});}
 function onComplete(room){
  if(settlement.has(room.code))return settlement.get(room.code);
  room.rewardStatus='pending';
  const job=(async()=>{try{await store.settle(room);room.rewardStatus='settled';await store.save(room);for(const c of clients)if(c.room===room)await publishProfile(c);persistenceError=null;}catch(e){room.rewardStatus='pending';persistenceError=e.message;room.sendEvent('Career synchronization pending; your result will retry automatically.');}finally{settlement.delete(room.code);}})();settlement.set(room.code,job);return job;
 }
 for(const state of store.recover()){const room=ExpeditionMatch.restore(state,{minPlayers,onComplete});room.rewardStatus=state.rewardStatus;rooms.set(room.code,room);}
 async function joinRoom(client,req){
  if(client.room||client.joining){reply(client.socket,{kind:'error',message:'Already joining or in a room'});return;}
  const requested=typeof req.room==='string'?req.room.trim().toUpperCase():'';
  if(requested&&!/^[A-Z0-9]{4,8}$/.test(requested)){reply(client.socket,{kind:'error',message:'Invalid room code'});return;}
  let room=requested?rooms.get(requested):null;
  if(requested&&!room&&!(client.internal&&req.create===true)){reply(client.socket,{kind:'error',message:'Room not found'});return;}
  if(!room){if(rooms.size>=maxRooms){reply(client.socket,{kind:'error',message:'Server room limit reached'});return;}
   let code=requested||makeRoomCode();while(rooms.has(code))code=makeRoomCode();room=req.mode==='expedition'?new ExpeditionMatch({code,minPlayers,windowSeconds,onComplete}):new Match({code,minPlayers,durations});rooms.set(code,room);
  }
  if((req.mode==='expedition')!==(room.kind==='expedition')){reply(client.socket,{kind:'error',message:room.kind==='expedition'?'This room uses expedition.html':'This room uses online.html'});return;}
  client.joining=true;
  try{
   let identity=room.kind==='expedition'?await store.identity(req.profileToken):null;
   if(client.closed)return;
   let resumeToken=req.token;
   if(room.kind==='expedition'){
    const reserved=resumeToken?room.players.get(room.tokens.get(resumeToken)):null;
    if(reserved?.profileId){const profile=await store.get(reserved.profileId);if(profile?.registered&&identity?.profile.id!==profile.id){reply(client.socket,{kind:'error',message:'Sign in to the account that owns this reserved seat'});return;}}
    if(!resumeToken&&identity?.profile.registered){const own=[...room.players.values()].find(p=>p.profileId===identity.profile.id);if(own)resumeToken=own.token;}
   }
   const result=room.join({name:req.name,team:req.team,role:req.role,token:resumeToken});if(result.error){reply(client.socket,{kind:'error',message:result.error});return;}
   client.room=room;client.id=result.player.id;
   if(client.closed){room.leave(client.id);return;}
   if(room.kind==='expedition'){
    const p=result.player;
    if(!result.resumed||!p.profileId){p.profileId=identity.profile.id;p.cosmetic=identity.profile.cosmetic;reply(client.socket,{kind:'profile',profile:identity.profile,profileToken:identity.token});}
    else{const profile=await store.get(p.profileId);p.cosmetic=profile?.cosmetic||'Cadet';reply(client.socket,{kind:'profile',profile});}
    await store.save(room);
   }
   reply(client.socket,{kind:'joined',id:client.id,token:result.player.token,room:room.code,hostId:room.hostId,resumed:result.resumed,mode:room.kind||'arena',commandSeq:result.player.commandSeq??-1});broadcast(room,room.snapshot());
  }catch(e){reply(client.socket,{kind:'error',message:'Profile service unavailable. Please retry.'});persistenceError=e.message;}finally{client.joining=false;}
 }
 async function receive(client,raw){
  if(raw.length>4096){client.socket.close(1009);return;}let m;try{m=JSON.parse(raw);}catch{reply(client.socket,{kind:'error',message:'Malformed JSON'});return;}
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.kind!=='string')return;
  if(m.kind==='join'){await joinRoom(client,m);return;}
  if(m.kind==='matchmake'){
   const open=[...rooms.values()].find(r=>r.kind==='expedition'&&r.phase==='lobby'&&r.occupied<16);
   const team=open?[0,1,2,3].sort((a,b)=>[...open.players.values()].filter(p=>p.team===a).length-[...open.players.values()].filter(p=>p.team===b).length)[0]:0;
   await joinRoom(client,{...m,mode:'expedition',room:open?.code,team});return;
  }
  const room=client.room;if(!room||!client.id)return;
  if(m.kind==='input'){room.receiveInput(client.id,m);return;}
  if(m.kind==='start'){const r=room.start(client.id);if(r.error)reply(client.socket,{kind:'error',message:r.error});else{store.save(room);broadcast(room,room.snapshot());}return;}
  if(m.kind==='ready'){room.ready(client.id,m.value);broadcast(room,room.snapshot());return;}
  if(m.kind==='action'){const r=room.action(client.id,m);reply(client.socket,{kind:'action-result',...r});if(r.ok)broadcast(room,room.snapshot());return;}
  if(m.kind==='seat'&&room.kind==='expedition'){const r=room.chooseSeat(client.id,m.team,m.role);reply(client.socket,{kind:'action-result',...r});broadcast(room,room.snapshot());return;}
  if(m.kind==='cosmetic'&&room.kind==='expedition'){const p=room.players.get(client.id);if(await store.equip(p.profileId,m.cosmetic)){p.cosmetic=m.cosmetic;await publishProfile(client);}return;}
  if(m.kind==='chat'){
   if(room.time-client.lastChat<1.5)return;client.lastChat=room.time;const p=room.players.get(client.id);if(!p)return;
   const text=String(m.text||'').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,140);if(text)broadcast(room,{kind:'chat',name:p.name,team:p.team,text});
  }
 }
 const accountHandler=createAccountHandler(store,{allowedOrigins}),profileRPC=createProfileRPC(store,clusterKey);
 const handler=async(req,res)=>{
  let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{sendJSON(res,400,{error:'Invalid URL'});return;}
  if(await profileRPC(req,res,path))return;
  if(path==='/internal/lobbies'){
   if(!trustedHeader(req,clusterKey)){sendJSON(res,403,{error:'Forbidden'});return;}
   sendJSON(res,200,{workerId,rooms:[...rooms.values()].filter(r=>r.kind==='expedition'&&r.phase==='lobby'&&r.occupied<16).map(r=>({code:r.code,counts:[0,1,2,3].map(t=>[...r.players.values()].filter(p=>p.team===t).length),occupied:r.occupied}))});return;
  }
  if(await accountHandler(req,res,path))return;
  if(path==='/api/health'){sendJSON(res,200,{service:'T-MINUS',version:'5.7.0',rooms:rooms.size,players:[...clients].filter(c=>c.room).length,workerId:workerId||null,persistence:persistenceError?'retrying':'ready'});return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let decoded;try{decoded=decodeURIComponent(path);}catch{res.writeHead(400);res.end();return;}
  let target=resolve(ROOT,'.'+(decoded==='/'?'/index.html':decoded));if(target!==ROOT&&!target.startsWith(ROOT+sep)){res.writeHead(403);res.end();return;}
  try{let st=await stat(target);if(st.isDirectory()){target=resolve(target,'index.html');st=await stat(target);}if(!st.isFile())throw Error('Not a file');
   res.writeHead(200,{'Content-Type':MIME[extname(target)]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});if(req.method==='HEAD'){res.end();return;}createReadStream(target).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
 };
 const server=tls?createHttpsServer(tls,(req,res)=>handler(req,res).catch(()=>{if(!res.headersSent)sendJSON(res,500,{error:'Request failed'});else res.destroy();})):createHttpServer((req,res)=>handler(req,res).catch(()=>{if(!res.headersSent)sendJSON(res,500,{error:'Request failed'});else res.destroy();}));
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{
  const internal=trustedHeader(req,clusterKey);if(workerId&&!internal){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;}
  const client={socket:null,room:null,id:null,lastChat:-1e10,internal,closed:false,queue:Promise.resolve()};
  const ws=acceptWebSocket(req,socket,head,{allowedOrigins:internal?[...(allowedOrigins||[]),req.headers.origin].filter(Boolean):allowedOrigins,
   onMessage:raw=>{client.queue=client.queue.then(()=>receive(client,raw)).catch(()=>reply(client.socket,{kind:'error',message:'Request failed'}));},
   onClose:()=>{client.closed=true;clients.delete(client);if(client.room&&client.id){client.room.leave(client.id);broadcast(client.room,client.room.snapshot());}}});
  if(!ws)return;client.socket=ws;clients.add(client);reply(ws,{kind:'hello',version:1,message:'T-MINUS online server connected'});
 });
 let last=process.hrtime.bigint(),acc=0,lastBroadcast=new Map();
 const loop=setInterval(()=>{const now=process.hrtime.bigint(),elapsed=Number(now-last)/1e9;last=now;acc=Math.min(.3,acc+elapsed);let steps=0;
  while(acc>=1/SIMULATION_HZ&&steps++<6){for(const room of rooms.values())room.tick(1/SIMULATION_HZ);acc-=1/SIMULATION_HZ;}
  if(steps>0)for(const room of rooms.values())if(room.tickNumber-(lastBroadcast.get(room.code)||0)>=2){lastBroadcast.set(room.code,room.tickNumber);broadcast(room,room.snapshot());}
 },25);loop.unref?.();
 const checkpoint=setInterval(()=>{for(const room of rooms.values())if(room.kind==='expedition'){if(room.phase==='results'&&room.rewardStatus!=='settled')onComplete(room);try{store.save(room);}catch(e){persistenceError=e.message;}}},5000);checkpoint.unref?.();
 const cleanup=setInterval(()=>{const now=Date.now();for(const [code,room]of rooms){room.expire(now);if(room.participants.length===0&&now-room.lastActivity>120000&&!settlement.has(code)){rooms.delete(code);lastBroadcast.delete(code);store.removeRoom(code);}}},15000);cleanup.unref?.();
 return {server,rooms,clients,store,get persistenceError(){return persistenceError;},
  async listen(){if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,()=>{server.off('error',fail);ok();});});return server.address();},
  async close(){if(stopping)return;stopping=true;clearInterval(loop);clearInterval(checkpoint);clearInterval(cleanup);await Promise.allSettled([...clients].map(c=>c.queue));await Promise.allSettled([...settlement.values()]);for(const room of rooms.values())if(room.kind==='expedition')await store.save(room);for(const c of [...clients])c.socket.terminate();await new Promise((ok,fail)=>{server.close(e=>e?fail(e):ok());for(const socket of sockets)socket.destroy();server.closeAllConnections?.();});store.close();}
 };
}
