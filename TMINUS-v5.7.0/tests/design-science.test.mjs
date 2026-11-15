import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, createExpedition, setUpgrade, routeBudget} from '../dist/expedition-core.js';
import {UPGRADES} from '../dist/science-match.js';
import {PART_STATS, FIXED_MASS, G0, ISP, thrustToWeight, deltaV, solarPower, eclipseEnergy,
  batteryNeeded, oxygenMass, downlinkTime, designSheet} from '../dist/design-science.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('every one of the twelve parts has design stats and a positive mass', () => {
  assert.equal(PARTS.length, 12);
  for (const p of PARTS) assert.ok(PART_STATS[p.id]?.mass > 0, p.id);
});

test('thrust-to-weight is thrust divided by weight', () => {
  near(thrustToWeight(10000, 1000), 10000 / (1000 * G0));
  assert.ok(thrustToWeight(5000, 1000) < 1, 'under 1 cannot lift off');
  assert.ok(thrustToWeight(20000, 1000) > 1);
});

test('delta-v follows the rocket equation and shrinks as dry mass grows', () => {
  near(deltaV(360, 750, 670), 360 * G0 * Math.log(750 / 670));
  assert.ok(deltaV(360, 830, 750) < deltaV(360, 750, 670), 'same 80 kg of fuel moves more mass');
  assert.equal(deltaV(360, 700, 700), 0);
});

test('solar power scales with area and efficiency, and falls with the cosine of the sun angle', () => {
  near(solarPower(10, 0.3, 0), 1361 * 10 * 0.3);
  near(solarPower(10, 0.3, 60), 1361 * 10 * 0.3 * 0.5, 1e-6);
  assert.equal(solarPower(10, 0.3, 120), 0, 'sun behind the panel');
});

test('eclipse battery: energy drawn grows with load and time, capacity adds the depth-of-discharge reserve', () => {
  near(eclipseEnergy(6, 30), 3);
  near(batteryNeeded(6, 30, 0.8), 3 / 0.8);
  assert.ok(batteryNeeded(7, 35) > batteryNeeded(6, 35));
});

test('oxygen mass is crew × days × rate × margin; downlink time is data ÷ rate', () => {
  near(oxygenMass(4, 3, 0.84, 1.5), 4 * 3 * 0.84 * 1.5);
  near(downlinkTime(1440, 2), 720);
  assert.equal(downlinkTime(100, 0), Infinity);
});

test('design sheet reproduces the original wet mass, propellant and load for every option combination', () => {
  for (let m = 0; m < 8; m++) {
    const s = createExpedition(1);
    s.credits = 99999;
    UPGRADES.forEach((u, i) => { if (m & (1 << i)) assert.ok(setUpgrade(s, u.id, true)); });
    const d = designSheet(s);
    near(d.mass.wet, s.wetMass);
    near(d.mass.propellant, s.propellant);
    near(d.power.loadKW, 5.4 + s.extraLoad);
  }
});

test('default design is GO on every check and matches the 12-part mass budget', () => {
  const s = createExpedition(1);
  const d = designSheet(s);
  assert.equal(d.overall, 'go');
  near(d.mass.wet, 750);
  near(d.mass.dry, 670);
  assert.ok(Math.abs(d.mass.dry - (FIXED_MASS + PARTS.reduce((a, p) => a + PART_STATS[p.id].mass, 0))) < 1e-9);
  assert.ok(d.twr >= 1.25, `twr ${d.twr}`);
  assert.ok(d.deltaV > 215, `dv ${d.deltaV}`);
});

test('you cannot maximize everything: all three options together drop thrust-to-weight into caution', () => {
  const base = createExpedition(1);
  const all = createExpedition(1);
  all.credits = 99999;
  UPGRADES.forEach(u => setUpgrade(all, u.id, true));
  const heavy = createExpedition(1);
  heavy.credits = 99999;
  setUpgrade(heavy, 'weapons', true); setUpgrade(heavy, 'cargo', true);
  const a = designSheet(base), b = designSheet(all), h = designSheet(heavy);
  assert.ok(b.twr < a.twr);
  assert.ok(b.power.marginKW < a.power.marginKW);
  assert.notEqual(b.overall, 'go');
  assert.equal(b.checks.find(c => c.id === 'twr').status, 'caution');
  // Turret + racks add mass with no extra fuel, so delta-v falls; the reserve tank is the only option that raises it.
  assert.ok(h.deltaV < a.deltaV, 'dead weight costs delta-v');
  assert.ok(b.deltaV > h.deltaV, 'reserve fuel buys delta-v back');
});

test('every check carries a plain-language reason for the Science Log', () => {
  const d = designSheet(createExpedition(1));
  for (const c of d.checks) assert.ok(c.why.length > 20, c.id);
});

test('delta-v of the default ship covers the sheltered route and its return reserve', () => {
  const s = createExpedition(1);
  const r = routeBudget(s, 'sheltered');
  assert.ok(r.valid);
  assert.ok(designSheet(s).deltaV >= 215);
});

test('designSheet only reads state: calling it twice changes nothing', () => {
  const s = createExpedition(1);
  const before = JSON.stringify(s);
  designSheet(s); designSheet(s);
  assert.equal(JSON.stringify(s), before);
});

test('sanity: Isp constant matches the route model', () => {
  assert.equal(ISP, 360);
});
