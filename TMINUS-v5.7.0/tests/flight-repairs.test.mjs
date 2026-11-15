import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition, setUpgrade, maintainSystem, tickSystems, seededRandom} from '../dist/expedition-core.js';
import {designSheet, faultWeights, pickFault} from '../dist/design-science.js';
import {FAULT_REPAIR, REPAIR_TITLE} from '../dist/repairs-core.js';

const counts = (sheet, n = 4000) => {
  const rand = seededRandom(11), c = {reactor: 0, cooling: 0, scrubber: 0};
  for (let i = 0; i < n; i++) c[pickFault(sheet, rand)]++;
  return c;
};

test('only faults a crew member can name are ever produced, and pickFault uses one random number', () => {
  const sheet = designSheet(createExpedition(1));
  let calls = 0;
  const f = pickFault(sheet, () => { calls++; return 0.5; });
  assert.equal(calls, 1);
  assert.ok(['reactor', 'cooling', 'scrubber'].includes(f));
});

test('a thin power margin makes reactor faults likelier than a healthy one', () => {
  const base = designSheet(createExpedition(1));
  const weak = JSON.parse(JSON.stringify(base));
  weak.power.marginKW = 0.2;
  assert.ok(faultWeights(weak).reactor > faultWeights(base).reactor);
  assert.ok(counts(weak).reactor > counts(base).reactor, 'weaker design, more reactor faults');
});

test('a thin oxygen margin makes scrubber faults likelier', () => {
  const base = designSheet(createExpedition(1));
  const thin = JSON.parse(JSON.stringify(base));
  thin.oxygen.suppliedKg = thin.oxygen.requiredKg;           // no spare at all
  assert.ok(counts(thin).scrubber > counts(base).scrubber);
});

test('a heavier build (turret) shifts the mix toward reactor faults', () => {
  const heavy = createExpedition(1); heavy.credits = 99999;
  setUpgrade(heavy, 'weapons', true); setUpgrade(heavy, 'cargo', true);
  const base = designSheet(createExpedition(1)), h = designSheet(heavy);
  assert.ok(h.power.marginKW < base.power.marginKW);
  assert.ok(counts(h).reactor > counts(base).reactor);
});

test('reactor and scrubber faults have a hand repair; cooling does not yet', () => {
  assert.equal(FAULT_REPAIR.reactor, 'fuse');
  assert.equal(FAULT_REPAIR.scrubber, 'co2');
  assert.equal(FAULT_REPAIR.cooling, undefined);
  for (const kind of Object.values(FAULT_REPAIR)) assert.ok(REPAIR_TITLE[kind]);
});

test('flight raises one of the three faults on the 17 s clock from the design, and hand repair clears it', () => {
  const s = createExpedition(5);
  s.mode = 'play'; s.phase = 'flight';
  for (let i = 0; i < 200 && !s.fault; i++) tickSystems(s, 0.1);
  assert.ok(['reactor', 'cooling', 'scrubber'].includes(s.fault), String(s.fault));
  const fault = s.fault;
  if (fault === 'reactor') { assert.ok(maintainSystem(s, 1, 6, 'reactor')); }
  else if (fault === 'scrubber') { s.co2 = 3000; assert.ok(maintainSystem(s, 1, 6, 'scrubber')); assert.ok(s.co2 < 3000); }
  else { assert.ok(maintainSystem(s, 1, 6, 'coolant')); }
  assert.equal(s.fault, null);
});

test('only the engineer role can repair by hand, and only in flight', () => {
  const s = createExpedition(5);
  s.phase = 'flight'; s.fault = 'reactor';
  assert.equal(maintainSystem(s, 0, 6, 'reactor'), false);
  assert.equal(s.fault, 'reactor');
  s.phase = 'assembly';
  assert.equal(maintainSystem(s, 1, 6, 'reactor'), false);
});
