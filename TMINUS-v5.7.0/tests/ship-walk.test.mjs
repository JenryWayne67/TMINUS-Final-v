import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {isWalkable, canStand, createWalker, stepWalker, roomAt, nearestProp, roomLessons, prettyTask,
  EYE_HEIGHT} from '../dist/ship-walk-core.js';
import {ROOM_ORDER, designSheet} from '../dist/design-science.js';
import {createExpedition} from '../dist/expedition-core.js';

const json = async f => JSON.parse(await readFile(new URL('../dist/assets/ship/' + f, import.meta.url), 'utf8'));
const nav = await json('ship_nav.json'), scene = await json('ship_interior.scene.json');

test('the walker spawns on free floor inside the engine bay', () => {
  const w = createWalker(nav, scene);
  assert.ok(canStand(nav, w.x, w.z));
  assert.equal(roomAt(nav, w.x, w.z), 'engine_bay');
  assert.ok(EYE_HEIGHT > 1.4 && EYE_HEIGHT < 2);
});

test('walls block movement: walking sideways from the centre stops at the wall', () => {
  const w = createWalker(nav, scene);
  for (let i = 0; i < 400; i++) stepWalker(w, nav, 0.05, {strafe: 1});
  assert.ok(Math.abs(w.x) < 2.6, `x ${w.x}`);
  assert.ok(canStand(nav, w.x, w.z));
});

test('D strafes to the right-hand side and A to the left when facing the nose', () => {
  const r = {x: 0, z: 1.2, yaw: 0, pitch: 0}, l = {...r};
  stepWalker(r, nav, 0.1, {strafe: 1});
  stepWalker(l, nav, 0.1, {strafe: -1});
  assert.ok(r.x < 0 && l.x > 0, 'facing +Z, right is -X');
  const turned = {x: 0, z: 1.2, yaw: Math.PI / 2, pitch: 0};   // facing +X: forward moves +X
  stepWalker(turned, nav, 0.1, {forward: 1});
  assert.ok(turned.x > 0);
});

test('the doorway lets you walk rear to nose through all six modules, and nowhere else is a shortcut', () => {
  const w = createWalker(nav, scene);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { stepWalker(w, nav, 0.02, {forward: 1, run: true}); seen.add(roomAt(nav, w.x, w.z)); }
  for (const r of ROOM_ORDER) assert.ok(seen.has(r), `reached ${r}`);
  assert.ok(w.z > 30, `z ${w.z}`);
});

test('you cannot walk through a bulkhead away from the doorway', () => {
  const w = {x: 1.8, z: 5.75, yaw: 0, pitch: 0};   // engine bay, far from the x=0 doorway
  assert.ok(canStand(nav, w.x, w.z));
  for (let i = 0; i < 200; i++) stepWalker(w, nav, 0.05, {forward: 1});
  assert.ok(w.z < 6.0, `bulkhead crossed at z ${w.z}`);
});

test('the side door leads from the workshop into the airlock', () => {
  const w = {x: -1.0, z: 19.7, yaw: -Math.PI / 2, pitch: 0};   // facing -X, aligned with the free half of the door
  assert.ok(canStand(nav, w.x, w.z));
  for (let i = 0; i < 300; i++) stepWalker(w, nav, 0.03, {forward: 1});
  assert.equal(roomAt(nav, w.x, w.z), 'airlock');
});

test('movement is frame-rate independent for normal frames and capped for huge ones', () => {
  const a = {x: 0, z: 1.2, yaw: 0, pitch: 0}, b = {...a};
  for (let i = 0; i < 10; i++) stepWalker(a, nav, 0.05, {forward: 1});
  for (let i = 0; i < 5; i++) stepWalker(b, nav, 0.1, {forward: 1});
  assert.ok(Math.abs(a.z - b.z) < 1e-9);
  const c = {x: 0, z: 1.2, yaw: 0, pitch: 0};
  stepWalker(c, nav, 5, {forward: 1});
  assert.ok(c.z - 1.2 < 0.5, 'a lag spike must not teleport the player');
});

test('every repair prop in the scene file exists as a shipped model', async () => {
  assert.equal(scene.props.length, 21);
  for (const p of scene.props) {
    const file = p.asset.split('/').pop();
    await access(new URL('../dist/assets/props/' + file, import.meta.url));
    assert.ok(ROOM_ORDER.includes(p.module) || p.module === 'airlock', p.module);
  }
});

test('nearestProp finds a station by the engine-bay fuel panel and labels it in plain words', () => {
  const near = nearestProp(scene, -2.0, 1.6);
  assert.equal(near.task, 'clear_fuel_line');
  assert.equal(near.label, 'Clear the fuel line');
  assert.equal(nearestProp(scene, 0, 3.0, 0.2), null);
  assert.equal(prettyTask('swap_co2_filter'), 'Swap the CO₂ filter');
  assert.equal(prettyTask('stage_switch'), 'Stage switch');       // unnamed tasks fall back to readable text
});

test('each room with a design check shows that check from the live sheet', () => {
  const sheet = designSheet(createExpedition(1));
  assert.equal(roomLessons(sheet, 'engine_bay').length, 2);
  assert.equal(roomLessons(sheet, 'power_room').length, 2);
  assert.equal(roomLessons(sheet, 'life_support').length, 1);
  assert.equal(roomLessons(sheet, 'lab').length, 1);
  assert.equal(roomLessons(sheet, 'cockpit').length, 0);
});

test('isWalkable is false outside the ship', () => {
  assert.equal(isWalkable(nav, 20, 20), false);
  assert.equal(isWalkable(nav, 0, -5), false);
});
