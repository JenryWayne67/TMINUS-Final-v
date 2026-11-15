// Pure helpers for the "better multiplayer" layer: route risk/reward, crew route votes, ranked results and tips.
// Everything is derived from existing game state, with no new random numbers.
import {SPECIALISTS} from './expedition-core.js';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Estimated odds that a rival ambushes you, from the route's debris hazard and how long you are exposed.
export function routeRisk(route, budget) {
  const ambush = Math.round(clamp(route.hazard * 14 + route.duration * 0.18, 5, 60));
  const reward = Math.round(clamp(100 - route.duration * 0.6 + (budget.margin > 0 ? Math.min(20, budget.margin / 5) : -30), 0, 120));
  return {ambush, reward, label: ambush < 25 ? 'LOW RISK' : ambush < 36 ? 'MODERATE RISK' : 'HIGH RISK'};
}

// Each crew member recommends the route that suits their job. Returns {votes:[{role,name,routeId}], winner}.
export function crewVotes(routes, budgets) {
  const valid = routes.filter((r, i) => budgets[i].valid);
  if (!valid.length) return {votes: [], winner: null};
  const pick = fn => valid.reduce((a, b) => (fn(b) < fn(a) ? b : a)).id;
  const byRole = [r => r.dv, r => r.hazard, r => r.duration, r => Math.abs(r.hazard - 1)]; // pilot fuel, engineer safety, gunner speed, raider balance
  const votes = SPECIALISTS.map((s, i) => ({role: s.role, name: s.name, routeId: pick(byRole[i])}));
  const tally = {}; votes.forEach(v => { tally[v.routeId] = (tally[v.routeId] || 0) + 1; });
  const winner = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || (a === votes[0].routeId ? -1 : 1))[0];
  return {votes, winner};
}

// Teams ranked by flags delivered, then progress. Rank 1 is first.
export function rankTeams(teams) {
  return [...teams].map((t, i) => ({...t, index: i})).sort((a, b) => (b.delivered - a.delivered) || ((b.progress || 0) - (a.progress || 0)) || a.index - b.index)
    .map((t, i) => ({name: t.name, symbol: t.symbol, color: t.color, delivered: t.delivered, eliminated: !!t.eliminated, you: t.index === 0, rank: i + 1}));
}

// What each specialist's parts and tasks contributed: parts secured and cargo stowed under their name.
export function roleContribution(state) {
  return SPECIALISTS.map((s, i) => {
    const parts = state.parts.filter(p => p.owner === i && p.stage === 'secured').length;
    const cargo = state.cargo.filter(c => c.owner === i && c.stowed).length;
    return {role: s.role, name: s.name, parts, cargo, points: parts * 75 + cargo * 60};
  });
}

// Short plain-language tips for the next match, from what happened in this one.
export function matchTips(state, result) {
  const tips = [];
  if (state.teams[0].eliminated) tips.push('Your crew was eliminated: keep the shield up and the Engineer on hull repairs during flight.');
  if (state.propellant < (state.route?.returnReserve || 0)) tips.push('You ran low on return fuel: pick the Shielded passage or lighten the ship.');
  if (state.hull < 40) tips.push('The hull took heavy damage: Structure first and the Shielded passage cost time but protect it.');
  if (result.delivered < 3) tips.push('Few flags were delivered: scan and extract sooner, and carry them straight to the receiving station.');
  if (result.rank > 1) tips.push('A rival finished ahead: try the Flight systems first build order and a faster route.');
  if (!tips.length) tips.push('Strong run. Try the Debris slingshot for a faster, riskier match.');
  return tips;
}
