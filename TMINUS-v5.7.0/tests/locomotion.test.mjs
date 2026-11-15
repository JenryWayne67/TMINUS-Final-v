import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SPEED, speedFor, stateFor, clipFor, timeScaleFor, CLIPS, carryKind, LIGHT_CARRY} from '../dist/locomotion.js';
import {moveSpeed, isSprinting} from '../dist/fps-core.js';

test('W alone runs, W+Shift sprints, and sprint is clearly faster than run', () => {
  assert.equal(speedFor({}), SPEED.run);
  assert.equal(speedFor({sprint: true}), SPEED.sprint);
  assert.ok(SPEED.sprint > SPEED.run * 1.3, 'a sprint should feel like a sprint');
  assert.ok(SPEED.run > 5, 'running is the normal pace, not a stroll');
});

test('walking is only for heavy loads, whatever else you do', () => {
  assert.equal(speedFor({carrying: 'heavy'}), SPEED.run);
  assert.equal(speedFor({carrying: 'heavy', sprint: true}), SPEED.run);
  assert.equal(speedFor({carrying: 'heavy', crouch: true}), SPEED.crouch);
  assert.equal(speedFor({carrying: 'light'}), SPEED.run * LIGHT_CARRY, 'a flag slows you a little but you still run');
  assert.equal(speedFor({carrying: 'light', sprint: true}), SPEED.run * LIGHT_CARRY, 'no sprinting with a flag');
});

test('sprint needs forward movement and no aiming; crouch and aim slow you', () => {
  assert.equal(speedFor({sprint: true, forward: false}), SPEED.run);
  assert.equal(speedFor({sprint: true, ads: true}), SPEED.run * 0.6);
  assert.equal(speedFor({crouch: true, sprint: true}), SPEED.crouch);
  assert.ok(SPEED.crouch < SPEED.run);
  assert.equal(carryKind(true), 'light'); assert.equal(carryKind(false), 'none'); assert.equal(carryKind('heavy'), 'heavy');
});

test('the firefight uses the same speeds', () => {
  assert.equal(moveSpeed({}), SPEED.run);
  assert.equal(moveSpeed({sprint: true}), SPEED.sprint);
  assert.equal(moveSpeed({heavy: true}), SPEED.run);
  assert.equal(moveSpeed({carrying: true}), SPEED.run * LIGHT_CARRY);
  assert.equal(isSprinting({sprint: true, moving: true, forward: true}), true);
});

test('animation state follows real speed', () => {
  assert.equal(stateFor(0), 'idle');
  assert.equal(stateFor(0, {carrying: 'heavy'}), 'carryIdle');
  assert.equal(stateFor(0, {crouch: true}), 'crouchIdle');
  assert.equal(stateFor(SPEED.walk), 'walk');
  assert.equal(stateFor(SPEED.run), 'run');
  assert.equal(stateFor(SPEED.sprint), 'sprint');
  assert.equal(stateFor(SPEED.walk, {carrying: 'heavy'}), 'carryWalk');
  assert.equal(stateFor(SPEED.crouch, {crouch: true}), 'crouchWalk');
  assert.equal(stateFor(speedFor({ads: true})), 'walk', 'aiming slows you to a walk animation');
  assert.equal(stateFor(speedFor({carrying: 'light'})), 'run');
});

test('every movement the player can make maps to a distinct, sensible animation state', () => {
  const states = {run: stateFor(speedFor({})), sprint: stateFor(speedFor({sprint: true})), carry: stateFor(speedFor({carrying: 'heavy'}), {carrying: 'heavy'}),
    crouch: stateFor(speedFor({crouch: true}), {crouch: true})};
  assert.deepEqual(states, {run: 'run', sprint: 'sprint', carry: 'carryWalk', crouch: 'crouchWalk'});
});

test('animal playback rate follows speed within limits; robot sprint is faster than its run, walk slower', () => {
  assert.equal(timeScaleFor('frog', 'run', SPEED.run), 1);
  assert.ok(timeScaleFor('frog', 'sprint', SPEED.sprint) === 1);
  assert.ok(timeScaleFor('bee', 'run', 3) >= 0.6);
  assert.ok(timeScaleFor('bee', 'run', 100) <= 1.4);
  assert.ok(timeScaleFor('robot', 'sprint', 9) > timeScaleFor('robot', 'run', 6) && timeScaleFor('robot', 'walk', 3) < 1);
});

test('every clip the game asks for exists in the character files', async () => {
  const {readFileSync} = await import('node:fs');
  const glb = f => { const b = readFileSync(new URL('../dist/assets/characters/' + f, import.meta.url)); const l = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + l).toString()).animations.map(a => a.name); };
  for (const f of ['frog.glb', 'bee.glb', 'flamingo.glb']) {
    const have = new Set(glb(f));
    for (const [state, clip] of Object.entries(CLIPS.animal)) assert.ok(have.has(clip), `${f} is missing ${clip} (${state})`);
  }
  const fbx = (await readFile(new URL('../dist/assets/characters/Robot.fbx', import.meta.url))).toString('latin1');
  for (const clip of new Set(Object.values(CLIPS.robot))) assert.ok(fbx.includes('RobotArmature|' + clip), `Robot.fbx is missing ${clip}`);
  assert.equal(clipFor('frog', 'sprint'), 'UAL_Sprint_Loop');
  assert.equal(clipFor('robot', 'sprint'), 'Robot_Running');
});
