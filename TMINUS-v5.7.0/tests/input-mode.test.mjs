import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInput, toggleCursor, isLook, lookDelta, clampPitch, onButton, onWheel, contextFor, MOUSE_MAP, WHEEL_STEP,
  BASE_SENSITIVITY, PITCH_LIMIT} from '../dist/input-mode.js';

test('starts in look mode; Tab flips to cursor mode and back', () => {
  const i = createInput();
  assert.ok(isLook(i));
  assert.equal(toggleCursor(i), 'cursor');
  assert.ok(!isLook(i));
  assert.equal(toggleCursor(i), 'look');
});

test('look mode turns the camera from mouse movement; cursor mode does not', () => {
  const i = createInput();
  const d = lookDelta(i, 100, 50, {sensitivity: 1});
  assert.ok(d.yaw > 0, 'moving right turns right');
  assert.ok(d.pitch < 0, 'moving the mouse down looks down');
  assert.ok(Math.abs(d.yaw - 100 * BASE_SENSITIVITY) < 1e-12);
  toggleCursor(i);
  assert.equal(lookDelta(i, 100, 50), null);
});

test('sensitivity scales turning, aiming down sights slows it, and invert flips pitch', () => {
  const i = createInput();
  const a = lookDelta(i, 100, 0, {sensitivity: 1}), b = lookDelta(i, 100, 0, {sensitivity: 2});
  assert.ok(Math.abs(b.yaw - 2 * a.yaw) < 1e-12);
  const ads = lookDelta(i, 100, 0, {ads: true, fovRatio: 0.65});
  assert.ok(ads.yaw < a.yaw);
  const tiny = lookDelta(i, 100, 0, {ads: true, fovRatio: 0.01});
  assert.ok(tiny.yaw > 0, 'never below the floor');
  assert.ok(lookDelta(i, 0, 10, {invertY: true}).pitch > 0);
  assert.equal(clampPitch(9), PITCH_LIMIT);
  assert.equal(clampPitch(-9), -PITCH_LIMIT);
});

test('combat: left fires, right aims down sights, middle throws a grenade', () => {
  const i = createInput();
  assert.deepEqual(onButton(i, 0, true, 'surface'), {type: 'fire', active: true});
  assert.deepEqual(onButton(i, 0, false, 'surface'), {type: 'fire', active: false});
  assert.deepEqual(onButton(i, 2, true, 'surface'), {type: 'ads', active: true});
  assert.deepEqual(onButton(i, 2, false, 'surface'), {type: 'ads', active: false});
  assert.deepEqual(onButton(i, 1, true, 'surface'), {type: 'grenade'});
  assert.equal(onButton(i, 1, false, 'surface'), null, 'releasing the wheel button does nothing');
});

test('work phases: left uses the tool, right aims precisely, middle is the role ability', () => {
  for (const phase of ['assembly', 'outfit']) {
    const i = createInput();
    assert.deepEqual(onButton(i, 0, true, phase), {type: 'tool', active: true});
    assert.deepEqual(onButton(i, 2, true, phase), {type: 'aim', active: true});
    assert.deepEqual(onButton(i, 1, true, phase), {type: 'ability'});
  }
  const f = createInput();
  assert.deepEqual(onButton(f, 0, true, 'flight'), {type: 'fire', active: true});
  assert.deepEqual(onButton(f, 2, true, 'flight'), {type: 'aim', active: true});
});

test('the three buttons and the wheel are all different actions in combat', () => {
  const i = createInput();
  const types = [onButton(i, 0, true, 'surface').type, onButton(i, 2, true, 'surface').type, onButton(i, 1, true, 'surface').type,
    onWheel(i, 120, 'surface', 1000).type];
  assert.equal(new Set(types).size, 4, types.join());
});

test('repeated button events are ignored, and nothing registers in cursor mode', () => {
  const i = createInput();
  assert.ok(onButton(i, 0, true, 'surface'));
  assert.equal(onButton(i, 0, true, 'surface'), null);
  toggleCursor(i);
  assert.equal(onButton(i, 0, true, 'surface'), null);
  assert.equal(onButton(i, 2, true, 'surface'), null);
  assert.equal(onWheel(i, 500, 'surface', 5000), null);
});

test('switching to the cursor releases held buttons so nothing keeps firing', () => {
  const i = createInput();
  onButton(i, 0, true, 'surface'); onButton(i, 2, true, 'surface');
  assert.ok(i.left && i.right);
  toggleCursor(i);
  assert.ok(!i.left && !i.right && !i.middle);
});

test('wheel: one step per notch, direction mapped, small trackpad nudges accumulate', () => {
  const i = createInput();
  assert.deepEqual(onWheel(i, 100, 'surface', 1000), {type: 'weapon', dir: 1});
  assert.deepEqual(onWheel(i, -100, 'surface', 2000), {type: 'weapon', dir: -1});
  const t = createInput();
  assert.equal(onWheel(t, 20, 'surface', 1000), null);
  assert.equal(onWheel(t, 20, 'surface', 1100), null);
  assert.ok(onWheel(t, 30, 'surface', 1200), 'accumulated past the step');
  assert.ok(WHEEL_STEP > 0);
});

test('wheel spam inside the cooldown is swallowed so it cannot skip weapons', () => {
  const i = createInput();
  assert.ok(onWheel(i, 100, 'surface', 1000));
  assert.equal(onWheel(i, 100, 'surface', 1030), null);
});

test('wheel in work phases calibrates; in flight it switches role', () => {
  const w = createInput();
  assert.equal(onWheel(w, 100, 'outfit', 1000).type, 'calibrate');
  const f = createInput();
  assert.equal(onWheel(f, 100, 'flight', 1000).type, 'role');
});

test('every phase has a documented mouse map', () => {
  assert.equal(contextFor('surface'), 'combat');
  assert.equal(contextFor('flight'), 'flight');
  assert.equal(contextFor('assembly'), 'work');
  for (const c of Object.values(MOUSE_MAP)) for (const k of ['left', 'right', 'middle', 'wheel']) assert.ok(c[k].length > 3);
});
