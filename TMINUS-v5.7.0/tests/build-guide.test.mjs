import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOLT_REACH, boltPosition, boltDistance, REACH, footprint, footprintDistance, buildStep, guideText, placeRefusal, degrees} from '../dist/build-guide.js';
import {createExpedition, pickPart, placePart, rotateCarried} from '../dist/expedition-core.js';

const keel = () => createExpedition(1).parts.find(p => p.id === 'keel');
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('a ship-scale part has a large footprint; the keel is about 21 m long', () => {
  const f = footprint(keel());
  assert.ok(f.hz * 2 > 18 && f.hz * 2 < 24, `keel length ${f.hz * 2}`);
  assert.ok(f.hx > 3);
});

test('distance is measured to the outline edge: zero on it, along an axis outside it, diagonal at a corner', () => {
  const p = keel(); p.position = [60, p.position[1], 60]; const f = footprint(p);
  assert.equal(footprintDistance(p, f.cx, f.cz), 0);
  assert.equal(footprintDistance(p, f.cx + f.hx - 0.1, f.cz), 0);
  near(footprintDistance(p, f.cx + f.hx + 2, f.cz), 2);
  near(footprintDistance(p, f.cx, f.cz - f.hz - 5), 5);
  near(footprintDistance(p, f.cx + f.hx + 3, f.cz + f.hz + 4), 5);
});

test('a quarter turn swaps width and depth', () => {
  const p = {...keel(), angle: 1};
  const a = footprint(keel()), b = footprint(p);
  near(b.hx, a.hz); near(b.hz, a.hx);
});

test('the old complaint: 9 m from the keel centre but 0.4 m from its edge is now close enough to place it', () => {
  const s = createExpedition(1); s.mode = 'play';
  const p = s.parts.find(q => q.id === 'keel'), f = footprint(p);
  assert.ok(pickPart(s, 'keel', p.owner));
  while (s.rotation[p.owner] !== p.angle) rotateCarried(s, p.owner);
  const x = f.cx + f.hx + 0.4, z = f.cz + 8;
  assert.ok(Math.hypot(x - f.cx, z - f.cz) > 8, 'far from the centre');
  assert.equal(buildStep(s, p.owner, x, z).id, 'place');
  assert.ok(placePart(s, p.owner, footprintDistance(p, x, z)), 'placement accepted by distance to the outline');
});

test('steps walk through pick up, rotate, walk, place, fasten, done', () => {
  const s = createExpedition(1); s.mode = 'play';
  const role = 3, mine = s.parts.filter(p => p.owner === role);
  let st = buildStep(s, role, 0, 40);
  assert.equal(st.id, 'pickup'); assert.equal(st.n, 1);
  assert.ok(pickPart(s, mine[0].id, role));
  const p = mine[0];
  if (p.angle !== 0) { st = buildStep(s, role, 500, 500); assert.equal(st.id, 'rotate'); assert.equal(st.n, 2); assert.equal(st.need, degrees(p.angle)); }
  while (s.rotation[role] !== p.angle) rotateCarried(s, role);
  st = buildStep(s, role, 500, 500); assert.equal(st.id, 'walk'); assert.equal(st.n, 3); assert.ok(st.distance > REACH);
  const f = footprint(p);
  st = buildStep(s, role, f.cx, f.cz); assert.equal(st.id, 'place'); assert.equal(st.n, 4);
  assert.ok(placePart(s, role, 0));
  st = buildStep(s, role, f.cx, f.cz); assert.equal(st.id, 'fasten'); assert.equal(st.n, 5); assert.equal(st.done, 0);
  p.bolts[0] = 1; assert.equal(buildStep(s, role, f.cx, f.cz).done, 1);
  for (const q of mine) { q.stage = 'secured'; q.bolts = [1, 1, 1]; }
  assert.equal(buildStep(s, role, 0, 0).id, 'done');
});

test('an unaffordable part is called out', () => {
  const s = createExpedition(1); s.credits = 10;
  const st = buildStep(s, 3, 0, 40);
  assert.equal(st.affordable, false);
  assert.match(guideText(st).lines.join(' '), /Not enough credits/);
});

test('every step names the mouse or key to use, in plain words', () => {
  const s = createExpedition(1);
  const p = s.parts.find(q => q.owner === 3);
  const steps = [{id: 'pickup', n: 1, part: p, price: 100, affordable: true}, {id: 'rotate', n: 2, part: p, have: 0, need: 90},
    {id: 'walk', n: 3, part: p, distance: 23.4}, {id: 'place', n: 4, part: p}, {id: 'fasten', n: 5, part: p, done: 1, of: 3}];
  const text = steps.map(guideText);
  assert.match(text[0].mouse.join(), /LEFT CLICK/); assert.match(text[0].mouse.join(), /E/);
  assert.match(text[1].mouse.join(), /SCROLL WHEEL/); assert.match(text[1].lines.join(), /0° and needs 90°/);
  assert.match(text[2].lines.join(), /23 m to go/);
  assert.match(text[3].mouse.join(), /LEFT CLICK/);
  assert.match(text[4].mouse.join(), /HOLD LEFT MOUSE/); assert.match(text[4].lines.join(), /1 of 3/);
  text.forEach((t, i) => assert.equal(t.n, i + 1));
});

test('refusal messages say how far to go or which way to turn, never just "move closer"', () => {
  const p = keel();
  assert.match(placeRefusal(p, 23.4, 0, 0), /23 m to go/);
  assert.match(placeRefusal(p, 1, 0, 1), /Turn it to 90°/);
  assert.doesNotMatch(placeRefusal(p, 23.4, 0, 0), /closer to the wireframe/);
});

test('bolts sit on the physical hull at reachable height and the guide measures real distance to the next one', () => {
  const p = createExpedition(1).parts.find(q => q.id === 'antenna');
  for (let i = 0; i < 3; i++) { const [, y] = boltPosition(p, i); assert.ok(y >= 2.358 && y <= 3.618, `bolt ${i} height ${y}`); }
  const [bx, , bz] = boltPosition(p, 0);
  near(boltDistance(p, 0, bx, bz), boltPosition(p, 0)[1], 1e-9);
  assert.ok(boltDistance(p, 0, bx + 10, bz) > BOLT_REACH);
});

test('step 5 tells you to walk to a far bolt first, then to hold the mouse once you are within reach', () => {
  const s = createExpedition(1); s.mode = 'play';
  const p = s.parts.find(q => q.owner === 3); p.stage = 'positioned';
  const [bx, , bz] = boltPosition(p, 0);
  const far = buildStep(s, 3, bx + 12, bz), nearSt = buildStep(s, 3, bx + 0.5, bz);
  assert.equal(far.id, 'fasten'); assert.equal(far.far, true); assert.equal(nearSt.far, false);
  const tf = guideText(far), tn = guideText(nearSt);
  assert.match(tf.title, /WALK UP/); assert.match(tf.lines.join(), /within 3.5 m/); assert.match(tf.mouse.join(), /W A S D/);
  assert.match(tn.title, /FASTEN/); assert.match(tn.mouse.join(), /HOLD LEFT MOUSE/);
});

test('a site inside the solid hull is reached over the wall from outside', () => {
  const p = keel(); // keel sits inside the hull; standing at the wall counts as in reach
  assert.ok(footprintDistance(p, 0, -15.6) <= REACH);
});
