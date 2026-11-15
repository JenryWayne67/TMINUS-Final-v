import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldToMap, clampToRim, collectEntities, rangeFor, objectiveLine, ZOOMS, RANGE} from '../dist/minimap.js';
import {createExpedition} from '../dist/expedition-core.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('you are at the centre of the map', () => {
  const p = worldToMap(10, 20, 10, 20, 0.7, 50, 176);
  near(p.x, 88); near(p.y, 88); assert.ok(p.inside);
});

test('heading-up: a point straight ahead is above you, to your right is right, behind is below', () => {
  // facing -Z (yaw 0): ahead is -Z, right is +X
  const ahead = worldToMap(0, -20, 0, 0, 0, 50, 100), right = worldToMap(20, 0, 0, 0, 0, 50, 100), behind = worldToMap(0, 20, 0, 0, 0, 50, 100);
  assert.ok(ahead.y < 50 && Math.abs(ahead.x - 50) < 1e-9);
  assert.ok(right.x > 50 && Math.abs(right.y - 50) < 1e-9);
  assert.ok(behind.y > 50);
  // turn to face +X (yaw = pi/2): the same +X point is now straight ahead
  const turned = worldToMap(20, 0, 0, 0, Math.PI / 2, 50, 100);
  assert.ok(turned.y < 50 && Math.abs(turned.x - 50) < 1e-6);
});

test('scale: a point exactly at the range lands on the rim; beyond it is flagged outside', () => {
  const edge = worldToMap(0, -50, 0, 0, 0, 50, 100);
  near(edge.y, 0); assert.ok(edge.inside);
  assert.equal(worldToMap(0, -80, 0, 0, 0, 50, 100).inside, false);
});

test('off-map markers are pinned to the rim in the same direction', () => {
  const far = worldToMap(0, -200, 0, 0, 0, 50, 100);
  const pinned = clampToRim(far, 100);
  near(Math.hypot(pinned.x - 50, pinned.y - 50), 43);
  assert.ok(pinned.y < 50 && Math.abs(pinned.x - 50) < 1e-6);
  const inside = worldToMap(5, 5, 0, 0, 0, 50, 100);
  assert.deepEqual(clampToRim(inside, 100), inside);
});

test('every phase has a range, and zoom changes it in both directions', () => {
  for (const ph of ['assembly', 'outfit', 'route', 'flight', 'surface', 'delivery']) assert.ok(RANGE[ph] > 20);
  assert.ok(rangeFor('surface', 0) < rangeFor('surface', 1) && rangeFor('surface', 1) < rangeFor('surface', 2));
  assert.equal(ZOOMS.length, 3);
});

const base = phase => ({phase, player: {x: 0, z: 0}, actors: [{x: 1, z: 1}, {x: 2, z: 2}, {x: 3, z: 3}, {x: 0, z: 0}], ship: {x: 0, z: 0, upright: false}, objective: null});
const kinds = (s, ctx) => collectEntities(s, ctx).map(e => e.kind);

test('assembly shows the ship, the four racks, teammates (not yourself) and the part outline you are placing', () => {
  const s = createExpedition(1); s.selected = 3;
  const k = kinds(s, {...base('assembly'), currentPart: {cx: 0, cz: -3, hx: 3, hz: 10}});
  assert.equal(k.filter(x => x === 'rack').length, 4);
  assert.equal(k.filter(x => x === 'mate').length, 3, 'three teammates, not you');
  assert.ok(k.includes('ship') && k.includes('outline'));
});

test('an upright ship is a circle, a flat ship a long rectangle', () => {
  const s = createExpedition(1);
  assert.equal(collectEntities(s, {...base('route'), ship: {x: 0, z: 0, upright: true}}).find(e => e.kind === 'ship').shape, 'circle');
  assert.equal(collectEntities(s, base('route')).find(e => e.kind === 'ship').shape, 'rect');
});

test('outfit shows supplies still to stow and tests still to run; finished ones disappear', () => {
  const s = createExpedition(1);
  const ctx = {...base('outfit'), stow: {x: 0, z: 20}, checks: [{id: 'engine', x: 0, z: 29, color: '#b9a0ff'}, {id: 'power', x: 11, z: 20, color: '#80e6c1'}]};
  let k = kinds(s, ctx);
  assert.equal(k.filter(x => x === 'cargo').length, 4); assert.equal(k.filter(x => x === 'check').length, 2); assert.ok(k.includes('stow'));
  s.cargo[0].stowed = true; s.checks.engine = 1;
  k = kinds(s, ctx);
  assert.equal(k.filter(x => x === 'cargo').length, 3); assert.equal(k.filter(x => x === 'check').length, 1);
});

test('the surface shows science flags (not onboard ones), rival ships and rival crews', () => {
  const s = createExpedition(1);
  const ctx = {...base('surface'), flags: [{x: 1, z: 1, state: 'site'}, {x: 2, z: 2, state: 'onboard'}, {x: 3, z: 3, state: 'carried'}, {x: 4, z: 4, state: 'delivered'}],
    rivals: [{x: -58, z: -30, bx: -50, bz: -25, color: '#6fd', eliminated: false}, {x: 58, z: -30, bx: 50, bz: -25, color: '#a9f', eliminated: true}]};
  const k = kinds(s, ctx);
  assert.equal(k.filter(x => x === 'flag').length, 2, 'site + carried only');
  assert.equal(k.filter(x => x === 'rivalShip').length, 1, 'eliminated rivals are not shown');
  assert.equal(k.filter(x => x === 'enemy').length, 1);
});

test('flight shows hazards and enemies; delivery shows the receiver; the objective is always last', () => {
  const s = createExpedition(1);
  const f = kinds(s, {...base('flight'), hazards: [{x: 1, z: 1}, {x: 2, z: 2}], enemies: [{x: 3, z: 3, color: '#f00'}]});
  assert.equal(f.filter(x => x === 'hazard').length, 2); assert.equal(f.filter(x => x === 'enemy').length, 1);
  assert.ok(kinds(s, {...base('delivery'), receiver: {x: 0, z: 40}}).includes('receiver'));
  const all = collectEntities(s, {...base('assembly'), objective: {x: 5, z: 5, label: 'MOUNT'}});
  assert.equal(all.at(-1).kind, 'objective');
});

test('the legend says where the objective is and how far', () => {
  assert.equal(objectiveLine({objective: null}), 'No objective');
  assert.equal(objectiveLine({player: {x: 0, z: 0}, objective: {x: 3, z: 4, label: 'MOUNT rack'}}), 'MOUNT rack · 5 m');
});
