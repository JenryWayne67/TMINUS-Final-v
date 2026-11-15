import {createGameServer} from './online-server.mjs';
import {join} from 'node:path';
const workerId=process.env.WORKER_ID;if(!/^[A-Z0-9]{2}$/.test(workerId||''))throw Error('WORKER_ID must be a stable two-character code');
const service=createGameServer({port:Number(process.env.PORT||0),host:process.env.HOST||'127.0.0.1',workerId,clusterKey:process.env.CLUSTER_KEY,profileServiceUrl:process.env.PROFILE_SERVICE_URL,storePath:join(process.env.DATA_DIR||'data','worker-'+workerId+'.sqlite')});
const address=await service.listen();process.send?.({ready:true,id:workerId,port:address.port});if(!process.send)console.log('T-MINUS worker '+workerId+' listening on '+address.port);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit(0)));
