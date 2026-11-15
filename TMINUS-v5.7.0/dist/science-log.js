// Debrief: trace what happened back to what the player built. Pure logic; no DOM.
import {UPGRADES} from './science-match.js';
import {designSheet, TWR_GO, ECLIPSE_MIN} from './design-science.js';

const f1 = n => (Number.isFinite(n) ? n.toFixed(1) : '—');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const FAULT_NAME = {reactor: 'reactor', cooling: 'cooling', scrubber: 'CO₂ scrubber'};

// Real events, text only (no photos or agency marks). Each names the lesson it connects to.
export const HISTORY = {
  twr: {title: 'Lifting off barely above weight', year: 'Saturn V',
    text: 'The Saturn V rocket left the pad with a thrust-to-weight ratio of only about 1.2. It rose slowly at first, and burned a lot of propellant just fighting gravity.',
    link: 'Your own thrust-to-weight decided how much fuel the climb cost.'},
  rocket: {title: 'The rocket equation', year: '1903',
    text: 'Konstantin Tsiolkovsky showed that the speed a rocket can gain depends on its exhaust speed and on the ratio of full mass to empty mass, which is why every extra kilogram has a price.',
    link: 'Every option you bought changed your wet mass, and so your delta-v.'},
  co2: {title: 'Breathing on borrowed hardware', year: 'Apollo 13, 1970',
    text: 'After an explosion the crew lived in the small lunar module, and carbon dioxide began to build up because its filters were not made for three people over days. Ground teams helped them fit square filters from the command module to a round socket using hoses and tape.',
    link: 'Your oxygen and scrubber margin set how soon CO₂ became a problem.'},
  fuse: {title: 'A rating that did not match', year: 'Apollo 13, 1970',
    text: 'The oxygen tank heaters on Apollo 13 had switches rated for 28 volts, but ground testing used a 65 volt supply. The wrong rating helped start the failure that ended the lunar landing.',
    link: 'A fuse works the same way: current is power divided by voltage, and the rating has to fit it.'}
};

export function buildScienceLog(state) {
  const sheet = designSheet(state);
  const entries = [];
  const picked = state.upgrades || [];
  const names = picked.map(id => UPGRADES.find(u => u.id === id)?.name).filter(Boolean);
  const faults = (state.log || []).filter(e => FAULT_NAME[e.event]);
  const byType = faults.reduce((a, e) => ((a[e.event] = (a[e.event] || 0) + 1), a), {});
  const repairs = state.repairLog || [];

  entries.push({
    id: 'design', title: 'YOUR DESIGN',
    value: `${f1(sheet.mass.wet)} kg · thrust-to-weight ${sheet.twr.toFixed(2)} · Δv ${sheet.deltaV.toFixed(0)} m/s`,
    cause: names.length ? `You added ${names.join(', ')} to the 12 core parts.` : 'You flew the standard 12-part ship with no extra options.',
    effect: sheet.overall === 'go' ? 'Every design check was GO.' : `The design sheet carried a ${sheet.overall === 'nogo' ? 'NO-GO' : 'CAUTION'}.`
  });

  const r = state.route;
  if (r) {
    const slow = r.slowClimb || 0;
    entries.push({
      id: 'fuel', title: 'FUEL USED',
      value: `${f1(r.outbound + slow)} kg on the way out`,
      cause: `${r.name} needs ${r.dv} m/s of delta-v. At ${f1(sheet.mass.wet)} kg wet mass, the rocket equation gives ${f1(r.outbound)} kg of propellant.`,
      effect: slow > 0
        ? `Your thrust-to-weight of ${sheet.twr.toFixed(2)} was under ${TWR_GO}, so the climb burned ${f1(slow)} kg more.`
        : `Your thrust-to-weight of ${sheet.twr.toFixed(2)} was at or above ${TWR_GO}, so no fuel was lost climbing.`
    });
  }

  const n = faults.length;
  entries.push({
    id: 'faults', title: 'FAULTS THAT STRUCK',
    value: n ? plural(n, 'fault') + ' (' + Object.entries(byType).map(([k, v]) => `${v} ${FAULT_NAME[k]}`).join(', ') + ')' : 'none',
    cause: `Your power margin of ${f1(sheet.power.marginKW)} kW and oxygen margin of ${f1(sheet.oxygen.suppliedKg - sheet.oxygen.requiredKg)} kg set which systems were most likely to fail.`,
    effect: n ? 'Thin margins raise the odds of that system failing, so the design chose where the trouble came.' : 'Nothing failed this flight; luck helps, but margins make it likelier.'
  });

  const hand = repairs.length;
  if (n) {
    const secs = hand ? repairs.reduce((a, x) => a + x.seconds, 0) / hand : 0;
    const tries = repairs.reduce((a, x) => a + (x.attempts || 0), 0);
    entries.push({
      id: 'repairs', title: 'REPAIRS BY HAND',
      value: `${hand} of ${n} faults`,
      cause: hand ? `You fixed ${plural(hand, 'fault')} yourself in about ${secs.toFixed(0)} s each, with ${plural(tries, 'attempt')} in all.` : 'No fault was repaired by hand; the engineer or the console handled them.',
      effect: hand ? 'Knowing the ratings and the system made each repair quick.' : 'Pressing K at a reactor or scrubber fault lets you fix it with the same skills you practised in the ship.'
    });
  }

  const pk = state.peak;
  if (pk) {
    entries.push({
      id: 'air', title: 'POWER AND AIR',
      value: `CO₂ peaked at ${Math.round(pk.co2)} ppm · lowest power ${Number.isFinite(pk.minPower) ? f1(pk.minPower) : '—'} kWh · peak ${f1(pk.temperature)} °C`,
      cause: `The battery had ${f1(sheet.battery.capacityKWh - sheet.battery.eclipseNeedKWh)} kWh spare over a ${ECLIPSE_MIN}-minute eclipse, and the crew had ${f1(sheet.oxygen.suppliedKg - sheet.oxygen.requiredKg)} kg spare oxygen.`,
      effect: pk.co2 > 1500 ? 'CO₂ climbed because the scrubber was down for a while; it rises fast when nobody services it.' : 'The air stayed within safe limits.'
    });
  }

  // Up to two real-history cards, chosen from what actually happened.
  const history = [];
  if (r && (r.slowClimb || 0) > 0) history.push(HISTORY.twr);
  if (byType.scrubber) history.push(HISTORY.co2);
  if (byType.reactor || repairs.some(x => x.kind === 'fuse')) history.push(HISTORY.fuse);
  if (!history.length) history.push(HISTORY.rocket);
  return {entries, history: history.slice(0, 2), sheet};
}
