// Workers keep local room checkpoints; account/progression traffic goes to the durable coordinator.
import {ProgressionStore} from './progression-store.mjs';
export class FederatedStore {
 constructor(path,url,key){this.local=new ProgressionStore(path);this.url=new URL(url);if(!['http:','https:'].includes(this.url.protocol))throw Error('Invalid profile service URL');if(!key||key.length<32)throw Error('Cluster key must contain at least 32 characters');this.key=key;}
 async call(method,data){const response=await fetch(new URL('/internal/profiles/'+method,this.url),{method:'POST',headers:{'Content-Type':'application/json','x-tminus-cluster':this.key},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});const body=await response.json();if(!response.ok)throw Error(body.error||'Profile service unavailable');return body.result;}
 identity(token){return this.call('identity',{token});}authenticate(token){return this.call('authenticate',{token});}get(id){return this.call('get',{id});}equip(id,cosmetic){return this.call('equip',{id,cosmetic});}
 register(token,username,password){return this.call('register',{token,username,password});}login(username,password){return this.call('login',{username,password});}recoverAccount(username,recoveryCode,password){return this.call('recoverAccount',{username,recoveryCode,password});}logout(token){return this.call('logout',{token});}
 settle(room){return this.call('settle',{matchId:room.matchId,players:[...room.players.values()].map(p=>({id:p.id,profileId:p.profileId,team:p.team,contribution:p.contribution})),teams:room.science.teams.map(t=>({delivered:t.delivered}))});}
 save(room){return this.local.save(room);}recover(){return this.local.recover();}removeRoom(code){return this.local.removeRoom(code);}close(){this.local.close();}
}
