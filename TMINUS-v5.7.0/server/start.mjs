import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createGameServer} from './online-server.mjs';
const dataDirectory=process.env.DATA_DIR||fileURLToPath(new URL('../data/',import.meta.url));
if(!!process.env.TLS_CERT!==!!process.env.TLS_KEY)throw Error('Set both TLS_CERT and TLS_KEY');
const tls=process.env.TLS_CERT?{cert:await readFile(process.env.TLS_CERT),key:await readFile(process.env.TLS_KEY)}:undefined;
const service=createGameServer({storePath:join(dataDirectory,'progression.sqlite'),tls});
try{const addr=await service.listen();console.log(`T-MINUS v5.7.0 · LIVE ONLINE SERVER ${tls?'https':'http'}://${addr.address}:${addr.port}`);
 console.log('Multiplayer WebSocket endpoint: /ws · deploy this Node process for online play');}
catch(error){console.error('Server could not start:',error);process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit(0)).catch(()=>process.exit(1)));
