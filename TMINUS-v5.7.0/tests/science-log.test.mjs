import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition, setUpgrade, routeBudget, launchFlight, tickSystems} from '../dist/expedition-core.js';
import {buildScienceLog, HISTORY} from '../dist/science-log.js';

const flown = (s, id = 'sheltered') => { s.mode = 'play'; s.phase = 'route'; assert.ok(launchFlight(s, id)); return s; };
const heavy = () => { const s = createExpedition(1); s.credits = 99999; setUpgrade(s, 'weapons', true); setUpgrade(s, 'cargo', true); return s; };
const get = (log, id) => log.entries.find(e => e.id === id);

test('every entry traces an outcome (effect) to a build choice (cause), in plain words', () => {
  const log = buildScienceLog(flown(createExpedition(1)));
  assert.ok(log.entries.length >= 3);
  for (const e of log.entries) { assert.ok(e.title && e.value && e.cause.length > 20 && e.effect.length > 15, e.id); }
});

test('standard build: no options named, no slow-climb loss, design GO', () => {
  const log = buildScienceLog(flown(createExpedition(1)));
  assert.match(get(log, 'design').cause, /standard 12-part ship/);
  assert.match(get(log, 'design').effect, /GO/);
  assert.match(get(log, 'fuel').effect, /no fuel was lost/);
});

test('a heavy build names its options and charges the slow climb as fuel', () => {
  const s = flown(heavy());
  const log = buildScienceLog(s);
  assert.match(get(log, 'design').cause, /Heavy dorsal turret/);
  assert.match(get(log, 'design').cause, /Expanded sample racks/);
  assert.match(get(log, 'design').effect, /CAUTION/);
  const fuel = get(log, 'fuel');
  assert.match(fuel.effect, /under 1\.25/);
  assert.match(fuel.value, new RegExp((s.route.outbound + s.route.slowClimb).toFixed(1)));
  assert.ok(log.history.includes(HISTORY.twr), 'Saturn V card appears when the climb cost fuel');
});

test('faults are counted by type and linked to the margins that set the odds', () => {
  const s = flown(createExpedition(5));
  for (let i = 0; i < 700; i++) tickSystems(s, 0.1);
  const n = s.log.filter(e => ['reactor', 'cooling', 'scrubber'].includes(e.event)).length;
  assert.ok(n >= 2, `faults ${n}`);
  const log = buildScienceLog(s);
  const f = get(log, 'faults');
  assert.match(f.value, new RegExp(`${n} fault`));
  assert.match(f.cause, /power margin of 3\.6 kW/);
});

test('a flight with no faults says so and shows no repairs entry', () => {
  const log = buildScienceLog(flown(createExpedition(1)));
  assert.equal(get(log, 'faults').value, 'none');
  assert.equal(get(log, 'repairs'), undefined);
  assert.deepEqual(log.history, [HISTORY.rocket], 'falls back to the rocket-equation card');
});

test('hand repairs are counted with their time and attempts, and pull in the matching history card', () => {
  const s = flown(createExpedition(5));
  for (let i = 0; i < 400; i++) tickSystems(s, 0.1);
  s.repairLog = [{fault: 'reactor', kind: 'fuse', seconds: 12, attempts: 2}, {fault: 'scrubber', kind: 'co2', seconds: 8, attempts: 3}];
  s.log.push({time: 1, event: 'reactor'}, {time: 2, event: 'scrubber'});
  const log = buildScienceLog(s);
  const r = get(log, 'repairs');
  assert.match(r.value, /^2 of \d+ faults$/);
  assert.match(r.cause, /about 10 s each/);
  assert.match(r.cause, /5 attempts/);
  assert.ok(log.history.includes(HISTORY.co2) || log.history.includes(HISTORY.fuse));
  assert.ok(log.history.length <= 2);
});

test('flight tracks the peak CO2, peak temperature and lowest power for the debrief', () => {
  const s = flown(createExpedition(5));
  for (let i = 0; i < 300; i++) tickSystems(s, 0.1);
  assert.ok(s.peak, 'peak record exists');
  assert.ok(s.peak.co2 >= 480 && s.peak.temperature >= 41, 'peaks never fall below the starting values');
  assert.ok(Number.isFinite(s.peak.minPower) && s.peak.minPower > 0 && s.peak.minPower <= s.powerCapacity);
  const air = get(buildScienceLog(s), 'air');
  assert.match(air.value, /CO₂ peaked at \d+ ppm/);
});

test('history cards are text only, name a real event and link back to the player\'s build', () => {
  for (const h of Object.values(HISTORY)) {
    assert.ok(h.title && h.year && h.text.length > 60 && h.link.length > 20);
    assert.doesNotMatch(h.text + h.link, /<img|http/);
  }
});

test('a state that never launched still produces a log without crashing', () => {
  const log = buildScienceLog(createExpedition(1));
  assert.equal(get(log, 'fuel'), undefined);
  assert.ok(get(log, 'design'));
  assert.ok(log.history.length >= 1);
});
