// Dependency-free local HTTP server. Native ES modules and .glb assets require HTTP.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const dist = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const argIndex=process.argv.indexOf('--port');
const port = argIndex>=0 ? Number(process.argv[argIndex+1]) : Number(process.env.PORT || 8095);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const types={
 '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
 '.glb':'model/gltf-binary', '.fbx':'application/octet-stream',
 '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
 '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2',
 '.txt':'text/plain; charset=utf-8'
};
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 const file=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(file!==dist && !file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
 try{
  const info=await stat(file);
  if(!info.isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream',
    'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});
server.on('error',e=>{console.error(`Unable to start T-MINUS local server: ${e.message}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`T-MINUS Phase 4 v5.4.0: http://localhost:${port}`));
