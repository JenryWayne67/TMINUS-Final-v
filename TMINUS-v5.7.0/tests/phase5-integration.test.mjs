// Real TCP/WebSocket integration: no fake websocket, browser mocks, or third-party deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {createGameServer} from '../server/online-server.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function framed(payload){
 const data=Buffer.from(JSON.stringify(payload)),mask=Buffer.from([0x19,0x23,0x37,0x42]);
 const header=data.length<126?6:data.length<=65535?8:14;
 const b=Buffer.alloc(header+data.length);b[0]=0x81;
 if(header===6)b[1]=0x80|data.length;
 else if(header===8){b[1]=0xfe;b.writeUInt16BE(data.length,2);}
 else{b[1]=0xff;b.writeBigUInt64BE(BigInt(data.length),2);}
 mask.copy(b,header-4);
 for(let i=0;i<data.length;i++)b[header+i]=data[i]^mask[i%4];return b;
}
function wsClient(port,{origin=`http://127.0.0.1:${port}`}={}){
 const socket=net.connect(port,'127.0.0.1');let buf=Buffer.alloc(0),handshake='',ready=false,closed=false;
 const queue=[],waiters=[];
 const emit=data=>{queue.push(data);for(let i=waiters.length-1;i>=0;i--){const w=waiters[i];if(w.matches(data)){waiters.splice(i,1);clearTimeout(w.timer);w.resolve(data);}}};
 socket.on('data',chunk=>{
  buf=Buffer.concat([buf,chunk]);
  if(!ready){const end=buf.indexOf('\r\n\r\n');if(end<0)return;
   handshake=buf.subarray(0,end+4).toString();buf=buf.subarray(end+4);ready=true;
   emit({kind:'handshake',status:handshake.split(' ')[1],header:handshake});
  }
  while(buf.length>=2){
   const op=buf[0]&15;let len=buf[1]&127,at=2;
   if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);at=4;}
   else if(len===127){if(buf.length<10)return;const n=buf.readBigUInt64BE(2);if(n>65536n)throw Error('oversize test frame');len=Number(n);at=10;}
   if(buf.length<at+len)return;
   const bytes=buf.subarray(at,at+len);buf=buf.subarray(at+len);
   if(op===1){try{emit(JSON.parse(bytes.toString()));}catch(e){emit({kind:'bad-json'});}}
   else if(op===8)emit({kind:'close'});
  }
 });
 socket.on('close',()=>{closed=true;emit({kind:'socket-closed'});});
 socket.on('error',e=>emit({kind:'socket-error',error:e.message}));
 const head=`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n${origin?`Origin: ${origin}\r\n`:''}\r\n`;
 socket.once('connect',()=>socket.write(head));
 return {
  get closed(){return closed;},socket,
  send(x){socket.write(framed(x));},
  waitFor(kind,predicate=()=>true,timeout=2500){
   const prior=queue.find(m=>m.kind===kind&&predicate(m));if(prior)return Promise.resolve(prior);
   return new Promise((resolve,reject)=>{
    const w={matches:m=>m.kind===kind&&predicate(m),resolve,timer:null};
    w.timer=setTimeout(()=>{const at=waiters.indexOf(w);if(at>=0)waiters.splice(at,1);reject(Error(`Timed out waiting for ${kind}`));},timeout);
    waiters.push(w);
   });
  },
  close(){socket.destroy();}
 };
}

test('HTTP server and real WebSocket clients share server-owned room, movement, phases and recovery',async(t)=>{
 const service=createGameServer({host:'127.0.0.1',port:0,durations:{build:4,flight:1,surface:4,return:1,delivery:4}});
 const addr=await service.listen();const port=addr.port;
 const clients=[];t.after(async()=>{clients.forEach(c=>c.close());await service.close();});
 const health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
 assert.equal(health.version,'5.7.0');assert.equal(health.rooms,0);
 const html=await fetch(`http://127.0.0.1:${port}/online.html`);assert.equal(html.status,200);
 assert.match(await html.text(),/FOUR TEAMS/);
 assert.match((await (await fetch(`http://127.0.0.1:${port}/online.js`)).text()),/new WebSocket/);
 const c1=wsClient(port),c2=wsClient(port);clients.push(c1,c2);
 assert.equal((await c1.waitFor('handshake')).status,'101');
 assert.equal((await c2.waitFor('handshake')).status,'101');
 await c1.waitFor('hello');await c2.waitFor('hello');
 c1.send({kind:'join',name:'ALPHA',team:0,role:0});
 const j1=await c1.waitFor('joined');assert.ok(j1.token);assert.equal(j1.room.length,6);
 c2.send({kind:'join',room:j1.room,name:'BRAVO',team:1,role:2});
 const j2=await c2.waitFor('joined');assert.notEqual(j2.id,j1.id);
 const both=await c1.waitFor('snapshot',m=>m.players.some(p=>p.id===j2.id));
 assert.equal(both.players.length,2);
 c2.send({kind:'start'});assert.match((await c2.waitFor('error')).message,/host/i);
 c1.send({kind:'ready',value:true});c2.send({kind:'ready',value:true});
 await c1.waitFor('snapshot',m=>m.players.filter(p=>p.ready).length===2);
 c1.send({kind:'start'});
 const started=await c1.waitFor('snapshot',m=>m.phase==='build');assert.equal(started.phase,'build');
 const room=service.rooms.get(j1.room);assert.equal(room.participants.length,2);
 c1.send({kind:'input',v:1,sequence:1,strafe:1,forward:0,buttons:0,aim:Math.PI/2,x:1000000,delivered:999});
 await sleep(180);
 const p=room.players.get(j1.id);assert.ok(p.x<1000);assert.equal(p.sequence,1);
 c1.send({kind:'input',v:1,sequence:1,strafe:0,forward:0,buttons:0,aim:0});
 await sleep(70);assert.equal(p.sequence,1,'replayed packet cannot reset movement');
 c1.send({kind:'chat',text:'hello crewmate'});
 assert.equal((await c2.waitFor('chat',m=>m.text==='hello crewmate')).name,'ALPHA');
 c1.close();await sleep(65);assert.equal(room.players.get(j1.id).connected,false);
 const c3=wsClient(port);clients.push(c3);await c3.waitFor('hello');
 c3.send({kind:'join',room:j1.room,token:j1.token,name:'impostor'});
 const resumed=await c3.waitFor('joined');assert.equal(resumed.id,j1.id);assert.equal(resumed.resumed,true);
 const live=await c2.waitFor('snapshot',m=>m.players.find(p=>p.id===j1.id)?.connected===true);
 assert.equal(live.players.length,2);
 await c3.waitFor('snapshot',m=>m.phase==='surface',5500);
 assert.ok(room.tickNumber>0);
 const latest=room.snapshot();assert.equal(latest.kind,'snapshot');
 assert.ok(latest.sites.length===12);
 assert.ok(!latest.players.some(p=>p.x===1000000));
});

test('WebSocket handshake rejects absent origin and frames cannot be submitted unmasked',async(t)=>{
 const service=createGameServer({host:'127.0.0.1',port:0});const addr=await service.listen();
 const clients=[];t.after(async()=>{clients.forEach(c=>c.close());await service.close();});
 const unauth=wsClient(addr.port,{origin:''});clients.push(unauth);
 assert.equal((await unauth.waitFor('handshake')).status,'403');
 const client=wsClient(addr.port);clients.push(client);
 assert.equal((await client.waitFor('handshake')).status,'101');
 await client.waitFor('hello');
 // Client frames must be masked per RFC6455; unmasked text closes the connection.
 client.socket.write(Buffer.from([0x81,0x02,0x7b,0x7d]));
 assert.equal((await client.waitFor('close')).kind,'close');
});

test('sixteen simultaneous WebSocket players occupy all four crews without bots or duplicate roles',async(t)=>{
 const service=createGameServer({host:'127.0.0.1',port:0});const port=(await service.listen()).port;
 const clients=[];t.after(async()=>{clients.forEach(c=>c.close());await service.close();});
 let code=null,hostId=null;
 for(let team=0;team<4;team++)for(let role=0;role<4;role++){
  const c=wsClient(port);clients.push(c);await c.waitFor('hello');
  c.send({kind:'join',room:code||'',name:`P${team}${role}`,team,role});
  const j=await c.waitFor('joined');code=j.room;
  if(!hostId)hostId=j.id;
  const room=service.rooms.get(code),p=room.players.get(j.id);
  assert.equal(p.team,team);assert.equal(p.role,role);
  c.send({kind:'ready',value:true});
 }
 const room=service.rooms.get(code);assert.equal(room.participants.length,16);
 assert.equal(room.players.size,16);
 assert.equal(room.snapshot().players.filter(p=>p.connected).length,16);
 const extra=wsClient(port);clients.push(extra);await extra.waitFor('hello');
 extra.send({kind:'join',room:code,name:'overflow',team:0,role:0});
 assert.match((await extra.waitFor('error')).message,/full/i);
 await sleep(150);
 clients[0].send({kind:'start'});
 const state=await clients[0].waitFor('snapshot',m=>m.phase==='build');
 assert.equal(state.players.length,16);assert.ok(state.players.every(p=>p.connected));
 assert.equal(state.teams.length,4);
 assert.ok(state.players.some(p=>p.id===hostId));
});
