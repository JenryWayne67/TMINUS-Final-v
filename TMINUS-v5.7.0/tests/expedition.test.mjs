import {test} from 'node:test';import assert from 'node:assert/strict';
import {PARTS,SPECIALISTS,createExpedition,assignPart,pickPart,rotateCarried,placePart,fastenBolt,pickCargo,stowCargo,runCheck,routeBudget,launchFlight,tickSystems,maintainSystem,removePanel,repairPanel,useSkill,tickRivals,completeFlight} from '../dist/expedition-core.js';
function assemble(s){s.mode='play';for(const p of s.parts){assert.ok(pickPart(s,p.id,p.owner));while(s.rotation[p.owner]!==p.angle)rotateCarried(s,p.owner);assert.ok(placePart(s,p.owner,2));for(let b=0;b<3;b++)fastenBolt(s,p.id,b,p.owner,1,2,true);}}
function outfit(s){for(const c of s.cargo){assert.ok(pickCargo(s,c.id,c.owner));assert.ok(stowCargo(s,c.owner,1));}for(const [id,role,value]of[['pressure',1,101.3],['power',1,55],['engine',0,73]])assert.ok(runCheck(s,id,role,3,value));}
test('every expedition has four distinct specialists and four fixed faction colors',()=>{const a=createExpedition(4),b=createExpedition(4),c=createExpedition(38);assert.equal(SPECIALISTS.length,4);assert.equal(new Set(a.teams.map(t=>t.color)).size,4);assert.deepEqual(a.teams,b.teams);assert.deepEqual(a.teams.map(t=>t.color),c.teams.map(t=>t.color));assert.equal(a.teams.filter(t=>t.ai).length,3);});
test('manual assignment is available before deployment and preserves one owner per part',()=>{const s=createExpedition();assert.ok(assignPart(s,'reactor',3));assert.equal(s.parts.find(p=>p.id==='reactor').owner,3);assert.equal(assignPart(s,'reactor',8),false);s.mode='play';assert.equal(assignPart(s,'reactor',1),false);});
test('parts must be carried by their owner, correctly rotated and placed within reach',()=>{const s=createExpedition();s.mode='play';const p=s.parts.find(p=>p.angle===1);assert.equal(pickPart(s,p.id,2),false);assert.ok(pickPart(s,p.id,p.owner));assert.equal(placePart(s,p.owner,1),false);rotateCarried(s,p.owner);assert.equal(placePart(s,p.owner,8),false);assert.ok(placePart(s,p.owner,2));assert.equal(s.carry[p.owner],null);assert.equal(p.stage,'positioned');});
test('all 36 fasteners require aligned, nearby tool work; completed mounts cannot score twice',()=>{const s=createExpedition();s.mode='play';const p=s.parts[0];pickPart(s,p.id,p.owner);placePart(s,p.owner,2);assert.equal(fastenBolt(s,p.id,0,p.owner,1,5,true),false);assert.equal(fastenBolt(s,p.id,0,p.owner,1,2,false),false);for(let i=0;i<3;i++)fastenBolt(s,p.id,i,p.owner,1,2,true);assert.equal(p.stage,'secured');assert.equal(s.score,75);assert.equal(fastenBolt(s,p.id,0,p.owner,1,2,true),false);});
test('all twelve assembled components unlock cargo loading, followed by three physical system tests',()=>{const s=createExpedition();assert.equal(pickCargo(s,'rations',2),false);assemble(s);assert.equal(s.phase,'outfit');assert.equal(runCheck(s,'power',1,3,55),false);outfit(s);assert.equal(s.phase,'route');assert.ok(s.cargo.every(c=>c.stowed));assert.ok(Object.values(s.checks).every(v=>v===1));});
test('calibration tests reject the wrong specialist and values outside their green range',()=>{const s=createExpedition();assemble(s);for(const c of s.cargo){pickCargo(s,c.id,c.owner);stowCargo(s,c.owner,1);}assert.equal(runCheck(s,'power',0,3,55),false);assert.equal(runCheck(s,'power',1,3,85),false);assert.equal(s.checks.power,0);assert.ok(runCheck(s,'power',1,1,55));assert.ok(s.checks.power>0&&s.checks.power<1);});
test('rocket-equation route cost grows with mass and delta-v and reserves fuel for return',()=>{const s=createExpedition();const low=routeBudget(s,'sheltered'),high=routeBudget(s,'slingshot');assert.ok(high.outbound>low.outbound);assert.ok(low.required>low.outbound+low.returnReserve);s.wetMass*=2;assert.ok(routeBudget(s,'sheltered').outbound>low.outbound);s.propellant=1;s.phase='route';assert.equal(launchFlight(s,'sheltered'),false);});
test('engineering tools affect distinct, measured ship systems',()=>{const s=createExpedition();s.mode='play';s.phase='flight';s.fault='cooling';s.temperature=80;assert.ok(maintainSystem(s,1,1,'coolant'));assert.equal(s.fault,null);assert.ok(s.temperature<80);s.fault='scrubber';s.co2=2500;s.pressure=75;maintainSystem(s,1,1,'scrubber');assert.equal(s.fault,null);assert.ok(s.co2<2500);assert.ok(s.pressure>75);});
test('EVA repairs require removing a damaged plate, time to weld and a spare plate',()=>{const s=createExpedition();s.phase='flight';const p=s.panels[0];p.health=20;assert.equal(repairPanel(s,p.id,3,3),false);assert.equal(removePanel(s,p.id,0),false);assert.ok(removePanel(s,p.id,3));assert.ok(repairPanel(s,p.id,3,1));assert.ok(p.progress<1);assert.ok(repairPanel(s,p.id,3,2));assert.equal(p.health,100);assert.equal(s.spares,5);assert.equal(repairPanel(s,p.id,3,3),false);});
test('all roles have bounded abilities, cooldowns and ultimate charge requirements',()=>{const s=createExpedition();s.mode='play';for(let role=0;role<4;role++){assert.ok(useSkill(s,role,'q'));assert.equal(useSkill(s,role,'q'),false);assert.ok(useSkill(s,role,'alt'));assert.equal(useSkill(s,role,'f'),false);s.ultimate[role]=100;assert.ok(useSkill(s,role,'f'));assert.equal(s.ultimate[role],0);}});
test('flight faults deplete reserves, rival crews progress, and all roles can recover mission systems',()=>{const s=createExpedition(2);assemble(s);outfit(s);assert.ok(launchFlight(s,'sheltered'));const battery=s.power;for(let i=0;i<1200;i++){tickSystems(s,.05);tickRivals(s,.05);if(i%10===0){maintainSystem(s,1,.5,s.temperature>60?'coolant':'reactor');maintainSystem(s,1,.5,'scrubber');for(const p of s.panels)if(p.health<60){if(!p.removed)removePanel(s,p.id,3);repairPanel(s,p.id,3,.5);}}}assert.ok(s.log.length>0);assert.ok(s.teams[1].progress>0);assert.ok(s.power>=0&&s.power<=s.powerCapacity);assert.ok(Number.isFinite(s.temperature));assert.equal(s.ended,false);assert.ok(s.flightTime>59);assert.ok(battery>0);});
test('outbound transit lands at Planet B; the return pays its reserve and docks for delivery',()=>{const s=createExpedition();assemble(s);outfit(s);launchFlight(s,'sheltered');s.flightTime=s.route.duration;assert.ok(completeFlight(s));assert.equal(s.phase,'landing');assert.equal(s.won,false);s.phase='flight';s.flightLeg='return';s.flightTime=60;assert.ok(completeFlight(s));assert.equal(s.phase,'docking');assert.equal(s.won,false);assert.equal(completeFlight(s),false);});

test('assembly machines secure the whole ship in 15 seconds', async () => {
  const {createExpedition, tickRivals, pickPart, AUTO_BUILD_SECONDS} = await import('../dist/expedition-core.js');
  const s = createExpedition(7); s.mode = 'play'; s.autoBuild = {enabled: true, t: 0};
  assert.equal(AUTO_BUILD_SECONDS, 15);
  assert.equal(pickPart(s, s.parts[0].id, s.parts[0].owner), false, 'manual pickup is disabled');
  for (let i = 0; i < 14.5 * 20; i++) tickRivals(s, .05);
  assert.equal(s.phase, 'assembly'); assert.ok(s.parts.some(p => p.stage !== 'secured'));
  for (let i = 0; i < 0.6 * 20; i++) tickRivals(s, .05);
  assert.equal(s.phase, 'outfit'); assert.ok(s.parts.every(p => p.stage === 'secured' && p.bolts.every(b => b === 1)));
});

test('build priority reorders the machines and locks after the start', async () => {
  const {createExpedition, tickRivals, setBuildPriority, buildOrder, machineStatus} = await import('../dist/expedition-core.js');
  const s = createExpedition(3); s.mode = 'play'; s.autoBuild = {enabled: true, t: 0, priority: 'standard'};
  assert.equal(setBuildPriority(s, 'systems'), true);
  assert.equal(buildOrder(s)[0].id, 'port'); assert.equal(machineStatus(s.parts[0]), 'QUEUED');
  for (let i = 0; i < 40; i++) tickRivals(s, .05);
  assert.equal(setBuildPriority(s, 'structure'), false);
  for (let i = 0; i < 14 * 20; i++) tickRivals(s, .05);
  assert.equal(s.phase, 'outfit'); assert.ok(s.parts.every(p => p.stage === 'secured'));
});

test('route risk, crew votes, ranking and tips are derived and sane', async () => {
  const {createExpedition, ROUTES, routeBudget} = await import('../dist/expedition-core.js');
  const {routeRisk, crewVotes, rankTeams, roleContribution, matchTips} = await import('../dist/better-core.js');
  const s = createExpedition(5), bs = ROUTES.map(r => routeBudget(s, r));
  const risks = ROUTES.map((r, i) => routeRisk(r, bs[i]));
  assert.ok(risks[2].ambush > risks[0].ambush, 'slingshot riskier than shielded');
  const v = crewVotes(ROUTES, bs); assert.equal(v.votes.length, 4); assert.ok(ROUTES.some(r => r.id === v.winner));
  const r = rankTeams(s.teams.map((t, i) => ({...t, delivered: [2, 5, 1, 0][i]})));
  assert.equal(r[0].rank, 1); assert.equal(r.find(x => x.you).rank, 2);
  assert.equal(roleContribution(s).length, 4);
  assert.ok(matchTips(s, {delivered: 0, rank: 4}).length >= 1);
});

test('match options, lobby, cargo balance, alerts, raids and timeline', async () => {
  const {createExpedition} = await import('../dist/expedition-core.js');
  const X = await import('../dist/match-extras.js');
  const s = createExpedition(9);
  assert.equal(X.applyOptions(s, {difficulty: 'expert', length: 'long'}), true);
  assert.equal(s.match.limit, 1200); assert.equal(X.damageScale(s), 1.3); assert.equal(X.faultInterval(s), 15);
  assert.equal(X.applyOptions(s, {difficulty: 'nope'}), false);
  const l = X.createLobby(4); assert.equal(l.code.length, 5); assert.equal(X.allReady(l), false);
  X.toggleReady(l); assert.equal(X.allReady(l), true);
  assert.ok(X.joinSeat(l) > 0); assert.equal(X.allReady(l), false);
  assert.equal(X.postChat(l, 'You', '  hi '), true); assert.equal(X.postChat(l, 'You', '  '), false);
  s.cargo.forEach(c => { c.stowed = true; });
  assert.ok(X.cargoBalance(s).mass > 0); s.cargo[0].stowed = true; s.cargo[2].stowed = true; s.cargo[1].stowed = false; s.cargo[3].stowed = false;
  assert.equal(X.cargoBalance(s).status, 'UNBALANCED');
  assert.equal(X.outfitTasks(s).length, 4);
  s.fault = 'cooling'; s.hull = 10; assert.ok(X.roleAlerts(s).length >= 2);
  s.route = {hazard: 1.5}; s.shield = 0; assert.ok(X.raidOdds(s, 4) > X.raidOdds(s, 1)); s.shield = 5; assert.ok(X.raidOdds(s, 4) < X.raidOdds({...s, shield: 0}, 4));
  assert.equal(X.rollRaid(s, 0, () => 0), false); assert.equal(X.rollRaid(s, 3, () => 0), true);
  X.mark(s, 'Launch'); assert.equal(X.timelineText(s)[0].text, 'Launch');
});
