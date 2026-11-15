// Phase 3: deterministic, browser-independent construction and mission progression.
// Contracts are evaluated from real match state. Rewards are paid once, at debrief.
export const CONSTRUCTION_STYLES = Object.freeze({
  guided: {label: 'HANDS-ON + CREW', description: 'You place and fasten your role\'s parts. AI teammates construct theirs.'},
  automatic: {label: 'FAST ASSEMBLY', description: 'Robotic assembly completes all modules in about 15 seconds.'}
});
export const ACTION_KEYS = Object.freeze(['humanModules', 'combatHits', 'samples']);
const number = (x, max=100000000) => Number.isFinite(Number(x)) ? Math.min(max, Math.max(0, Math.floor(Number(x)))) : 0;
export function setConstructionStyle(state, style) {
  if (!CONSTRUCTION_STYLES[style] || !['menu', 'select'].includes(state.mode)) return false;
  state.constructionStyle = style;
  return true;
}
export function recordCrewAction(state, key, count=1) {
  if (!ACTION_KEYS.includes(key) || !Number.isInteger(count) || count <= 0) return false;
  const a = state.crewActions ??= {humanModules: 0, combatHits: 0, samples: 0};
  a[key] = Math.min(9999, number(a[key], 9999) + count);
  return true;
}
const spec = [
  {id:'hands', role:'BUILD', name:'Hands on deck', detail:'Personally finish a complete spacecraft module', max:1, xp:65, credits:45},
  {id:'assembly', role:'CREW', name:'Spacecraft assembled', detail:'All 12 modules secured by your four-person crew', max:12, xp:35, credits:25},
  {id:'checks', role:'ENGINEER', name:'Systems green', detail:'Finish engine, pressure, and power tests', max:3, xp:45, credits:30},
  {id:'launch', role:'PILOT', name:'Clear the pad', detail:'Launch with a flight plan and return reserve', max:1, xp:35, credits:25},
  {id:'sample', role:'RAIDER', name:'First discovery', detail:'Extract or recover one science flag for Orange', max:1, xp:45, credits:35},
  {id:'defend', role:'GUNNER', name:'Defensive action', detail:'Land three verified hits on rival targets', max:3, xp:40, credits:30},
  {id:'return', role:'PILOT', name:'Safe return', detail:'Bring the crew back to Planet A without elimination', max:1, xp:55, credits:35},
  {id:'deliver', role:'RAIDER', name:'Science home', detail:'Transfer at least one flag to the receiving station', max:1, xp:85, credits:60}
];
export const CONTRACTS = Object.freeze(spec.map(c=>Object.freeze(c)));
export function missionContracts(state) {
  const team = state.match?.teams?.[0] || {};
  const carried = (state.match?.flags || []).filter(f=>f.owner===0 && ['carried','onboard','delivered'].includes(f.state)).length;
  const delivered = number(team.delivered, 12);
  const progress = {
    hands: number(state.crewActions?.humanModules),
    assembly: state.parts?.filter(p=>p.stage==='secured').length || 0,
    checks: Object.values(state.checks||{}).filter(v=>v>=1).length,
    launch: state.route ? 1 : 0,
    sample: Math.max(number(state.crewActions?.samples), carried, delivered),
    defend: number(state.crewActions?.combatHits),
    return: team.planet==='A' && !team.eliminated && state.flightLeg==='return' ? 1 : 0,
    deliver: delivered
  };
  return CONTRACTS.map(c=>({...c, value: Math.min(c.max, progress[c.id]||0), done:(progress[c.id]||0)>=c.max}));
}
export function missionSummary(state) {
  const cards=missionContracts(state), done=cards.filter(c=>c.done), active=cards.filter(c=>!c.done);
  return {cards, done:done.length, total:cards.length, xp:done.reduce((n,c)=>n+c.xp,0), credits:done.reduce((n,c)=>n+c.credits,0), active};
}
export function normalizeProfile(raw={}) {
  let value=raw;
  if (!value || typeof value!=='object'||Array.isArray(value)) value={};
  return {xp:number(value.xp),credits:number(value.credits),matches:number(value.matches,100000),badges:Array.isArray(value.badges)?[...new Set(value.badges.filter(x=>typeof x==='string'&&x.length<=30))].slice(0,32):[]};
}
export function playerRank(xp) {
  const level=Math.floor(number(xp)/250)+1;
  const titles=['Flight Cadet','Launch Specialist','Orbital Pathfinder','Frontier Engineer','Deep-Space Vanguard','Mission Commander'];
  return {level, label:titles[Math.min(titles.length-1,Math.floor((level-1)/3))], toNext:250-number(xp)%250, percent:(number(xp)%250)/250*100};
}
export function debriefPayout(state, base, prior={}) {
  const existing=normalizeProfile(prior), earned=missionSummary(state);
  const baseXp=number(base?.xp,10000), baseCredits=number(base?.credits,10000);
  // Pure calculation; the caller owns the exactly-once debrief guard.
  const xp=baseXp+earned.xp, credits=baseCredits+earned.credits;
  const badge=earned.done===CONTRACTS.length?'Full Crew Commendation':earned.done>=5?'Mission Specialist':earned.done>=2?'Spaceport Apprentice':null;
  const badges=badge?[...new Set([...existing.badges,badge])]:existing.badges;
  return {xp,credits,contractXp:earned.xp,contractCredits:earned.credits,summary:earned,profile:{...existing,xp:existing.xp+xp,credits:existing.credits+credits,matches:existing.matches+1,badges}};
}
