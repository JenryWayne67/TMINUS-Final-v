import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crewStatus, partProgress} from '../dist/crew-status.js';
import {createExpedition, pickPart, placePart, rotateCarried, fastenBolt} from '../dist/expedition-core.js';

const fresh = () => { const s = createExpedition(1); s.mode = 'play'; return s; };

test('four crew, each with a name, a role and a job line; exactly one is the human', () => {
  const st = crewStatus(fresh());
  assert.deepEqual(st.map(c => c.name), ['FINN', 'CHIP', 'BARBARA', 'FERNANDO']);
  assert.equal(st.filter(c => c.human).length, 1);
  assert.equal(st.find(c => c.human).role, 3);
  for (const c of st) { assert.ok(c.label.length > 2 && c.detail.length > 3 && c.title); assert.ok(c.percent >= 0 && c.percent <= 100); }
});

test('build progress: a part counts for something at every stage, and bolts add up', () => {
  const p = {stage: 'shelf', bolts: [0, 0, 0]};
  assert.equal(partProgress(p), 0);
  p.stage = 'carried'; const carried = partProgress(p);
  p.stage = 'positioned'; const placed = partProgress(p);
  p.bolts = [1, 0, 0]; const oneBolt = partProgress(p);
  p.bolts = [1, 1, 1]; const allBolts = partProgress(p);
  p.stage = 'secured';
  assert.ok(0 < carried && carried < placed && placed < oneBolt && oneBolt < allBolts && allBolts < 1 + 1e-9);
  assert.equal(partProgress(p), 1);
});

test('percentages rise as the human builds: waiting, then working with a %, then done', () => {
  const s = fresh(), role = 3, mine = s.parts.filter(p => p.owner === role);
  let c = crewStatus(s)[role];
  assert.equal(c.status, 'waiting'); assert.equal(c.percent, 0);
  assert.ok(pickPart(s, mine[0].id, role));
  c = crewStatus(s)[role];
  assert.equal(c.status, 'working'); assert.ok(c.percent > 0 && c.percent < 34); assert.match(c.label, /BUILDING \d+%/); assert.match(c.detail, /carrying a part/);
  for (const p of mine) { p.stage = 'secured'; p.bolts = [1, 1, 1]; }
  c = crewStatus(s)[role];
  assert.equal(c.status, 'done'); assert.equal(c.percent, 100); assert.equal(c.label, 'BUILD DONE');
});

test('teammates show their own progress independently (e.g. 60%-ish after most parts are in)', () => {
  const s = fresh(), mine = s.parts.filter(p => p.owner === 0);
  mine[0].stage = 'secured'; mine[0].bolts = [1, 1, 1];
  mine[1].stage = 'positioned'; mine[1].bolts = [1, 1, 0];
  const c = crewStatus(s)[0];
  assert.equal(c.status, 'working');
  assert.ok(c.percent >= 50 && c.percent <= 80, `percent ${c.percent}`);
  assert.equal(crewStatus(s)[1].percent, 0, 'another crew member is unaffected');
});

test('outfit: stowing supplies and passing tests moves each role to done', () => {
  const s = fresh(); s.phase = 'outfit';
  assert.equal(crewStatus(s)[0].status, 'waiting');
  s.cargo.forEach(c => { c.stowed = true; }); s.checks.engine = 0.5;
  assert.equal(crewStatus(s)[0].status, 'working');
  s.checks.engine = 1; s.checks.pressure = 1; s.checks.power = 1;
  for (const c of crewStatus(s)) assert.equal(c.status, 'done');
});

test('flight: pilot shows hull, engineer shows a fault as an alert, raider shows cargo', () => {
  const s = fresh(); s.phase = 'flight';
  let st = crewStatus(s);
  assert.match(st[0].label, /HULL 100%/); assert.equal(st[1].status, 'done');
  s.fault = 'scrubber'; s.hull = 30;
  st = crewStatus(s);
  assert.equal(st[1].status, 'alert'); assert.match(st[1].detail, /scrubber/); assert.equal(st[0].status, 'alert');
  assert.match(st[3].label, /CARGO 0\/6/);
});

test('surface and delivery report flags', () => {
  const s = fresh(); s.phase = 'surface';
  assert.match(crewStatus(s)[3].label, /FLAGS 0\/6/);
  s.match.flags[0].state = 'onboard'; s.match.flags[0].owner = 0;
  assert.match(crewStatus(s)[3].label, /FLAGS 1\/6/);
  s.phase = 'delivery';
  assert.match(crewStatus(s)[3].label, /DELIVERED 0\/1/);
});
