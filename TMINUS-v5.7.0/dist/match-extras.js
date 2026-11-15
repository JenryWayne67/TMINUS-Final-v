// Pure logic for match options, room/lobby, cargo balance, role alerts, raid risk and the key-moment timeline.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const DIFFICULTY = {
  cadet: {label: 'CADET', damage: .75, faultEvery: 26},
  standard: {label: 'STANDARD', damage: 1, faultEvery: 20},
  expert: {label: 'EXPERT', damage: 1.3, faultEvery: 15}
};
export const LENGTHS = {short: {label: 'SHORT 10 MIN', limit: 600}, standard: {label: 'STANDARD 14 MIN', limit: 840}, long: {label: 'LONG 20 MIN', limit: 1200}};

export function applyOptions(state, {difficulty = 'standard', length = 'standard'} = {}) {
  if (!DIFFICULTY[difficulty] || !LENGTHS[length]) return false;
  state.options = {difficulty, length};
  state.match.limit = LENGTHS[length].limit;
  return true;
}
export const damageScale = state => DIFFICULTY[state.options?.difficulty || 'standard'].damage;
export const faultInterval = state => DIFFICULTY[state.options?.difficulty || 'standard'].faultEvery;

// ---- lobby / room ----
export function roomCode(seed) { let s = (seed >>> 0) || 1, out = ''; const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let i = 0; i < 5; i++) { s = (s * 1664525 + 1013904223) >>> 0; out += A[s % A.length]; } return out; }
export function createLobby(seed) {
  return {code: roomCode(seed), ready: false, chat: [], seats: Array.from({length: 16}, (_, i) => ({seat: i, human: i === 0, bot: i !== 0, ready: i !== 0}))};
}
export function toggleReady(lobby) { lobby.ready = !lobby.ready; lobby.seats[0].ready = lobby.ready; return lobby.ready; }
export const allReady = lobby => lobby.seats.every(s => s.ready);
export function joinSeat(lobby) { const s = lobby.seats.find(s => s.bot && s.seat < 4 && !s.human); if (!s) return false; s.human = true; s.bot = false; s.ready = false; return s.seat; }   // a second human takes a crew seat
export function postChat(lobby, who, text) { text = String(text || '').trim().slice(0, 160); if (!text) return false; lobby.chat.push({who, text}); if (lobby.chat.length > 40) lobby.chat.shift(); return true; }
const BOT_LINES = ['Ready when you are.', 'Parts look good on my side.', 'I will cover the turret.', 'Let us bring those flags home.', 'Copy that.'];
export const botReply = n => BOT_LINES[Math.abs(n) % BOT_LINES.length];

// ---- cargo mass and balance ----
export const CARGO_MASS = {propellant: 60, coolant: 35, rations: 28, spares: 22};
export const CARGO_SIDE = {propellant: -1, coolant: 1, rations: -1, spares: 1};            // left / right of the keel
export function cargoBalance(state) {
  let mass = 0, moment = 0;
  for (const c of state.cargo) if (c.stowed) { mass += CARGO_MASS[c.id] || 20; moment += (CARGO_MASS[c.id] || 20) * (CARGO_SIDE[c.id] || 0); }
  const offset = mass ? moment / mass : 0;
  const status = Math.abs(offset) < .35 ? 'BALANCED' : Math.abs(offset) < .7 ? 'LISTING' : 'UNBALANCED';
  return {mass, offset, status, ok: status !== 'UNBALANCED'};
}
// Each specialist's own outfit task, so nobody idles.
export function outfitTasks(state) {
  const c = state.cargo, chk = state.checks;
  return [
    {role: 0, text: 'Stow the propellant kit, then run the ENGINE test', done: !!c.find(x => x.id === 'propellant')?.stowed && chk.engine >= 1},
    {role: 1, text: 'Run POWER and PRESSURE tests, stow coolant tools', done: chk.power >= 1 && chk.pressure >= 1 && !!c.find(x => x.id === 'coolant')?.stowed},
    {role: 2, text: 'Stow rations and keep the load balanced', done: !!c.find(x => x.id === 'rations')?.stowed},
    {role: 3, text: 'Stow the EVA replacement plates', done: !!c.find(x => x.id === 'spares')?.stowed}
  ];
}

// ---- flight alerts, one per role that has something to do ----
export function roleAlerts(state) {
  const a = [];
  if (state.fault) a.push({role: 1, level: 'bad', text: 'ENGINEER: fault ' + state.fault.toUpperCase() + ' - service it at the console'});
  if (state.hull < 40) a.push({role: 0, level: 'bad', text: 'PILOT: hull ' + Math.round(state.hull * 20) + ' / 2000 - evade debris'});
  if (state.route && state.propellant < state.route.returnReserve) a.push({role: 0, level: 'warn', text: 'PILOT: return fuel is low'});
  if (state.co2 > 3000) a.push({role: 3, level: 'warn', text: 'RAIDER: CO2 rising - check the scrubber'});
  if (state.power < 1) a.push({role: 1, level: 'bad', text: 'ENGINEER: power nearly out'});
  if (state.shield <= 0 && state.phase === 'flight') a.push({role: 2, level: 'info', text: 'GUNNER: shield is down - raise it before contact'});
  return a;
}
// What the next scheduled fault will be, and when (faults are on a fixed clock).
export const nextFaultIn = state => Math.max(0, Math.ceil(state.faultClock));

// ---- delivery raid risk ----
export function raidOdds(state, onboard) {
  const hazard = state.route?.hazard || 1;
  const odds = 8 + onboard * 4 + hazard * 6 - (state.shield > 0 ? 10 : 0) - (state.hull > 70 ? 4 : 0);
  return Math.round(clamp(odds, 3, 55));
}
export function rollRaid(state, onboard, rand) { return onboard > 0 && rand() * 100 < raidOdds(state, onboard); }

// ---- key-moment timeline for the debrief replay ----
export function mark(state, text) { (state.timeline ??= []).push({t: Math.round(state.match.time), text}); if (state.timeline.length > 60) state.timeline.shift(); }
export function timelineText(state) {
  const events = [...(state.timeline || []), ...(state.log || []).map(l => ({t: Math.round(l.time), text: 'Fault: ' + l.event}))];
  return events.sort((a, b) => a.t - b.t);
}
