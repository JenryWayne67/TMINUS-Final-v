// RFC 6455 transport with negotiated compression, bounded queues and heartbeat.
import {WebSocketServer,WebSocket} from 'ws';
const server=new WebSocketServer({noServer:true,clientTracking:false,maxPayload:65536,maxFragments:128,maxBufferedChunks:1024,perMessageDeflate:{threshold:1024,concurrencyLimit:4,serverNoContextTakeover:true,clientNoContextTakeover:true,zlibDeflateOptions:{level:3,memLevel:7}}});
export function acceptWebSocket(req,socket,head,{onMessage,onClose,allowedOrigins=[],heartbeat=true}={}){
 let uri;try{uri=new URL(req.url,'http://localhost');}catch{return null;}
 const origin=req.headers.origin,host=req.headers.host?.toLowerCase();let same=false;try{same=new URL(origin).host.toLowerCase()===host;}catch{}
 if(uri.pathname!=='/ws'||!origin||!(same||allowedOrigins.includes(origin))||req.headers['sec-websocket-version']!=='13'||!/^([A-Za-z0-9+/]{22}==)$/.test(req.headers['sec-websocket-key']||'')){
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return null;
 }
 let api=null;
 server.handleUpgrade(req,socket,head,ws=>{
  socket.setNoDelay(true);let closed=false,lastPong=Date.now(),counter=0,lastSecond=Date.now(),timer;
  const done=()=>{if(closed)return;closed=true;clearInterval(timer);onClose?.();};
  api={get closed(){return closed;},send(data){if(closed||ws.readyState!==WebSocket.OPEN)return false;const text=JSON.stringify(data);if(Buffer.byteLength(text)>65536)return false;if(ws.bufferedAmount>512*1024){api.close(1009,'Slow reader');return false;}ws.send(text,{compress:true},error=>{if(error)api.terminate();});return true;},terminate(){ws.terminate();done();},close(code=1000,reason=''){if(closed)return;ws.close(code,reason.slice(0,80));done();}};
  ws.on('pong',()=>lastPong=Date.now());ws.on('close',done);ws.on('error',()=>{ws.terminate();done();});
  ws.on('message',(data,binary)=>{
   if(binary){api.close(1003,'Text JSON required');return;}if(Date.now()-lastSecond>=1000){counter=0;lastSecond=Date.now();}if(++counter>80){api.close(1008,'Rate limit');return;}
   try{onMessage?.(data.toString('utf8'),api);}catch{api.send({kind:'error',message:'Invalid message'});}
  });
  if(heartbeat){timer=setInterval(()=>{if(Date.now()-lastPong>65000){api.close(1001,'Timeout');return;}if(ws.readyState===WebSocket.OPEN)ws.ping();},25000);timer.unref?.();}
 });return api;
}
