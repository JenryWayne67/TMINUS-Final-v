// Campaign rules. No rendering, DOM, network, or competitive match state.
// Equipment values are fictional gameplay tuning. Simulation seconds = play seconds × 8.
export const CAMPAIGN_VERSION = 1;
export const SAVE_KEY = 'tminus-campaign-v1';
export const PROGRESS_KEY = 'tminus-campaign-progress-v1';
export const EQUIPMENT = {
  battery: [{id:'compact',name:'Compact battery',mass:24,cost:8,wh:800},{id:'reserve',name:'Reserve battery',mass:65,cost:18,wh:1800}],
  array: [{id:'standard',name:'Standard solar wings',mass:60,cost:12,watts:1800},{id:'expanded',name:'Expanded solar wings',mass:110,cost:22,watts:2600}],
  instrument: [{id:'camera',name:'Survey camera',mass:35,cost:12,watts:350,rate:1},{id:'spectrometer',name:'Imaging spectrometer',mass:70,cost:22,watts:750,rate:1.5}],
  radio: [{id:'standard',name:'Standard antenna',mass:20,cost:8,rate:2},{id:'highgain',name:'High-gain antenna',mass:40,cost:16,rate:4}]
};
export const MISSIONS = [
 {id:'orbital',number:'01',name:'First Orbital Flight',destination:'EARTH / LOW ORBIT',duration:'15–20 MIN',summary:'Your program’s first crewed flight. Bring the ship online, observe Earth, recover from an electrical fault, and bring the science home.',goal:90,budget:70,reference:'Inspired by the milestone of Vostok 1 (1961). This multi-crew spacecraft, science activity and circuit fault are fictional; this is not a reconstruction.',source:'https://www.nasa.gov/history/',available:true},
 {id:'telescope',number:'02',name:'Restore the Observatory',destination:'EARTH / SERVICING ORBIT',duration:'15–20 MIN',summary:'Rendezvous with an orbital observatory. Prepare the airlock, carry a replacement instrument outside, and restore its scientific capability.',goal:90,budget:78,reference:'Inspired by Hubble Servicing Mission 1 (1993), which installed corrective optics and replaced instruments and other hardware. This telescope, rendezvous and EVA procedure are simplified fictional gameplay.',source:'https://www.nasa.gov/mission/sts-61/',available:true},
 {id:'spacewalk',number:'03',name:'Beyond the Airlock',available:false},
 {id:'docking',number:'04',name:'Two Ships, One Orbit',available:false},
 {id:'deployment',number:'05',name:'Eyes on Earth',available:false},
 {id:'station',number:'06',name:'A Home in Orbit',available:false},
 {id:'lunar-orbit',number:'07',name:'Around the Moon',available:false},
 {id:'lunar-landing',number:'08',name:'First Footprints',available:false},
 {id:'samples',number:'09',name:'Bring the Moon Home',available:false}
];
export const DEFAULT_DESIGN = {battery:'reserve',array:'standard',instrument:'camera',radio:'standard'};
export function sanitizeDesign(input={}) {
 const result={}; for(const [key,options] of Object.entries(EQUIPMENT)) result[key]=options.some(x=>x.id===input[key])?input[key]:DEFAULT_DESIGN[key]; return result;
}
export function evaluateDesign(input,missionId='orbital') {
 const design=sanitizeDesign(input),mission=MISSIONS.find(m=>m.id===missionId&&m.available)||MISSIONS[0];
 const parts=Object.fromEntries(Object.entries(EQUIPMENT).map(([k,list])=>[k,list.find(x=>x.id===design[k])]));
 const mass=520+Object.values(parts).reduce((s,p)=>s+p.mass,0),cost=Object.values(parts).reduce((s,p)=>s+p.cost,0);
 const load=800+parts.instrument.watts,errors=[],warnings=[];
 if(cost>mission.budget) errors.push('Equipment exceeds the mission budget.');
 if(mass>850) errors.push('Spacecraft exceeds the training launcher’s 850 kg capacity.');
 if(parts.array.watts<load+300) errors.push('Generation must cover the instrument and a 300 W recharge margin.');
 if(parts.battery.wh<load*300*8/3600*1.25) warnings.push('Limited eclipse reserve: suspend observations while repairing the circuit.');
 return {design,parts,mass,cost,load,errors,warnings,valid:!errors.length,budget:mission.budget};
}
export const PHASE_NAMES={checkout:'Preflight checks',launch:'Launch & insertion',commission:'Orbital checkout',rendezvous:'Rendezvous',prepare:'EVA preparation',eva:'External servicing',science:'Earth observation',eclipse:'Eclipse operations',downlink:'Ground contact',return:'Return preparation',reentry:'Guided return',complete:'Mission complete',aborted:'Mission aborted',failed:'Mission ended'};
export function createCampaign(missionId='orbital',input=DEFAULT_DESIGN) {
 const definition=MISSIONS.find(m=>m.id===missionId&&m.available); if(!definition) throw Error('Mission is not playable yet.');
 const e=evaluateDesign(input,missionId); if(!e.valid) throw Error(e.errors.join(' '));
 return {version:CAMPAIGN_VERSION,missionId,design:e.design,phase:'checkout',elapsed:0,phaseTime:0,energy:e.parts.battery.wh,minEnergy:e.parts.battery.wh,stored:0,transmitted:0,dataLost:0,observing:false,arrays:false,calibrated:false,autopilot:false,fault:false,isolated:false,fuse:false,spare:false,tool:false,tether:false,suit:false,depressurized:false,installed:false,verified:false,returned:false,optional:false,conserve:false,paused:false,crewCommand:'monitor',done:[],log:[],activity:null,failedReason:'',simulationRate:8};
}
const terminal=s=>['complete','aborted','failed'].includes(s.phase);
export function phase(s,next) {s.phase=next;s.phaseTime=0;s.activity=null;s.log.push({time:s.elapsed,text:PHASE_NAMES[next]});}
function action(id,label,room,seconds=0,note=''){return {id,label,room,seconds,note};}
export function objectives(s) {
 if(terminal(s))return [];
 switch(s.phase){
 case 'checkout':return [action('check-power','Verify electrical supply','power_room',8),action('check-cabin','Verify cabin systems','life_support',8),action('check-payload','Secure the science payload','lab',8),action('launch','Confirm guidance & launch','cockpit',5)].filter(a=>!s.done.includes(a.id));
 case 'launch':return [action('wait','Monitor ascent and insertion','cockpit',0,'Guided, time-compressed ascent. Essential systems remain under automatic control.')];
 case 'commission':return [!s.arrays&&action('deploy','Deploy solar wings','power_room',12),!s.autopilot&&action('autopilot','Engage orbital autopilot','cockpit',5),action('commission','Accept orbital checkout','cockpit',5)].filter(Boolean);
 case 'rendezvous':return [action('rendezvous','Match the approach indicators','cockpit',15,'Match both indicators to their marked safe bands. This is a guided rendezvous abstraction.')];
 case 'prepare':return [!s.tool&&action('tool','Collect replacement instrument','workshop',8),!s.suit&&action('suit','Check suit oxygen and pressure','airlock',12),!s.tether&&action('tether','Attach safety tether','airlock',5),action('depressurize','Depressurize airlock','airlock',12)].filter(Boolean);
 case 'eva':return [!s.installed?action('install','Replace observatory instrument','exterior',45):action('ingress','Return to airlock & repressurize','airlock',15)];
 case 'science':return [!s.calibrated?action('calibrate','Calibrate the science instrument','lab',20):action('observe',s.observing?'Suspend observation':'Start Earth observation','lab',5),action('advance','Review observations','lab',5)];
 case 'eclipse':return [s.fault&&!s.isolated&&action('isolate','Isolate laboratory circuit','power_room',8),s.fault&&s.isolated&&!s.spare&&action('spare','Retrieve spare fuse','workshop',8),s.fault&&s.isolated&&s.spare&&!s.fuse&&action('fuse','Fit the correctly rated fuse','power_room'),s.fault&&s.fuse&&action('restore','Restore laboratory circuit','power_room',8),!s.fault&&action('optional',s.observing?'Suspend optional observation':'Collect optional observation','lab',5),!s.fault&&action('eclipse-end','Finish eclipse operations','cockpit',5)].filter(Boolean);
 case 'downlink':return [action('transmit','Transmit stored observations','lab',5),action('return','Confirm science receipt & prepare return','cockpit',5)];
 case 'return':return [!s.done.includes('secure')&&action('secure','Secure instruments for return','lab',8),action('deorbit','Confirm return guidance','cockpit',8)].filter(Boolean);
 case 'reentry':return [action('wait','Monitor guided return','cockpit',0,'Time-compressed return. Your crew monitors cabin and guidance automatically.')];
 default:return [];
 }
}
export function canAction(s,id,room,context={}) {
 const a=objectives(s).find(a=>a.id===id); if(!a||id==='wait')return 'This action is not available now.';
 if(a.room!==room)return 'Go to '+a.room.replaceAll('_',' ')+'.';
 if(s.activity)return 'Finish or cancel the current task first.';
 if(id==='launch'&&!['check-power','check-cabin','check-payload'].every(k=>s.done.includes(k)))return 'Complete all three preflight checks.';
 if(id==='commission'&&(!s.arrays||!s.autopilot))return 'Deploy solar wings and engage autopilot.';
 if(id==='rendezvous'&&!(Math.abs(context.alignment-50)<=7&&Math.abs(context.closure-30)<=7))return 'Match alignment to 50 and closure to 30 (±7).';
 if(id==='depressurize'&&(!s.tool||!s.suit||!s.tether))return 'Collect the instrument, check the suit and attach the tether.';
 if(id==='install'&&!context.atTelescope)return 'Float to the highlighted telescope instrument bay.';
 if(id==='ingress'&&!context.atAirlock)return 'Return to the ship’s airlock beacon.';
 if(['calibrate','observe','optional'].includes(id)&&(s.fault||s.energy<5))return 'Restore electrical supply first.';
 if(id==='calibrate'&&Math.abs(context.calibration-50)>6)return 'Set calibration inside the marked band (50 ±6).';
 if(id==='advance'&&s.stored<MISSIONS.find(m=>m.id===s.missionId).goal)return 'Collect at least 90 MB before reviewing observations.';
 if(id==='eclipse-end'&&s.phaseTime<180)return 'Eclipse ends in '+Math.ceil(180-s.phaseTime)+' seconds. Conserve energy or collect optional data.';
 if(id==='transmit'&&(!contactOpen(s)||s.stored<=0))return s.stored<=0?'No data remains in storage.':'Ground contact opens in '+Math.ceil(30-s.phaseTime%90)+' seconds.';
 if(id==='return'&&s.transmitted<90)return 'Transmit at least 90 MB to the ground.';
 if(id==='deorbit'&&!s.done.includes('secure'))return 'Secure the laboratory equipment first.';
 return '';
}
export function startAction(s,id,room,context={}) {
 const reason=canAction(s,id,room,context); if(reason)return {ok:false,reason};
 const a=objectives(s).find(a=>a.id===id);
 if(a.seconds>0){s.activity={id,room,remaining:a.seconds,total:a.seconds};return {ok:true};}
 return completeAction(s,id);
}
export function completeAction(s,id) {
 if(!objectives(s).some(a=>a.id===id))return {ok:false,reason:'This action is not available now.'};
 if(id==='fuse'&&!(s.phase==='eclipse'&&s.isolated&&s.spare))return {ok:false,reason:'Isolate the circuit and retrieve a spare first.'};
 s.log.push({time:s.elapsed,text:objectives(s).find(a=>a.id===id)?.label||id});
 if(!s.done.includes(id))s.done.push(id);
 switch(id){
 case 'launch':phase(s,'launch');break;
 case 'deploy':s.arrays=true;break;
 case 'autopilot':s.autopilot=true;break;
 case 'commission':phase(s,s.missionId==='telescope'?'rendezvous':'science');break;
 case 'rendezvous':phase(s,'prepare');break;
 case 'tool':s.tool=true;break;
 case 'suit':s.suit=true;break;
 case 'tether':s.tether=true;break;
 case 'depressurize':s.depressurized=true;phase(s,'eva');break;
 case 'install':s.installed=true;break;
 case 'ingress':s.depressurized=false;s.verified=true;phase(s,'science');break;
 case 'calibrate':s.calibrated=true;break;
 case 'observe':case 'optional':s.observing=!s.observing;break;
 case 'advance':s.observing=false;s.fault=true;s.isolated=false;s.fuse=false;phase(s,'eclipse');break;
 case 'isolate':s.isolated=true;break;
 case 'spare':s.spare=true;break;
 case 'fuse':s.fuse=true;break;
 case 'restore':s.fault=false;s.isolated=false;s.spare=false;break;
 case 'eclipse-end':s.observing=false;phase(s,'downlink');break;
 case 'transmit':s.downlink=true;break;
 case 'return':s.downlink=false;phase(s,'return');break;
 case 'deorbit':phase(s,'reentry');break;
 }
 return {ok:true};
}
export function contactOpen(s){return s.phase==='downlink'&&s.phaseTime%90>=30;}
export function powerStatus(s){const e=evaluateDesign(s.design,s.missionId);const generation=s.arrays&&s.phase!=='eclipse'?e.parts.array.watts:0;const load=(s.conserve?600:800)+(s.observing&&!s.fault?e.parts.instrument.watts:0)+(s.downlink&&contactOpen(s)?250:0);return {generation,load,net:generation-load,capacity:e.parts.battery.wh};}
export function tickCampaign(s,dt) {
 if(s.paused||terminal(s)||!Number.isFinite(dt)||dt<=0)return;
 // Cap catch-up after tab suspension; callers use a fixed step for deterministic resource accounting.
 const t=Math.min(dt,.25);s.elapsed+=t;s.phaseTime+=t;s.crewTimer=(s.crewTimer||0)+t;
 if(s.crewCommand==='monitor'&&s.energy/powerStatus(s).capacity<.25)s.conserve=true;
 if(s.crewCommand==='prepare'&&s.crewTimer>=20){
  if(s.phase==='prepare'&&!s.tool){s.tool=true;s.done.push('tool');s.log.push({time:s.elapsed,text:'Fernando prepared the replacement instrument.'});}
  if(s.phase==='return'&&!s.done.includes('secure')){s.done.push('secure');s.log.push({time:s.elapsed,text:'Fernando secured the laboratory for return.'});}
  s.crewTimer=0;
 }
 const power=powerStatus(s);s.energy=Math.max(0,Math.min(power.capacity,s.energy+power.net*t*s.simulationRate/3600));s.minEnergy=Math.min(s.minEnergy,s.energy);
 if(s.observing&&!s.fault&&s.energy>0){const rate=evaluateDesign(s.design,s.missionId).parts.instrument.rate*(s.crewCommand==='orientation'?1.1:1);const produced=rate*t;const accepted=Math.min(produced,240-s.stored);s.stored+=accepted;s.dataLost+=produced-accepted;if(s.phase==='eclipse'&&s.stored>=120)s.optional=true;}
 if(s.downlink&&contactOpen(s)&&s.energy>0){const rate=evaluateDesign(s.design,s.missionId).parts.radio.rate;const sent=Math.min(s.stored,rate*t);s.stored-=sent;s.transmitted+=sent;}
 if(s.activity){s.activity.remaining-=t;if(s.activity.remaining<=0){const id=s.activity.id;s.activity=null;completeAction(s,id);}}
 if(s.phase==='launch'&&s.phaseTime>=45)phase(s,'commission');
 if(s.phase==='reentry'&&s.phaseTime>=45){s.returned=true;phase(s,'complete');}
 if(s.energy<=0){s.observing=false;s.downlink=false;s.failedReason='Electrical reserves were exhausted. Reconfigure the battery or suspend nonessential loads earlier.';phase(s,'failed');}
}
export function abortCampaign(s){if(!terminal(s)){s.observing=false;s.downlink=false;phase(s,'aborted');}}
export function campaignReport(s){const e=evaluateDesign(s.design,s.missionId);const science=Math.min(1,s.transmitted/90),safe=s.returned?1:0;const score=Math.round(science*500+safe*300+(s.done.includes('restore')?100:0)+(s.optional?50:0)+(safe?50*s.minEnergy/e.parts.battery.wh:0));return {success:s.phase==='complete'&&s.transmitted>=90,score,science:s.transmitted,minimumBattery:s.minEnergy/e.parts.battery.wh*100,minutes:s.elapsed/60,feedback:[s.failedReason||'The spacecraft configuration and your operating decisions jointly determined the energy margin.',s.minEnergy/e.parts.battery.wh<.2?'Battery reserve fell below 20%. A larger battery or earlier load shedding would improve the margin.':'Battery reserves remained above the critical margin.',s.dataLost>0?'Storage filled: '+Math.round(s.dataLost)+' MB was lost. Suspend collection or downlink earlier.':'All collected data stayed within storage capacity.',s.done.includes('restore')?'You isolated, repaired and restored the laboratory circuit.':'The laboratory recovery procedure was not completed.']};}
export function encodeSave(s){return JSON.stringify({version:CAMPAIGN_VERSION,state:s});}
export function decodeSave(raw){try{const data=JSON.parse(raw);const x=data.state;if(data.version!==CAMPAIGN_VERSION||!x||!MISSIONS.some(m=>m.id===x.missionId&&m.available)||!Object.hasOwn(PHASE_NAMES,x.phase)||!evaluateDesign(x.design,x.missionId).valid)return null;const base=createCampaign(x.missionId,x.design);for(const key of Object.keys(base)){if(typeof base[key]==='number'){if(!Number.isFinite(x[key])||x[key]<0)return null;base[key]=x[key];}else if(typeof base[key]==='boolean')base[key]=!!x[key];}if(x.energy>evaluateDesign(x.design,x.missionId).parts.battery.wh||x.stored>240)return null;base.phase=x.phase;base.done=Array.isArray(x.done)?x.done.filter(k=>typeof k==='string').slice(0,100):[];base.log=Array.isArray(x.log)?x.log.filter(k=>typeof k.text==='string'&&Number.isFinite(k.time)).slice(-200):[];base.failedReason=typeof x.failedReason==='string'?x.failedReason:'';base.crewCommand=['monitor','orientation','prepare'].includes(x.crewCommand)?x.crewCommand:'monitor';base.paused=false;base.activity=null;base.simulationRate=8;return base;}catch{return null;}}
