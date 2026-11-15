// Stateless room affinity at the edge. The first two room-code characters select a stable worker ID.
// Multiple gateways may use the same worker map and durable profile coordinator.
import {createServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {randomBytes} from 'node:crypto';
import {WebSocket} from 'ws';
import {acceptWebSocket} from './ws.mjs';
import {ProgressionStore} from './progression-store.mjs';
import {FederatedStore} from './federated-store.mjs';
import {createAccountHandler} from './account-http.mjs';
import {sendJSON,createProfileRPC,trustedHeader} from './internal-rpc.mjs';
export function createGateway({port=8095,host='0.0.0.0',key,workers=[],storePath=':memory:',profileServiceUrl,allowedOrigins=[],tls}={}){
 if(typeof key!=='string'||key.length<32)throw Error('A cluster key with at least 32 characters is required');
 const store=profileServiceUrl?new FederatedStore(storePath,profileServiceUrl,key):new ProgressionStore(storePath),clients=new Set(),connections=new Set();let pool=[],cursor=0;
 function setWorkers(next){const ids=new Set();pool=next.map(w=>{if(!/^[0-9A-Z]{2}$/.test(w.id)||ids.has(w.id))throw Error('Worker IDs must be unique two-character codes');ids.add(w.id);const url=new URL(w.url);if(!['http:','https:'].includes(url.protocol))throw Error('Worker URLs must use HTTP or HTTPS');return {id:w.id,url:url.href.replace(/\/$/,'')};});}
 setWorkers(workers);const accounts=createAccountHandler(store,{allowedOrigins}),rpc=createProfileRPC(store,key);
 async function healthyWorkers(){const results=await Promise.all(pool.map(async w=>{try{const r=await fetch(w.url+'/api/health',{signal:AbortSignal.timeout(1500)});if(!r.ok)return null;return {...w,...await r.json()};}catch{return null;}}));return results.filter(Boolean);}
 function proxy(req,res,worker){
  const url=new URL(req.url,worker.url),request=url.protocol==='https:'?httpsRequest:httpRequest;
  const outgoing=request(url,{method:req.method,headers:{...req.headers,host:url.host,'x-tminus-cluster':key}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
  outgoing.on('error',()=>{if(!res.headersSent)sendJSON(res,503,{error:'Worker unavailable'});else res.destroy();});req.pipe(outgoing);res.on('close',()=>outgoing.destroy());
 }
 const handler=async(req,res)=>{
  let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{sendJSON(res,400,{error:'Invalid URL'});return;}
  if(path.startsWith('/internal/')&&!trustedHeader(req,key)){sendJSON(res,403,{error:'Forbidden'});return;}
  if(await rpc(req,res,path))return;
  if(await accounts(req,res,path))return;
  if(path==='/api/health'){const active=await healthyWorkers();sendJSON(res,active.length?200:503,{service:'T-MINUS gateway',version:'5.7.0',workers:active.map(w=>({id:w.id,rooms:w.rooms,players:w.players})),rooms:active.reduce((n,w)=>n+w.rooms,0),players:active.reduce((n,w)=>n+w.players,0)});return;}
  if(!pool.length){sendJSON(res,503,{error:'No game workers available'});return;}proxy(req,res,pool[0]);
 };
 const server=tls?createHttpsServer(tls,(req,res)=>handler(req,res).catch(()=>sendJSON(res,500,{error:'Gateway request failed'}))):createServer((req,res)=>handler(req,res).catch(()=>sendJSON(res,500,{error:'Gateway request failed'})));
 server.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{
  const link={client:null,upstream:null,joining:false,closed:false};
  const client=acceptWebSocket(req,socket,head,{allowedOrigins,onMessage:async raw=>{
   if(link.upstream?.readyState===WebSocket.OPEN){link.upstream.send(raw);return;}
   if(link.joining)return;let m;try{m=JSON.parse(raw);}catch{client.send({kind:'error',message:'Malformed JSON'});return;}
   if(!['join','matchmake'].includes(m?.kind))return;link.joining=true;
   try{
    let worker,room=typeof m.room==='string'?m.room.trim().toUpperCase():'';
    if(m.kind==='matchmake'){
     const choices=await Promise.all(pool.map(async w=>{try{const r=await fetch(w.url+'/internal/lobbies',{headers:{'x-tminus-cluster':key},signal:AbortSignal.timeout(1500)});return {worker:w,rooms:(await r.json()).rooms||[]};}catch{return {worker:w,rooms:[]};}}));
     const open=choices.flatMap(w=>w.rooms.map(r=>({...r,worker:w.worker}))).sort((a,b)=>b.occupied-a.occupied)[0];
     if(open){worker=open.worker;room=open.code;m.team=[0,1,2,3].sort((a,b)=>open.counts[a]-open.counts[b])[0];}
     m.kind='join';m.mode='expedition';
    }
    let create=false;
    if(room){if(!/^[A-Z0-9]{8}$/.test(room)){client.send({kind:'error',message:'Use an eight-character room code from this cluster'});link.joining=false;return;}worker??=pool.find(w=>w.id===room.slice(0,2));if(!worker){client.send({kind:'error',message:'Room worker not available'});link.joining=false;return;}}
    else{const active=await healthyWorkers();if(!active.length)throw Error('No game worker is available');const min=Math.min(...active.map(w=>w.rooms)),least=active.filter(w=>w.rooms===min);worker=least[cursor++%least.length];room=worker.id+randomBytes(3).toString('hex').toUpperCase();create=true;}
    if(link.closed)return;const target=new URL('/ws',worker.url);target.protocol=target.protocol==='https:'?'wss:':'ws:';
    const upstream=new WebSocket(target,{origin:new URL(worker.url).origin,headers:{'x-tminus-cluster':key},perMessageDeflate:false,maxPayload:65536});link.upstream=upstream;
    upstream.on('message',(data,binary)=>{if(binary)return;let packet;try{packet=JSON.parse(data.toString());}catch{return;}if(packet.kind==='hello'){upstream.send(JSON.stringify({...m,kind:'join',room,create}));return;}client.send(packet);});
    upstream.on('error',()=>{if(!link.closed)client.send({kind:'error',message:'Room worker unavailable. Your seat remains reserved for reconnection.'});});
    upstream.on('close',()=>{if(!link.closed)client.close(1012,'Reconnect to your room');});
   }catch(e){client.send({kind:'error',message:e.message?.slice(0,140)||'Gateway unavailable'});link.joining=false;}
  },onClose:()=>{link.closed=true;clients.delete(link);link.upstream?.close();}});
  if(!client)return;link.client=client;clients.add(link);client.send({kind:'hello',version:1,message:'T-MINUS clustered gateway connected'});
 });
 return {server,store,setWorkers,get workers(){return pool;},async listen(){await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,()=>{server.off('error',fail);ok();});});return server.address();},async close(){for(const c of clients){c.closed=true;c.upstream?.terminate();c.client.terminate();}await new Promise((ok,fail)=>{server.close(e=>e?fail(e):ok());for(const socket of connections)socket.destroy();server.closeAllConnections?.();});store.close();}};
}
