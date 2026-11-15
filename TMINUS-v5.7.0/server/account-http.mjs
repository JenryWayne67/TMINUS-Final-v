// Same-origin account API. Passwords are scrypt hashed; recovery keys are single-use.
export function createAccountHandler(store,{allowedOrigins=[]}={}){
 const attempts=new Map();let busy=0;
 return async function(req,res,path){
  if(!path.startsWith('/api/account/'))return false;
  const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  const origin=req.headers.origin;let same=false;try{same=new URL(origin).host===req.headers.host;}catch{}
  if(origin&&!same&&!allowedOrigins.includes(origin)){reply(403,{error:'Origin not allowed'});return true;}
  if(origin&&(same||allowedOrigins.includes(origin))){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true;}
  const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(req.method==='GET'&&path==='/api/account/me'){const profile=await store.authenticate(bearer);reply(profile?200:401,profile?{profile}:{error:'Sign in required'});return true;}
  if(req.method!=='POST'){reply(405,{error:'POST required'});return true;}
  const ip=req.socket.remoteAddress||'unknown',now=Date.now(),history=(attempts.get(ip)||[]).filter(t=>now-t<60000);if(history.length>=12||busy>=4){reply(429,{error:'Please wait before trying again'});return true;}history.push(now);attempts.set(ip,history);if(attempts.size>1000)for(const [key,times]of attempts)if(now-times[times.length-1]>60000)attempts.delete(key);
  let data='';try{for await(const part of req){data+=part;if(Buffer.byteLength(data)>4096){reply(413,{error:'Request too large'});return true;}}data=JSON.parse(data||'{}');if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request');}catch{reply(400,{error:'Invalid request'});return true;}
  busy++;try{
   let result;
   if(path==='/api/account/register')result=await store.register(bearer,data.username,data.password);
   else if(path==='/api/account/login')result=await store.login(data.username,data.password);
   else if(path==='/api/account/recover')result=await store.recoverAccount(data.username,data.recoveryCode,data.password);
   else if(path==='/api/account/logout'){await store.logout(bearer);result={ok:true};}
   else {reply(404,{error:'Account action not found'});return true;}
   reply(200,result);
  }catch(e){reply(400,{error:e.message?.slice(0,160)||'Account request failed'});}finally{busy--;}
  return true;
 };
}
