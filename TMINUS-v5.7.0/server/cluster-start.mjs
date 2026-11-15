import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createGateway} from './gateway.mjs';
const key=process.env.CLUSTER_KEY||randomBytes(32).toString('base64url'),data=process.env.DATA_DIR||'data';
if(!!process.env.TLS_CERT!==!!process.env.TLS_KEY)throw Error('Set both TLS_CERT and TLS_KEY');
const tls=process.env.TLS_CERT?{cert:await readFile(process.env.TLS_CERT),key:await readFile(process.env.TLS_KEY)}:undefined;
const external=process.env.CLUSTER_WORKERS?JSON.parse(process.env.CLUSTER_WORKERS):null,count=Number(process.env.WORKERS||2);
if(external&&!process.env.CLUSTER_KEY)throw Error('External workers require a shared CLUSTER_KEY');
if(!external&&(!Number.isInteger(count)||count<1||count>16))throw Error('WORKERS must be 1–16');
const gateway=createGateway({port:Number(process.env.PORT||8095),host:process.env.HOST||'0.0.0.0',key,storePath:join(data,'profiles.sqlite'),profileServiceUrl:process.env.PROFILE_SERVICE_URL,allowedOrigins:(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),workers:external||[],tls});
const address=await gateway.listen(),children=new Map(),descriptors=new Map(),timers=new Set();let closing=false;
async function stop(){if(closing)return;closing=true;for(const timer of timers)clearTimeout(timer);await Promise.all([...children.values()].map(child=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');setTimeout(()=>{child.kill('SIGKILL');resolve();},10000).unref();})));await gateway.close();}
function startWorker(id,attempt=0){return new Promise((resolve,reject)=>{
 let ready=false;const child=fork(new URL('./cluster-worker.mjs',import.meta.url),[],{env:{...process.env,WORKER_ID:id,PORT:'0',HOST:'127.0.0.1',CLUSTER_KEY:key,DATA_DIR:data,PROFILE_SERVICE_URL:process.env.PROFILE_SERVICE_URL||`${tls?'https':'http'}://localhost:${address.port}`},stdio:['inherit','inherit','inherit','ipc']});children.set(id,child);
 child.once('error',reject);child.once('message',m=>{if(!m.ready)return;ready=true;descriptors.set(id,{id,url:`http://127.0.0.1:${m.port}`});gateway.setWorkers([...descriptors.values()]);process.send?.({kind:'worker-ready',id,pid:child.pid});resolve();});
 child.once('exit',()=>{children.delete(id);descriptors.delete(id);if(closing)return;gateway.setWorkers([...descriptors.values()]);if(!ready){reject(Error('Worker '+id+' startup failed'));return;}
  const timer=setTimeout(()=>{timers.delete(timer);startWorker(id,attempt+1).catch(e=>{console.error(e.message);stop().then(()=>{process.exitCode=1;});});},Math.min(30000,1000*2**Math.min(attempt,5)));timers.add(timer);console.error('Worker '+id+' stopped; recovering its durable rooms');
 });
});}
try{if(!external)await Promise.all(Array.from({length:count},(_,i)=>startWorker(i.toString(36).toUpperCase().padStart(2,'0'))));
 process.send?.({kind:'ready',port:address.port,workers:[...children].map(([id,child])=>({id,pid:child.pid}))});
 console.log(`T-MINUS v5.7.0 clustered service · ${tls?'https':'http'}://localhost:${address.port} · ${gateway.workers.length} room workers`);
}catch(error){await stop();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop().then(()=>process.exit(0)));
