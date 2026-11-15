import test from 'node:test';import assert from 'node:assert/strict';import {createGameServer} from '../server/online-server.mjs';import {createGateway} from '../server/gateway.mjs';import {wsClient} from './helpers/ws-client.mjs';
const key='test-cluster-key-with-32-characters-minimum';
test('two gateway-routed workers create separate rooms and share durable profile identity',async(t)=>{
 const gateway=createGateway({host:'127.0.0.1',port:0,key}),port=(await gateway.listen()).port,workers=[],clients=[];
 for(const id of ['00','01']){const server=createGameServer({host:'127.0.0.1',port:0,workerId:id,clusterKey:key,profileServiceUrl:`http://127.0.0.1:${port}`});const at=await server.listen();workers.push({id,server,url:`http://127.0.0.1:${at.port}`});}gateway.setWorkers(workers);
 t.after(async()=>{clients.forEach(c=>c.close());for(const w of workers)await w.server.close();await gateway.close();});
 const rooms=[];let profileToken,profileId;
 for(let i=0;i<2;i++){
  const c=wsClient(port);clients.push(c);await c.waitFor('hello');c.send({kind:'join',mode:'expedition',team:0,role:0,profileToken});const joined=await c.waitFor('joined'),profile=await c.waitFor('profile');rooms.push(joined.room);assert.equal(joined.room.length,8);if(!profileToken){profileToken=profile.profileToken;profileId=profile.profile.id;}else assert.equal(profile.profile.id,profileId);
 }
 assert.notEqual(rooms[0].slice(0,2),rooms[1].slice(0,2),'new rooms distribute across workers');
 for(let i=0;i<2;i++){
  const c=wsClient(port);clients.push(c);await c.waitFor('hello');c.send({kind:'join',mode:'expedition',room:rooms[i],team:1,role:0});await c.waitFor('joined');
  const own=workers.find(w=>w.id===rooms[i].slice(0,2)).server.rooms.get(rooms[i]);assert.equal(own.occupied,2);
 }
 const health=await(await fetch(`http://127.0.0.1:${port}/api/health`)).json();assert.equal(health.rooms,2);assert.equal(health.players,4);assert.equal(health.workers.length,2);
 const forbidden=wsClient(Number(new URL(workers[0].url).port));clients.push(forbidden);assert.equal((await forbidden.waitFor('handshake')).status,'403');
});
