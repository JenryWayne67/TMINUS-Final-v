// T-MINUS 5.7.0: real online multiplayer client. No offline bot simulation here.
// Every authoritative transform, action, HP, score and objective is received from Node.
import * as THREE from './vendor/three.module.js';
import {ONLINE_TEAMS as TEAMS,ONLINE_COLORS as COLORS,ONLINE_ROLES as ROLES,ONLINE_MODULES as MODULES,ONLINE_BASES as BASES,ONLINE_MODULE_OFFSETS as MODULE_OFFSETS,ONLINE_SITES as SITES,ONLINE_ROCKS as ROCKS} from './online-constants.js';
import {interpolateSnapshots} from './multiplayer-foundation.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isTyping=()=>['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
const PHASES=['build','flight','surface','return','delivery'];
const screens={lobby:'WAITING FOR CREWS',build:'01 / ASSEMBLE THE SPACECRAFT',flight:'02 / TRANSIT & SYSTEM CHECKS',surface:'03 / SCIENCE EXTRACTION',return:'04 / RETURN TO PLANET A',delivery:'05 / BRING IT HOME',results:'MISSION COMPLETE'};
const phaseCopy={
 lobby:'Join a team, choose your specialist, and prepare to compete.',
 build:'Find the four colored module stations around your ship. Press E three times per module to secure it.',
 flight:'All teams are in transit. Press E beside your ship to stabilize vital systems and restore hull integrity.',
 surface:'Find glowing science samples, press E to collect, and return to your own ship to load. Shoot rival teams and protect your cargo.',
 return:'Returning to Planet A. Carrying a sample is not enough; loaded samples must reach your receiving beacon.',
 delivery:'Approach the upright beacon eight meters to the right of your ship and press E for EACH loaded sample.',
 results:'Delivered samples determine the winner. Your points are verified on the server.'
};

let ws=null,alive=false,joined=false,reconnecting=false,retry=0,id=null,token=null,room=null,latest=null,previous=null,
 receivedAt=0,seq=0,lastHud=0,lastPrediction=0,serverUrl='',manualClose=false,lastEvents=new Set(),shownResult=false;
const keys=new Set(),selfDisplay={x:0,z:0,init:false};let yaw=0,pitch=.67,shooting=false,toastUntil=0,toastText='';
const canvas=$('online-scene');let scene,camera,renderer,root,ground,stars,clock=new THREE.Clock();
const avatars=new Map(),ships=[],terminals=[],beacons=[],samples=[],decor=[];
const shared={};
function mat(color,emissive=0){return new THREE.MeshToonMaterial({color,emissive:color,emissiveIntensity:emissive});}
function obj(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,x,y,z,w,h,d,color){return obj(parent,new THREE.BoxGeometry(w,h,d),mat(color),x,y,z);}
function ball(parent,x,y,z,r,color){return obj(parent,new THREE.IcosahedronGeometry(r,1),mat(color),x,y,z);}
function ring(parent,x,y,z,r,color){const m=obj(parent,new THREE.RingGeometry(r-.06,r,52),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide}),x,y,z);m.rotation.x=-Math.PI/2;m.castShadow=false;return m;}
function cylinder(parent,x,y,z,r1,r2,h,color,sides=14){return obj(parent,new THREE.CylinderGeometry(r1,r2,h,sides),mat(color),x,y,z);}
function makeLabel(text,color){const cvs=document.createElement('canvas');cvs.width=256;cvs.height=72;const c=cvs.getContext('2d');
 c.fillStyle='rgba(8,14,26,.83)';c.fillRect(5,8,246,57);c.strokeStyle=color;c.strokeRect(5,8,246,57);
 c.fillStyle='#f1f7ff';c.font='600 19px sans-serif';c.textAlign='center';c.fillText(text.slice(0,23),128,35);
 c.fillStyle=color;c.font='600 12px sans-serif';c.fillText('LIVE CREW',128,55);
 const texture=new THREE.CanvasTexture(cvs);const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false});
 const sprite=new THREE.Sprite(material);sprite.scale.set(3.8,1.12,1);sprite.position.y=3.05;return sprite;
}
function makeAvatar(p){
 const g=new THREE.Group(),body=new THREE.Group(),color=COLORS[p.team],dark='#354052',bone='#efe6d6';g.add(body);
 const torso=cylinder(body,0,1.12,0,.34,.38,.76,color);torso.scale.set(1.05,1,.75);
 box(body,0,1.15,.25,.47,.34,.14,bone);
 for(const sign of [-1,1]){
  const arm=new THREE.Group();arm.position.set(sign*.43,1.38,0);body.add(arm);
  cylinder(arm,0,-.22,0,.12,.12,.48,color);ball(arm,0,-.5,.04,.14,dark);
  const leg=new THREE.Group();leg.position.set(sign*.19,.75,0);body.add(leg);
  cylinder(leg,0,-.3,0,.13,.13,.53,color);box(leg,0,-.62,.12,.27,.2,.39,dark);
  (g.userData.armParts??=[]).push(arm);(g.userData.legParts??=[]).push(leg);
 }
 if(p.role===0){ // frog navigator
  const head=ball(body,0,1.97,0,.44,'#88c37e');head.scale.set(1.14,.85,.9);
  for(const s of [-1,1]){ball(body,s*.24,2.22,-.02,.19,'#a5d598');ball(body,s*.24,2.23,.13,.095,'#fff8ec');ball(body,s*.24,2.23,.22,.043,dark);}
 }else if(p.role===1){
  box(body,0,1.97,0,.68,.53,.56,'#b7c9d1');box(body,0,2,.3,.51,.22,.055,'#283a56');
  for(const s of [-1,1])box(body,s*.15,2,.335,.1,.095,.025,'#8bfbe0');
  cylinder(body,.1,2.38,0,.025,.025,.3,'#a8cbd6');ball(body,.1,2.58,0,.065,color);
 }else if(p.role===2){
  ball(body,0,1.97,0,.4,'#f3cf62');for(const s of[-1,1]){
   ball(body,s*.16,2.05,.30,.1,'#fff7e5');ball(body,s*.16,2.05,.4,.05,dark);
   const wing=ball(body,s*.43,1.45,-.25,.36,'#cce8ef');wing.scale.set(.6,1.15,.18);
  }
 }else{
  cylinder(body,0,1.72,0,.105,.13,.66,'#efb0ae');ball(body,0,2.2,0,.25,'#efb0ae');
  for(const s of[-1,1]){ball(body,s*.13,2.25,.2,.06,'#fff7e5');ball(body,s*.13,2.25,.25,.03,dark);}
  const beak=obj(body,new THREE.ConeGeometry(.12,.36,8),mat('#f5dcb5'),0,2.11,.36);beak.rotation.x=Math.PI/2;
 }
 const shade=new THREE.Mesh(new THREE.CircleGeometry(.51,22),new THREE.MeshBasicMaterial({color:'#1c1a2d',transparent:true,opacity:.3,depthWrite:false}));shade.rotation.x=-Math.PI/2;shade.position.y=.035;g.add(shade);
 const label=makeLabel(p.name,color);g.add(label);
 const selection=ring(g,0,.06,0,.64,color);selection.visible=p.id===id;
 scene.add(g);return {g,label,selection,position:{x:p.x,z:p.z},last:{x:p.x,z:p.z},animation:0,role:p.role,team:p.team};
}
function makeShip(team){const [x,z]=BASES[team],col=COLORS[team],g=new THREE.Group();g.position.set(x,0,z);root.add(g);
 cylinder(g,0,.02,0,6.1,6.1,.17,'#454653',48);ring(g,0,.12,0,5.9,col);
 const transitDeck=cylinder(g,0,-.20,0,15,15,.22,'#333b52',64);transitDeck.visible=false;
 const transitRing=ring(g,0,-.07,0,14.5,col);transitRing.visible=false;
 // Toon rocket silhouette: body, swept fins, cockpit and dorsal payload.
 const hull=ball(g,0,1.25,0,2.3,'#ead7bb');hull.scale.set(.72,.65,1.55);
 box(g,0,1.2,0,1.9,.72,4.5,'#e6d7c8');
 const nose=obj(g,new THREE.ConeGeometry(.98,1.8,24),mat('#efb974'),0,1.25,-2.75);nose.rotation.x=-Math.PI/2;
 for(const s of[-1,1]){box(g,s*1.6,.75,.72,2.5,.17,2.8,col);cylinder(g,s*.48,1,-2.07,.34,.42,.9,'#2e3549');}
 ball(g,0,1.65,-.5,1.0,'#243c58').scale.set(.7,.4,1.12);
 for(const s of[-1,1]){cylinder(g,s*.53,.92,2.35,.37,.47,.6,'#343143');ball(g,s*.53,.9,2.75,.32,'#ffce7f');}
 const modules=[];
 for(let r=0;r<4;r++){
  const [ox,oz]=MODULE_OFFSETS[r],terminal=new THREE.Group();terminal.position.set(ox,0,oz);g.add(terminal);
  cylinder(terminal,0,.25,0,.72,.75,.5,'#343b55');ring(terminal,0,.55,0,.87,col);
  const holo=box(terminal,0,1.08,0,.62,.78,.1,r===1?'#83dcca':r===2?'#f1c179':r===3?'#c7a7ec':col);
  const fixture=cylinder(terminal,0,1.3,0,.1,.1,.75,'#d6c5ad');fixture.visible=false;
  modules.push({group:terminal,holo,fixture});
  terminals.push({team,r,group:terminal});
 }
 const beacon=new THREE.Group();beacon.position.set(8,0,0);g.add(beacon);
 cylinder(beacon,0,1.1,0,.28,.37,2.2,col);ball(beacon,0,2.43,0,.56,'#ecf7d8');ring(beacon,0,.08,0,2,col);
 beacons.push({team,group:beacon});
 ships.push({team,g,modules,transitDeck,transitRing});return g;
}
function initWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#1c2037');scene.fog=new THREE.FogExp2('#17192c',.0065);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.23;
 camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.09,300);
 scene.add(new THREE.HemisphereLight('#dfe9ff','#473048',2.2));
 const sun=new THREE.DirectionalLight('#ffe4bb',3.2);sun.position.set(-28,50,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-85,right:85,bottom:-75,top:75,near:1,far:160});sun.shadow.normalBias=.015;scene.add(sun);
 const fill=new THREE.DirectionalLight('#9cb2f5',1.3);fill.position.set(22,25,-22);scene.add(fill);
 root=new THREE.Group();scene.add(root);
 const terrMat=new THREE.MeshStandardMaterial({color:'#65615a',roughness:1});
 ground=obj(root,new THREE.PlaneGeometry(126,116,30,30),terrMat,0,-.14,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
 for(let i=0;i<4;i++)makeShip(i);
 for(const [x,z,r] of ROCKS){const rock=ball(root,x,.55,z,r,'#646779');rock.scale.set(1,.6,1);decor.push(rock);}
 for(let i=0;i<SITES.length;i++){
  const [x,z]=SITES[i];const g=new THREE.Group();g.position.set(x,0,z);root.add(g);
  const crystal=obj(g,new THREE.OctahedronGeometry(.67,0),new THREE.MeshToonMaterial({color:'#c7c7ff',emissive:'#8f81ee',emissiveIntensity:.55}),0,1,0);
  ring(g,0,.05,0,1.05,'#dac6ff');samples.push({g,crystal});
 }
 const starGeo=new THREE.BufferGeometry(),arr=[];let v=19441;
 const rnd=()=>{v=(v*1664525+1013904223)>>>0;return v/4294967296;};
 for(let i=0;i<1000;i++){const a=rnd()*Math.PI*2,b=(rnd()-.5)*Math.PI,r=95+rnd()*65;arr.push(Math.cos(a)*Math.cos(b)*r,Math.sin(b)*r+70,Math.sin(a)*Math.cos(b)*r);}
 starGeo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));
 stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#e9e2ff',size:.44,fog:false,sizeAttenuation:true}));scene.add(stars);
 const moon=ball(scene,-65,80,-110,20,'#9177ad');moon.castShadow=false;
 const orbit=obj(scene,new THREE.RingGeometry(25,34,90),new THREE.MeshBasicMaterial({color:'#c9b0d8',side:THREE.DoubleSide,transparent:true,opacity:.26,fog:false}),-65,80,-110);orbit.rotation.set(1.3,.2,.1);
 addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
}
function socketAddress(){const entered=$('server-url').value.trim();const guess=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws';
 const value=entered||guess;let u;try{u=new URL(value);}catch{throw Error('Invalid server URL (use wss://domain/ws)');}
 if(!['wss:','ws:'].includes(u.protocol)||u.pathname!=='/ws')throw Error('Server endpoint must end with /ws');
 if(location.protocol==='https:'&&u.protocol==='ws:')throw Error('Secure pages require a wss:// connection');
 return u.href;
}
function setConnection(status,ok=false){$('connection').textContent=status;$('connection').classList.toggle('ok',ok);}
function tell(message,type='info'){toastText=message;toastUntil=performance.now()+3800;const el=$('center-message');el.textContent=message;el.classList.add('visible');if(type==='error')el.style.color='#ffb2a6';else el.style.color='#d8f9df';}
function send(data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function connect({resume=false}={}){
 if(ws&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(ws.readyState))return;
 manualClose=false;serverUrl=socketAddress();setConnection('CONNECTING');
 ws=new WebSocket(serverUrl);
 ws.onopen=()=>{alive=true;retry=0;setConnection('SERVER ONLINE',true);};
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.kind==='hello'){
   send({kind:'join',room:resume?room:($('join-room').value.trim().toUpperCase()||''),
    name:$('join-name').value.trim(),team:Number($('join-team').value),role:Number($('join-role').value),token:resume?token:undefined});
   return;
  }
  if(m.kind==='error'){
   if(!joined){$('join-error').textContent=m.message;setConnection('JOIN FAILED');ws?.close();if(resume){joined=false;$('join-overlay').hidden=false;$('lobby-overlay').hidden=true;$('online-hud').hidden=true;}}
   else tell(m.message,'error');return;
  }
  if(m.kind==='joined'){
   joined=true;id=m.id;token=m.token;room=m.room;retry=0;reconnecting=false;
   try{sessionStorage.setItem('tminus-online-session',JSON.stringify({room,token,server:serverUrl}));}catch{}
   $('join-overlay').hidden=true;$('hud-room').textContent=room;$('lobby-overlay').hidden=false;
   $('join-room').value=room;
   const u=new URL(location.href);u.searchParams.set('room',room);history.replaceState(null,'',u.href);
   tell(m.resumed?'Back aboard: session restored':'Connected to live crew');
   return;
  }
  if(m.kind==='snapshot'){previous=latest;latest=m;receivedAt=performance.now();
   const mine=m.players.find(p=>p.id===id);
   if(mine&&!selfDisplay.init){selfDisplay.x=mine.x;selfDisplay.z=mine.z;selfDisplay.init=true;}
   if(m.phase==='lobby'){
    $('lobby-overlay').hidden=false;$('online-hud').hidden=true;$('results-overlay').hidden=true;
    updateLobby(m);
   }else{
    $('lobby-overlay').hidden=true;$('online-hud').hidden=false;
    if(m.phase==='results')showResults(m);
    else $('results-overlay').hidden=true;
   }
   return;
  }
  if(m.kind==='chat'){addChat(`${m.name}: ${m.text}`,COLORS[m.team]||'#e6efff');return;}
  if(m.kind==='action-result'){tell(m.message||(m.ok?'Action confirmed':'Action unavailable'),m.error?'error':'info');return;}
 };
 ws.onclose=()=>{
  alive=false;setConnection('OFFLINE / RETRYING');keys.clear();shooting=false;
  if(!manualClose&&joined){reconnecting=true;const delay=Math.min(10000,700*2**Math.min(retry++,4));setTimeout(()=>{if(reconnecting&&!alive){try{connect({resume:true});}catch(e){tell(e.message,'error');}}},delay);}
  else if(!manualClose)$('join-error').textContent='Cannot reach Node multiplayer server. Launch npm run dev locally or configure a public wss:// backend.';
 };
 ws.onerror=()=>setConnection('NETWORK ERROR');
}
function addChat(message,color='#c4d2e9'){
 const log=$('chat-log');const line=document.createElement('div');line.textContent=message;line.style.color=color;log.append(line);
 while(log.children.length>30)log.firstChild.remove();log.scrollTop=log.scrollHeight;
}
function updateLobby(snapshot){
 const players=snapshot.players.filter(p=>p.connected);
 const mine=snapshot.players.find(p=>p.id===id);
 $('lobby-room-code').textContent=`ROOM ${snapshot.room} · ${players.length}/16 LIVE`;
 const byTeam=new Map(TEAMS.map((_,i)=>[i,players.filter(p=>p.team===i)]));
 $('lobby-roster').innerHTML=TEAMS.map((name,t)=>`<article class="team-card"><h3><i style="background:${COLORS[t]}"></i>${name}</h3>${ROLES.map((role,r)=>{const p=byTeam.get(t).find(p=>p.role===r);return `<div class="roster-line"><b>${esc(p?.name||'OPEN SEAT')}</b><small>${role}${p?.id===id?' · YOU':''}${p?.id===snapshot.hostId?' · HOST':''}${p?.ready?' · READY':''}</small></div>`;}).join('')}</article>`).join('');
 $('ready-button').textContent=mine?.ready?'READY ✓':'READY UP';
 $('start-button').disabled=snapshot.hostId!==id||players.length<2||new Set(players.map(p=>p.team)).size<2||players.some(p=>!p.ready);
 $('start-button').textContent=snapshot.hostId===id?'START REAL MATCH ↗':'WAITING FOR HOST';
 $('lobby-tip').textContent='Two opposing teams and all players READY required. Host: '+(players.find(p=>p.id===snapshot.hostId)?.name||'No host')+'. Unoccupied slots remain empty; no bots are inserted.';
}
function showResults(s){if(shownResult)return;shownResult=true;
 const teams=[...s.teams].sort((a,b)=>b.delivered-a.delivered||b.kills-a.kills||a.team-b.team);
 $('result-title').textContent=s.winner===null?'DRAW · SHARED FRONTIER':`${TEAMS[s.winner]} WINS THE RACE`;
 $('result-scores').innerHTML=teams.map((t,i)=>`<div class="results-team ${s.winner===t.team?'winner':''}"><b>#${i+1} ${esc(t.name)}</b><span>${t.delivered} delivered · ${t.kills} eliminations</span></div>`).join('');
 $('results-overlay').hidden=false;
}
function describeAction(s,mine){if(!mine)return ['TEAM TERMINAL','Synchronizing…'];const b=BASES[mine.team],d=Math.hypot(mine.x-b[0],mine.z-b[1]);
 if(s.phase==='build'){
  let best={r:0,d:1e9};MODULE_OFFSETS.forEach(([x,z],r)=>{const md=Math.hypot(mine.x-b[0]-x,mine.z-b[1]-z);if(md<best.d)best={r,d:md};});
  if(best.d>4.5)return ['FIND GLOWING TERMINALS','Approach a colored station on your team landing pad'];
  const count=s.teams[mine.team].modules[best.r];
  return [count===3?'MODULE COMPLETE · MOVE ON':`E · ${MODULES[best.r].toUpperCase()}`,`${count}/3 fasteners · ${ROLES[best.r]} station`];
 }
 if(s.phase==='flight')return [d<10?'E · REPAIR SHIP SYSTEMS':'RETURN TO YOUR SHIP',`Team hull: ${s.teams[mine.team].hull}%`];
 if(s.phase==='surface'){
  if(mine.carry!==null)return [d<7?'E · STOW SCIENCE SAMPLE':'RETURN TO YOUR SHIP',`Carrying sample #${mine.carry+1} · ${s.teams[mine.team].cargo}/4 loaded`];
  const nearest=s.sites.filter(x=>x.state==='ground').reduce((a,b)=>!a||Math.hypot(mine.x-b.x,mine.z-b.z)<Math.hypot(mine.x-a.x,mine.z-a.z)?b:a,null);
  const near=nearest&&Math.hypot(mine.x-nearest.x,mine.z-nearest.z)<3;
  return [near?'E · COLLECT SCIENCE SAMPLE':'SEARCH FOR THE 12 CRYSTALS',`Loaded ${s.teams[mine.team].cargo}/4 · only delivered cargo scores`];
 }
 if(s.phase==='delivery')return [Math.hypot(mine.x-(b[0]+8),mine.z-b[1])<5?'E · DELIVER A SAMPLE':'FIND YOUR RECEIVING BEACON',`${s.teams[mine.team].cargo} remaining · ${s.teams[mine.team].delivered} points scored`];
 return ['STANDBY','Preparing the next mission stage'];
}
function updateHud(s){
 const mine=s.players.find(p=>p.id===id), team=mine?.team??0,teamState=s.teams[team];
 $('phase-title').textContent=screens[s.phase]||s.phase.toUpperCase();
 $('mission-title').textContent=s.phase==='surface'?'SCIENCE IS A RACE':s.phase==='build'?'BUILD THE SHIP':s.phase==='flight'?'SYSTEMS ONLINE':s.phase==='delivery'?'RETURN THE EVIDENCE':s.phase==='return'?'TRANSIT HOME':s.phase==='results'?'FINAL RESULTS':'WAIT FOR THE HOST';
 $('mission-instruction').textContent=phaseCopy[s.phase];
 $('hud-room').textContent=s.room;
 $('phase-time').textContent=`${String(Math.floor(s.phaseLeft/60)).padStart(2,'0')}:${String(s.phaseLeft%60).padStart(2,'0')}`;
 $('team-scores').innerHTML=[...s.teams].sort((a,b)=>b.delivered-a.delivered||b.cargo-a.cargo).map(t=>`<div class="score-row"><i class="dot" style="background:${COLORS[t.team]}"></i><div><b>${esc(t.name)}</b><small>Onboard ${t.cargo} · KOs ${t.kills}</small></div><strong>${t.delivered} pts</strong></div>`).join('');
 $('team-roster').innerHTML='<div class="eyebrow">YOUR TEAM</div>'+ROLES.map((r,i)=>{
  const q=s.players.find(p=>p.connected&&p.team===team&&p.role===i);
  return `<div><b>${esc(q?.name||'OPEN')}</b><small>${r}${q&&q.id===id?' · YOU':''}</small></div>`;
 }).join('');
 $('module-progress').innerHTML=s.phase==='build'?MODULES.map((name,i)=>`<div><span>${esc(name)}</span><strong>${teamState.modules[i]}/3</strong></div>`).join(''):s.phase==='surface'||s.phase==='delivery'?`<div><span>CARGO STORED</span><strong>${teamState.cargo}/4</strong></div><div><span>DELIVERED</span><strong>${teamState.delivered}</strong></div>`:'';
 const [title,detail]=describeAction(s,mine);$('action-title').textContent=title;$('action-detail').textContent=detail;
 $('player-name').textContent=mine?`${mine.name} / ${TEAMS[mine.team]} ${ROLES[mine.role]}`:'ASTRONAUT';
 $('health-label').textContent=mine?.revive?`REVIVING ${mine.revive}s`:`${mine?.hp??100} HP`;
 $('health-fill').style.width=(mine?.hp??100)+'%';
 $('stage-track').innerHTML=PHASES.map(p=>`<span class="${p===s.phase?'active':''}">${p.toUpperCase()}</span>`).join(' → ');
 if(s.phase==='lobby')return;
 for(const evt of s.events){const key=evt.t+'|'+evt.text;if(!lastEvents.has(key)){lastEvents.add(key);addChat(evt.text,evt.team!==null?COLORS[evt.team]:'#c9d6f2');}}
 if(lastEvents.size>100)lastEvents=new Set([...lastEvents].slice(-40));
}
function updateWorld(s,dt,now){
 if(!scene)return;
 ground.visible=!['flight','return'].includes(s.phase);
 scene.background.set(['flight','return'].includes(s.phase)?'#0b112b':'#1c2037');
 for(const ship of ships){const data=s.teams[ship.team];
  ship.g.position.y=0; // foot contact remains on the flight deck, not below a lifted ship
  ship.transitDeck.visible=ship.transitRing.visible=['flight','return'].includes(s.phase);
  for(let i=0;i<ship.modules.length;i++){
   const m=ship.modules[i];m.fixture.visible=data.modules[i]>=3;
   m.holo.scale.y=Math.max(.15,1-data.modules[i]*.22);
   m.holo.material.color.set(data.modules[i]===3?'#90e1b1':COLORS[ship.team]);
   m.group.visible=s.phase==='build';
  }
 }
 for(let i=0;i<samples.length;i++){
  const o=s.sites[i],v=samples[i];v.g.visible=s.phase==='surface'&&o.state==='ground';
  v.g.position.x=o.x;v.g.position.z=o.z;
  v.crystal.position.y=1+Math.sin(now*.003+i)*.17;v.crystal.rotation.y+=dt*1.2;
 }
 for(const beacon of beacons)beacon.group.visible=s.phase==='delivery';
 const seen=new Set();
 const renderPlayers=previous?interpolateSnapshots(previous,s,limit((now-receivedAt)/125,.05,1)):s.players;
 const current=new Map(renderPlayers.map(p=>[p.id,p]));
 for(const p of s.players){
  seen.add(p.id);let a=avatars.get(p.id);
  if(!a){a=makeAvatar(p);avatars.set(p.id,a);}
  a.selection.visible=p.id===id;
  a.g.visible=p.connected&&p.hp>0;
  const target=current.get(p.id)||p;
  if(p.id===id){ // prediction is visual-only; never sent to server as position.
   if(!selfDisplay.init){selfDisplay.x=p.x;selfDisplay.z=p.z;selfDisplay.init=true;}
   const {x,z}=intent();const sp=keys.has('shift')?6.4:4.65;
   const nx=limit(selfDisplay.x+x*sp*dt,-53,53),nz=limit(selfDisplay.z+z*sp*dt,-49,49);
   if(!predictedObstacle(nx,selfDisplay.z))selfDisplay.x=nx;
   if(!predictedObstacle(selfDisplay.x,nz))selfDisplay.z=nz;
   const error=Math.hypot(selfDisplay.x-p.x,selfDisplay.z-p.z);
   const correction=error>4?1:Math.min(1,dt*4.5);
   selfDisplay.x=THREE.MathUtils.lerp(selfDisplay.x,p.x,correction);
   selfDisplay.z=THREE.MathUtils.lerp(selfDisplay.z,p.z,correction);
   a.g.position.set(selfDisplay.x,0,selfDisplay.z);
  }else{a.g.position.x=THREE.MathUtils.lerp(a.g.position.x,target.x,limit(dt*12,0,1));a.g.position.z=THREE.MathUtils.lerp(a.g.position.z,target.z,limit(dt*12,0,1));}
  a.g.rotation.y=THREE.MathUtils.lerp(a.g.rotation.y,p.aim+Math.PI,limit(dt*12,0,1));
  const moved=Math.hypot(a.g.position.x-a.last.x,a.g.position.z-a.last.z);
  a.animation+=Math.min(moved*4,.35);
  const swing=limit(moved/Math.max(dt,.001),0,5)/5;
  for(let i=0;i<2;i++){a.g.userData.legParts[i].rotation.x=Math.sin(a.animation*2+i*Math.PI)*.55*swing;
    a.g.userData.armParts[i].rotation.x=Math.sin(a.animation*2+(1-i)*Math.PI)*.38*swing;}
  a.last.x=a.g.position.x;a.last.z=a.g.position.z;
 }
 for(const [pid,a] of avatars)if(!seen.has(pid)){
  scene.remove(a.g);a.g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose();}});avatars.delete(pid);
 }
 if(!s.players.some(p=>p.id===id))return;
 const a=avatars.get(id),target=new THREE.Vector3(a.g.position.x,1.3,a.g.position.z);
 const cameraDistance=10;
 const position=new THREE.Vector3(target.x-Math.sin(yaw)*cameraDistance,3.0+Math.sin(pitch)*7,target.z+Math.cos(yaw)*cameraDistance);
 camera.position.lerp(position,1-Math.exp(-dt*7));camera.lookAt(target);
}
function predictedObstacle(x,z){return ROCKS.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r+.52)||BASES.some(([bx,bz])=>Math.hypot(x-bx,z-bz)<3.25);}
function intent(){
 if(isTyping()||$('join-overlay').hidden===false||$('lobby-overlay').hidden===false||$('help-overlay').hidden===false)return {x:0,z:0};
 const x=(keys.has('d')?1:0)-(keys.has('a')?1:0),z=(keys.has('w')?1:0)-(keys.has('s')?1:0);
 const a=x*Math.cos(yaw)+z*Math.sin(yaw),b=x*Math.sin(yaw)-z*Math.cos(yaw),len=Math.hypot(a,b)||1;
 return {x:a/len,z:b/len};
}
function sendInput(){if(!joined||!alive)return;const {x,z}=intent();
 send({kind:'input',v:1,sequence:++seq,strafe:x,forward:z,buttons:(shooting?1:0)|(keys.has('shift')?2:0),aim:yaw});
}
function loop(){requestAnimationFrame(loop);const dt=Math.min(.05,clock.getDelta()),now=performance.now();
 if(joined&&latest){updateWorld(latest,dt,now);if(now-lastHud>250){updateHud(latest);lastHud=now;}}
 if(toastText&&now>toastUntil){$('center-message').classList.remove('visible');toastText='';}
 if(renderer)renderer.render(scene,camera);
}
function initInputs(){
 addEventListener('keydown',e=>{
  if(isTyping()){
   if(e.key==='Escape'){document.activeElement.blur();e.preventDefault();}return;
  }
  if(e.key==='Enter'&&joined){$('chat-input').focus();e.preventDefault();return;}
  if(e.key.toLowerCase()==='e'&&joined&&latest&&!e.repeat&&$('help-overlay').hidden){send({kind:'action'});e.preventDefault();return;}
  if(['w','a','s','d','shift'].includes(e.key.toLowerCase())){keys.add(e.key.toLowerCase());e.preventDefault();}
  if(e.key==='Escape'){keys.clear();shooting=false;}
 });
 addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());});
 addEventListener('blur',()=>{keys.clear();shooting=false;sendInput();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();shooting=false;sendInput();}});
 canvas.addEventListener('pointerdown',e=>{
  if(!joined||!latest||latest.phase==='lobby'||latest.phase==='results')return;
  if(e.button===0&&latest.phase==='surface')shooting=true;
  if(document.pointerLockElement!==canvas){try{const pending=canvas.requestPointerLock?.();pending?.catch?.(()=>{});}catch{}}
 });
 addEventListener('pointerup',e=>{if(e.button===0)shooting=false;});
 document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===canvas||e.buttons===2){yaw=(yaw+e.movementX*.0028+Math.PI*4)%(Math.PI*2);if(yaw>Math.PI)yaw-=Math.PI*2;
   pitch=limit(pitch-e.movementY*.002,.28,1.18);}
 });
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 $('chat-form').addEventListener('submit',e=>{e.preventDefault();const input=$('chat-input');if(input.value.trim())send({kind:'chat',text:input.value.trim().slice(0,140)});input.value='';input.blur();canvas.focus();});
 $('controls-toggle').onclick=()=>{$('help-overlay').hidden=false;document.exitPointerLock?.();keys.clear();shooting=false;};
 $('help-close').onclick=()=>{$('help-overlay').hidden=true;};
 $('join-button').onclick=()=>{try{$('join-error').textContent='';joined=false;room=null;token=null;shownResult=false;connect();}catch(e){$('join-error').textContent=e.message;}};
 $('ready-button').onclick=()=>{const p=latest?.players.find(x=>x.id===id);send({kind:'ready',value:!p?.ready});};
 $('start-button').onclick=()=>send({kind:'start'});
 $('copy-invite').onclick=async()=>{
  const u=new URL(location.href);u.searchParams.set('room',room);if(serverUrl&&!serverUrl.startsWith((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/'))u.searchParams.set('server',serverUrl);
  try{await navigator.clipboard.writeText(u.href);tell('Invite link copied to clipboard');}catch{tell('Invite URL: '+u.href);}
 };
 $('back-lobby').onclick=()=>{manualClose=true;ws?.close();try{sessionStorage.removeItem('tminus-online-session');}catch{}location.assign('online.html');};
 const params=new URLSearchParams(location.search);
 if(params.get('room'))$('join-room').value=params.get('room').toUpperCase().slice(0,8);
 if(params.get('server'))$('server-url').value=params.get('server');
 let old=null;try{old=sessionStorage.getItem('tminus-online-session');}catch{}
 if(old&&(params.get('resume')==='1'||(performance.getEntriesByType?.('navigation')[0]?.type==='reload'))){
  try{const session=JSON.parse(old);if(!params.get('room')||session.room===params.get('room').toUpperCase()){room=session.room;token=session.token;$('server-url').value=session.server;connect({resume:true});}}catch{}
 }
 setInterval(sendInput,50);
}
try{initWorld();initInputs();loop();}catch(e){$('join-error').textContent='WebGL initialization failed: '+e.message;console.error(e);}
