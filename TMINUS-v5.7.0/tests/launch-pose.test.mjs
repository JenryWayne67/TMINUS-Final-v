import test from 'node:test'; import assert from 'node:assert/strict';
import { raiseProgress, pitchFor, climbClock, launchDone, groundLift, RAISE_TIME, TOTAL_TIME } from '../dist/launch-pose.js';
test('starts flat and ends vertical', () => {
  assert.equal(pitchFor(0), 0);
  assert.ok(Math.abs(pitchFor(RAISE_TIME) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(pitchFor(99) - Math.PI / 2) < 1e-9);
});
test('raise is monotonic', () => {
  let prev = -1; for (let t = 0; t <= RAISE_TIME; t += .1) { const p = raiseProgress(t); assert.ok(p >= prev); prev = p; }
});
test('climb only starts after raise', () => {
  assert.equal(climbClock(1), 0); assert.ok(Math.abs(climbClock(RAISE_TIME + 1) - 1) < 1e-9);
});
test('launch finishes at total time', () => { assert.ok(!launchDone(TOTAL_TIME - .1)); assert.ok(launchDone(TOTAL_TIME)); });
test('ground lift grows with pitch and never goes negative', () => {
  assert.equal(groundLift(18, 0), 0); assert.ok(Math.abs(groundLift(18, Math.PI / 2) - 18) < 1e-9); assert.equal(groundLift(18, -1), 0);
});
