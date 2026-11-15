import test from 'node:test'; import assert from 'node:assert/strict';
import {hullBoxes, partBoxes, resolve, nearDoor, HULL, DOOR, resolveCircles, PLAYER_R} from '../dist/hull-collision.js';
const near2 = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
test('a point inside the hull is pushed out', () => {
  const r = resolve(0, 0, hullBoxes()); const inBox = hullBoxes().some(b => r.x > b.x0 && r.x < b.x1 && r.z > b.z0 && r.z < b.z1);
  assert.ok(!inBox);
});
test('open ground is untouched', () => { assert.deepEqual(resolve(40, 40, hullBoxes()), {x: 40, z: 40}); });
test('door slot lets a player stand in the doorway', () => {
  const r = resolve(DOOR.x, DOOR.z, hullBoxes()); assert.ok(Math.abs(r.x - DOOR.x) < 1e-9);
});
test('beside the door is blocked', () => {
  const x = 0, z = 0, r = resolve(x, z, hullBoxes());
  assert.ok(r.x !== x || r.z !== z);
  assert.ok(!hullBoxes().some(b => r.x > b.x0 && r.x < b.x1 && r.z > b.z0 && r.z < b.z1));
});
test('only installed belly and landing gear create ground colliders',()=>{assert.equal(partBoxes([{id:'keel',stage:'secured'},{id:'reactor',stage:'secured'},{id:'port',stage:'shelf'}]).length,1);});
test('near door detection', () => { assert.ok(nearDoor(DOOR.x, DOOR.z)); assert.ok(!nearDoor(0, 0)); });
test('rival offset moves boxes', () => { const b = hullBoxes({x: 60, z: -44}); assert.ok(b[0].x0 > 40); });

test('a point inside a rock circle is pushed to its rim', () => {
  const r = resolveCircles(0, 0, [{x: 0, z: 0, r: 2}]);
  near2(Math.hypot(r.x, r.z), 2 + PLAYER_R);
});
test('two overlapping rocks still push the player clear of both', () => {
  const circles = [{x: -1, z: 0, r: 2}, {x: 1, z: 0, r: 2}];
  const r = resolveCircles(0, 0, circles);
  for (const c of circles) assert.ok(Math.hypot(r.x - c.x, r.z - c.z) >= c.r + PLAYER_R - 1e-6);
});
test('a point clear of every rock is untouched', () => {
  assert.deepEqual(resolveCircles(50, 50, [{x: 0, z: 0, r: 2}]), {x: 50, z: 50});
});
