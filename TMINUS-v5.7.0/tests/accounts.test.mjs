import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {ProgressionStore} from '../server/progression-store.mjs';import {createGameServer} from '../server/online-server.mjs';
test('guest progress survives account claim, login on another device, restart and recovery-key rotation',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'tminus-account-'));let store=new ProgressionStore(join(folder,'profiles.sqlite'));
 try{const guest=store.identity();store.db.prepare('UPDATE profiles SET xp=760,credits=200 WHERE id=?').run(guest.profile.id);const claimed=await store.register(guest.token,'finn_pilot','correctHorseBattery1!');assert.equal(claimed.profile.id,guest.profile.id);assert.equal(claimed.profile.xp,760);assert.equal(store.authenticate(guest.token),null,'claim revokes the old anonymous key');
  const secret=store.db.prepare('SELECT * FROM profiles WHERE id=?').get(guest.profile.id);assert.notEqual(secret.password_hash,'correctHorseBattery1!');assert.notEqual(secret.recovery_hash,claimed.recoveryCode);
  const login=await store.login('FINN_PILOT','correctHorseBattery1!');assert.equal(login.profile.id,guest.profile.id);await assert.rejects(()=>store.login('finn_pilot','wrong password'),/Invalid/);
  store.close();store=new ProgressionStore(join(folder,'profiles.sqlite'));assert.equal(store.authenticate(login.profileToken).id,guest.profile.id);
  const result=await store.recoverAccount('finn_pilot',claimed.recoveryCode,'newCorrectHorsePass2!');assert.equal(store.authenticate(login.profileToken),null);assert.equal(store.authenticate(result.profileToken).xp,760);
  await assert.rejects(()=>store.recoverAccount('finn_pilot',claimed.recoveryCode,'oldKeyMustFailPassword!'),/Invalid/);await assert.rejects(()=>store.login('finn_pilot','correctHorseBattery1!'),/Invalid/);assert.equal((await store.login('finn_pilot','newCorrectHorsePass2!')).profile.id,guest.profile.id);
 }finally{store.close();await rm(folder,{recursive:true,force:true});}
});
test('concurrent uses of a recovery key cannot reset an account twice',async()=>{
 const store=new ProgressionStore();try{const a=await store.register(null,'barbara','aPasswordLongEnough1!');const results=await Promise.allSettled([store.recoverAccount('barbara',a.recoveryCode,'secondPassword111!'),store.recoverAccount('barbara',a.recoveryCode,'thirdPassword222!')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);}finally{store.close();}
});
test('account HTTP endpoints validate credentials and CORS without exposing password fields',async(t)=>{
 const s=createGameServer({host:'127.0.0.1',port:0,allowedOrigins:['https://frontend.example']});const port=(await s.listen()).port;t.after(()=>s.close());const url=`http://127.0.0.1:${port}`;
 let response=await fetch(url+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://frontend.example'},body:JSON.stringify({username:'chip_engineer',password:'LongEnginePassword1!'})});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://frontend.example');const account=await response.json();assert.ok(account.recoveryCode);assert.equal(account.profile.password_hash,undefined);
 response=await fetch(url+'/api/account/me',{headers:{Authorization:'Bearer '+account.profileToken}});assert.equal((await response.json()).profile.username,'chip_engineer');
 response=await fetch(url+'/api/account/login',{method:'POST',headers:{Origin:'https://untrusted.example'},body:'{}'});assert.equal(response.status,403);
 response=await fetch(url+'/api/account/logout',{method:'POST',headers:{Authorization:'Bearer '+account.profileToken},body:'{}'});assert.equal(response.status,200);response=await fetch(url+'/api/account/me',{headers:{Authorization:'Bearer '+account.profileToken}});assert.equal(response.status,401);
});
