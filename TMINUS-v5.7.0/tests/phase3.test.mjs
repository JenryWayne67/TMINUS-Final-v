import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,pickPart,placePart,rotateCarried,fastenBolt,tickRivals,runCheck} from '../dist/expedition-core.js';
import {CONSTRUCTION_STYLES,CONTRACTS,setConstructionStyle,recordCrewAction,missionContracts,missionSummary,normalizeProfile,playerRank,debriefPayout} from '../dist/phase3-core.js';

const find = (s,id) => missionContracts(s).find(c=>c.id===id);

test('construction styles are explicit, default to hands-on, and cannot change midgame',()=>{
 const s=createExpedition(61);
 assert.equal(s.constructionStyle,'guided');
 assert.equal(Object.keys(CONSTRUCTION_STYLES).length,2);
 assert.equal(setConstructionStyle(s,'automatic'),true);
 assert.equal(s.constructionStyle,'automatic');
 assert.equal(setConstructionStyle(s,'garbage'),false);
 s.mode='play';
 assert.equal(setConstructionStyle(s,'guided'),false);
});
test('human securing one part records a manual contract, bot work never impersonates player',()=>{
 const s=createExpedition(62);s.mode='play';
 const manual=s.parts.find(p=>p.owner===s.selected);
 assert.equal(pickPart(s,manual.id,manual.owner),true);
 while(s.rotation[manual.owner]!==manual.angle)rotateCarried(s,manual.owner);
 assert.equal(placePart(s,manual.owner,1),true);
 for(let i=0;i<3;i++)assert.equal(fastenBolt(s,manual.id,i,manual.owner,1,2,true),true);
 assert.equal(find(s,'hands').done,true);
 assert.equal(s.crewActions.humanModules,1);
 // A different owner can build with AI without granting a HUMAN contract.
 const bot=s.parts.find(p=>p.owner!==s.selected);
 assert.equal(pickPart(s,bot.id,bot.owner),true);
 while(s.rotation[bot.owner]!==bot.angle)rotateCarried(s,bot.owner);
 assert.equal(placePart(s,bot.owner,2),true);
 for(let i=0;i<3;i++)assert.equal(fastenBolt(s,bot.id,i,bot.owner,1,2,true,'bot'),true);
 assert.equal(s.crewActions.humanModules,1);
});
test('fast assembly charges the full module cost, cannot duplicate purchase, and cannot yield manual achievements',()=>{
 const s=createExpedition(63);s.mode='play';s.autoBuild={enabled:true,t:0,priority:'standard'};
 const first=s.credits, prices=s.parts.reduce((n,p)=>n+p.price,0);
 for(let i=0;i<320;i++)tickRivals(s,.05);
 assert.equal(s.phase,'outfit');
 assert.equal(s.credits,first-prices);
 assert.ok(s.parts.every(p=>p.purchased&&p.stage==='secured'));
 assert.equal(s.crewActions.humanModules,0);
 assert.equal(find(s,'hands').done,false);
 assert.equal(find(s,'assembly').done,true);
});
test('mission cards are derived from match facts, do not reward undeployed inventory, and clamp progress',()=>{
 const s=createExpedition(64);
 assert.equal(CONTRACTS.length,8);
 assert.equal(missionSummary(s).done,0);
 assert.equal(recordCrewAction(s,'unknown',10),false);
 assert.equal(recordCrewAction(s,'combatHits',-1),false);
 assert.equal(recordCrewAction(s,'combatHits',3),true);
 assert.equal(find(s,'defend').done,true);
 s.match.flags[0].state='onboard';s.match.flags[0].owner=0;
 assert.equal(find(s,'sample').done,true);
 assert.equal(find(s,'deliver').done,false,'loaded is not delivered');
 s.match.flags[0].state='delivered';s.match.teams[0].delivered=1;
 assert.equal(find(s,'deliver').done,true);
 s.match.teams[0].planet='A';s.flightLeg='return';
 assert.equal(find(s,'return').done,true);
 s.match.teams[0].eliminated=true;
 assert.equal(find(s,'return').done,false);
});
test('bonuses are paid at debrief only and never modify match ranking',()=>{
 const s=createExpedition(65),base={xp:25,credits:10};
 const initialTeams=JSON.stringify(s.match.teams);
 recordCrewAction(s,'combatHits',3);
 s.match.teams[0].delivered=1;s.match.flags[0].state='delivered';s.match.flags[0].owner=0;
 const p=debriefPayout(s,base,{xp:240,credits:15,matches:2});
 assert.equal(p.summary.done,3);
 assert.equal(p.xp,25+40+45+85);
 assert.equal(p.credits,10+30+35+60);
 assert.equal(p.profile.xp,240+p.xp);
 assert.equal(p.profile.matches,3);
 assert.equal(JSON.stringify(s.match.teams),JSON.stringify(JSON.parse(initialTeams).map((team,i)=>i===0?{...team,delivered:1}:team)));
});
test('profile input is clamped and cosmetic rank milestones are predictable',()=>{
 assert.equal(normalizeProfile({xp:-50,credits:NaN}).xp,0);
 assert.equal(playerRank(0).level,1);
 assert.equal(playerRank(249).percent,249/250*100);
 assert.equal(playerRank(250).level,2);
 assert.equal(playerRank(750).toNext,250);
 assert.deepEqual(normalizeProfile({badges:['One','One',4,'Two']}).badges,['One','Two']);
});
test('assisted construction remains compatible with existing system-calibration transition',()=>{
 const s=createExpedition(66);s.mode='play';
 for(const p of s.parts){assert.ok(pickPart(s,p.id,p.owner));while(s.rotation[p.owner]!==p.angle)rotateCarried(s,p.owner);assert.ok(placePart(s,p.owner,2));for(let i=0;i<3;i++)fastenBolt(s,p.id,i,p.owner,1,2,true,'bot');}
 assert.equal(s.phase,'outfit');
 s.cargo.forEach(c=>{c.stowed=true});
 assert.ok(runCheck(s,'pressure',1,3,101.3));
 assert.ok(runCheck(s,'power',1,3,55));
 assert.ok(runCheck(s,'engine',0,3,73));
 assert.equal(s.phase,'route');
 assert.equal(find(s,'checks').done,true);
});

test('stalled AI build recovery finishes paid robot work but not a human objective',async()=>{
 const {rescueStalledCrew}=await import('../dist/expedition-core.js');
 const s=createExpedition(67);s.mode='play';s.selected=3;
 const p=s.parts.find(x=>x.owner===0);
 for(let i=0;i<1200&&p.stage!=='secured';i++)rescueStalledCrew(s,0,.05);
 assert.equal(p.stage,'secured','a stuck teammate eventually finishes its part');
 assert.equal(s.credits,4800-p.price,'the rescued part is paid for');
 assert.equal(s.crewActions.humanModules,0);
 const human=s.parts.find(x=>x.owner===3);
 for(let i=0;i<500;i++)rescueStalledCrew(s,3,.05);
 assert.equal(human.stage,'shelf','watchdog cannot silently complete human-owned parts');
 s.autoBuild.enabled=true;
 const other=s.parts.find(x=>x.owner===1);
 for(let i=0;i<400;i++)rescueStalledCrew(s,1,.05);
 assert.equal(other.stage,'shelf','full auto and AI recovery never race');
});
