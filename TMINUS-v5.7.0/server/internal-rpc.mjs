import {timingSafeEqual} from 'node:crypto';
export function trustedHeader(req,key){const got=req.headers['x-tminus-cluster'];if(!key||typeof got!=='string')return false;const a=Buffer.from(got),b=Buffer.from(key);return a.length===b.length&&timingSafeEqual(a,b);}
export async function readJSON(req,max=65536){let bytes=0,raw='';for await(const part of req){bytes+=part.length;if(bytes>max)throw Error('Request too large');raw+=part;}const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid JSON request');return value;}
export const sendJSON=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function createProfileRPC(store,key){return async(req,res,path)=>{
 if(!path.startsWith('/internal/profiles/'))return false;
 if(!trustedHeader(req,key)){sendJSON(res,403,{error:'Forbidden'});return true;}
 if(req.method!=='POST'){sendJSON(res,405,{error:'POST required'});return true;}
 try{const data=await readJSON(req),method=path.split('/').pop();let result;
  if(method==='identity')result=await store.identity(data.token);
  else if(method==='authenticate')result=await store.authenticate(data.token);
  else if(method==='get')result=await store.get(data.id);
  else if(method==='equip')result=await store.equip(data.id,data.cosmetic);
  else if(method==='register')result=await store.register(data.token,data.username,data.password);
  else if(method==='login')result=await store.login(data.username,data.password);
  else if(method==='recoverAccount')result=await store.recoverAccount(data.username,data.recoveryCode,data.password);
  else if(method==='logout')result=await store.logout(data.token);
  else if(method==='settle'){if(typeof data.matchId!=='string'||!Array.isArray(data.players)||data.players.length>16||!Array.isArray(data.teams)||data.teams.length!==4)throw Error('Invalid settlement');const room={matchId:data.matchId,players:new Map(data.players.map(p=>[p.id,p])),science:{teams:data.teams}};await store.settle(room);result={ok:true};}
  else{sendJSON(res,404,{error:'Not found'});return true;}
  sendJSON(res,200,{result});
 }catch(e){sendJSON(res,400,{error:e.message?.slice(0,160)||'Request failed'});}return true;
 };}
