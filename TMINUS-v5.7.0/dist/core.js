export const ROLES=[
{id:0,name:'PILOT',color:'#b7a0f3',icon:'✧',job:'Hull frame',weapon:'Pulse carbine',mag:24,damage:15,rate:.17,reload:1.45,speed:6.4,skill:'Afterburner',alt:'Holo decoy',ultimate:'Time dilation',qCD:7,altCD:9},
{id:1,name:'ENGINEER',color:'#9cdeb1',icon:'⌬',job:'Power core',weapon:'Arc projector',mag:18,damage:20,rate:.25,reload:1.8,speed:5.7,skill:'Repair sentry',alt:'Repair burst',ultimate:'Nanite storm',qCD:14,altCD:10},
{id:2,name:'GUNNER',color:'#ed919d',icon:'⌖',job:'Comms array',weapon:'Vulcan repeater',mag:48,damage:10,rate:.095,reload:2.2,speed:5.3,skill:'Combat turret',alt:'Frag grenade',ultimate:'Overdrive',qCD:16,altCD:7},
{id:3,name:'LOADER',color:'#edbd81',icon:'⬡',job:'Fuel tanks',weapon:'Scatter cannon',mag:8,damage:11,rate:.68,reload:2,speed:5.5,skill:'Supply drop',alt:'Shockwave',ultimate:'Orbital barrage',qCD:12,altCD:9}
];
export function makeCrew(){return ROLES.map(r=>({id:r.id,hp:100,ammo:r.mag,reloading:0,shotCD:0,qCD:0,altCD:0,dodgeCD:0,charge:35,buff:0,shield:0,stamina:100}));}
export function makeMission(){return {phase:'build',active:0,paused:false,time:180,hull:100,fuel:100,kills:0,elapsed:0,installed:0,captured:0,distance:0,score:0,won:false,ended:false,slow:0,decoy:0,buildProgress:[0,0,0,0],captureProgress:[0,0,0]};}
export function tickCrew(c,dt){for(const field of ['shotCD','qCD','altCD','dodgeCD','buff','shield'])c[field]=Math.max(0,c[field]-dt);if(c.reloading>0){c.reloading=Math.max(0,c.reloading-dt);if(c.reloading===0)c.ammo=ROLES[c.id].mag;}c.charge=Math.min(100,c.charge+dt*.55);}
export function reload(c){if(c.reloading>0||c.ammo===ROLES[c.id].mag)return false;c.reloading=ROLES[c.id].reload;return true;}
export function fire(c){if(c.shotCD>0||c.reloading>0)return false;if(c.ammo<=0){reload(c);return false;}const overdrive=c.id===2&&c.buff>0;if(!overdrive)c.ammo--;c.shotCD=ROLES[c.id].rate*(overdrive?.6:1);return true;}
export function ability(c,slot){const r=ROLES[c.id];if(slot==='q'){if(c.qCD>0)return false;c.qCD=r.qCD;return true;}if(slot==='alt'){if(c.altCD>0)return false;c.altCD=r.altCD;return true;}if(slot==='f'){if(c.charge<100)return false;c.charge=0;return true;}if(slot==='dodge'){if(c.dodgeCD>0||c.stamina<20)return false;c.dodgeCD=3.5;c.shield=.55;c.stamina-=20;return true;}return false;}
export function nextPhase(m){if(m.ended)return false;if(m.phase==='build'){if(m.installed<4)return false;m.phase='space';m.time=70;m.distance=0;}else if(m.phase==='space'){m.phase='surface';m.time=150;}else if(m.phase==='surface'){if(m.captured<3)return false;m.phase='return';m.time=42;m.distance=0;}else if(m.phase==='return'){m.ended=true;m.won=true;m.score+=1000;}return true;}
export function advanceProgress(list,index,amount){if(list[index]>=1)return false;list[index]=Math.min(1,list[index]+amount);return list[index]>=1;}
export function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
export function normalizeMove(x,z){const length=Math.hypot(x,z);return length?{x:x/length,z:z/length}:{x:0,z:0};}
