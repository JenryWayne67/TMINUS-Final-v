// What each crew member is doing and how far along they are, for the crew bar. Pure logic, no DOM.
// status: 'done' | 'working' | 'waiting' | 'alert'
import {SPECIALISTS} from './expedition-core.js';

// A part is not just built or not built: carrying and positioning count for something, and bolts count as they go in.
export function partProgress(p) {
  if (p.stage === 'secured') return 1;
  if (p.stage === 'positioned') return 0.55 + 0.45 * (p.bolts.reduce((a, b) => a + Math.min(1, b), 0) / 3);
  if (p.stage === 'carried') return 0.3;
  return 0;
}
const pct = x => Math.round(Math.max(0, Math.min(1, x)) * 100);
const mk = (role, human, percent, label, status, detail = '') => ({
  role, human, name: SPECIALISTS[role].name, title: SPECIALISTS[role].role, percent, label, status, detail});

export function crewStatus(s) {
  return [0, 1, 2, 3].map(role => {
    const human = s.selected === role;
    const phase = s.phase;
    if (phase === 'assembly') {
      const mine = s.parts.filter(p => p.owner === role), done = mine.filter(p => p.stage === 'secured').length;
      const x = mine.reduce((a, p) => a + partProgress(p), 0) / Math.max(1, mine.length), percent = pct(x);
      if (done === mine.length) return mk(role, human, 100, 'BUILD DONE', 'done', `${done}/${mine.length} parts secured`);
      const carrying = s.carry[role];
      return mk(role, human, percent, percent > 0 ? `BUILDING ${percent}%` : 'STARTING', percent > 0 ? 'working' : 'waiting',
        `${done}/${mine.length} parts secured${carrying ? ' · carrying a part' : ''}`);
    }
    if (phase === 'outfit') {
      const cases = s.cargo.filter(c => c.owner === role), tests = Object.entries(s.checks).filter(([id]) => (id === 'engine' ? 0 : 1) === role);
      const items = cases.length + tests.length, got = cases.filter(c => c.stowed).length + tests.reduce((a, [, v]) => a + Math.min(1, v), 0);
      const percent = items ? pct(got / items) : 100;
      if (percent >= 100) return mk(role, human, 100, 'CHECKS DONE', 'done', 'supplies stowed, tests passed');
      return mk(role, human, percent, `CHECKS ${percent}%`, percent > 0 ? 'working' : 'waiting', 'stowing supplies and running tests');
    }
    if (phase === 'route') return mk(role, human, 100, 'READY', 'done', 'waiting for the route');
    if (phase === 'flight') {
      if (role === 0) return mk(role, human, Math.round(s.hull), `HULL ${Math.round(s.hull)}%`, s.hull < 40 ? 'alert' : 'working', 'flying the ship');
      if (role === 1) return s.fault ? mk(role, human, 40, 'FAULT', 'alert', `${s.fault} fault to repair`) : mk(role, human, 100, 'SYSTEMS OK', 'done', 'no faults');
      if (role === 2) return mk(role, human, 100, 'ON TURRET', 'working', 'covering the route');
      const cap = s.cargoCapacity || 1, on = s.match.flags.filter(f => f.state === 'onboard' && f.owner === 0).length;
      return mk(role, human, pct(on / cap), `CARGO ${on}/${cap}`, on >= cap ? 'done' : 'working', 'watching the cargo deck');
    }
    if (phase === 'surface') {
      const cap = s.cargoCapacity || 1, flags = s.match.flags.filter(f => f.owner === 0);
      const on = flags.filter(f => f.state === 'onboard').length, carried = flags.filter(f => f.state === 'carried' && f.carrier === role).length;
      if (role === 3) return mk(role, human, pct((on + carried * 0.5) / cap), carried ? 'CARRYING FLAG' : `FLAGS ${on}/${cap}`, on >= cap ? 'done' : 'working', 'capturing science flags');
      return mk(role, human, 100, 'COVER FIRE', 'working', 'protecting the raider');
    }
    if (phase === 'delivery') {
      const d = s.match.teams[0].delivered, total = d + s.match.flags.filter(f => f.state === 'onboard' && f.owner === 0).length;
      return mk(role, human, total ? pct(d / total) : 100, `DELIVERED ${d}/${total}`, d >= total ? 'done' : 'working', 'bringing the flags home');
    }
    return mk(role, human, 100, 'STANDING BY', 'waiting');
  });
}
