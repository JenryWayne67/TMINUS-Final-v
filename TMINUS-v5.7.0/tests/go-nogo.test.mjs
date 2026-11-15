import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition, setUpgrade, routeBudget, launchFlight, ROUTES, SPECIALISTS} from '../dist/expedition-core.js';
import {designSheet, slowClimbKg, TWR_GO} from '../dist/design-science.js';
import {goNoGo, POLL_CHECKS, worst, CALL} from '../dist/go-nogo.js';

const route = s => { s.mode = 'play'; s.phase = 'route'; return s; };
const heavy = () => { const s = createExpedition(1); s.credits = 99999; setUpgrade(s, 'weapons', true); setUpgrade(s, 'cargo', true); return s; };

test('each of the six design checks is answered by exactly one crew member', () => {
  const all = POLL_CHECKS.flat().sort();
  assert.deepEqual(all, designSheet(createExpedition(1)).checks.map(c => c.id).sort());
  assert.equal(POLL_CHECKS.length, 4);
});

test('the poll has four named crew, each with a verdict and the numbers behind it', () => {
  const p = goNoGo(createExpedition(1), 'sheltered');
  assert.deepEqual(p.roles.map(r => r.name), SPECIALISTS.map(r => r.name));
  for (const r of p.roles) { assert.ok(['go', 'caution', 'nogo'].includes(r.status)); assert.ok(r.items.length >= 1); assert.equal(r.call, CALL[r.status]); }
  assert.ok(p.roles[0].items.some(i => i.id === 'route-dv') && p.roles[0].items.some(i => i.id === 'route-fuel'));
});

test('the default ship on the sheltered route is all GO and may launch', () => {
  const p = goNoGo(createExpedition(1), 'sheltered');
  assert.equal(p.status, 'go');
  assert.equal(p.canLaunch, true);
  assert.equal(p.cautions.length, 0);
});

test('slow climb: no cost at or above the GO thrust-to-weight, a growing cost below it', () => {
  assert.equal(slowClimbKg(TWR_GO), 0);
  assert.equal(slowClimbKg(2), 0);
  assert.ok(slowClimbKg(1.1) > slowClimbKg(1.2));
  assert.ok(slowClimbKg(1.0) > 0);
});

test('a heavy build is a CAUTION that names the extra fuel, but can still launch', () => {
  const s = heavy();
  const p = goNoGo(s, 'sheltered');
  const pilot = p.roles[0];
  assert.equal(pilot.status, 'caution');
  const climb = pilot.items.find(i => i.id === 'slow-climb');
  assert.ok(climb && climb.value > 0);
  assert.equal(p.status, 'caution');
  assert.equal(p.canLaunch, true);
  assert.ok(p.cautions.length >= 1);
});

test('the slow-climb loss is added to the route cost and really burned at launch', () => {
  const base = createExpedition(1), h = heavy();
  const b0 = routeBudget(base, 'sheltered'), b1 = routeBudget(h, 'sheltered');
  assert.equal(b0.slowClimb, 0);
  assert.ok(b1.slowClimb > 0);
  near(b1.required, b1.outbound + b1.returnReserve + b1.contingency + b1.slowClimb);
  const before = h.propellant;
  assert.ok(launchFlight(route(h), 'sheltered'));
  near(before - h.propellant, b1.outbound + b1.slowClimb);
});

test('too little propellant is a NO-GO: the pilot reports it and launch is refused', () => {
  const s = route(createExpedition(1));
  s.propellant = 20;
  const p = goNoGo(s, 'sheltered');
  assert.equal(p.roles[0].status, 'nogo');
  assert.equal(p.status, 'nogo');
  assert.equal(p.canLaunch, false);
  assert.equal(launchFlight(s, 'sheltered'), false);
});

test('worst() ranks NO-GO over CAUTION over GO', () => {
  assert.equal(worst(['go', 'go']), 'go');
  assert.equal(worst(['go', 'caution']), 'caution');
  assert.equal(worst(['caution', 'nogo', 'go']), 'nogo');
});

test('every route can be polled and its verdict agrees with whether it is affordable', () => {
  for (const r of ROUTES) {
    const s = createExpedition(1), p = goNoGo(s, r.id);
    assert.equal(p.route.id, r.id);
    if (!p.route.valid) assert.equal(p.canLaunch, false, r.id);
  }
});

function near(a, b, e = 1e-9) { assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`); }
