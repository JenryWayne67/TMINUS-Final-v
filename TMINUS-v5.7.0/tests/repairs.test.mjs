import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REPAIR_BY_TASK, currentDraw, fuseRating, createFuseJob, tryFuse, FUSE_STEPS, pieceMask, DIRS,
  createFuelLine, rotatePipe, flow, fuelSolved, scrubberWindow, timingPosition, createTimingJob, tryTiming,
  createJob, explain} from '../dist/repairs-core.js';
import {designSheet} from '../dist/design-science.js';
import {createExpedition, setUpgrade} from '../dist/expedition-core.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('every repair maps to a station that exists in the ship scene file', async () => {
  const scene = JSON.parse(await readFile(new URL('../dist/assets/ship/ship_interior.scene.json', import.meta.url), 'utf8'));
  const tasks = new Set(scene.props.map(p => p.task));
  for (const t of Object.keys(REPAIR_BY_TASK)) assert.ok(tasks.has(t), t);
});

test('fuse: current is power over voltage and the rating carries a 25% margin', () => {
  near(currentDraw(5.4), 45);
  assert.equal(fuseRating(5.4), 60);                // 45 A × 1.25 = 56.25 A → next standard step is 60 A
  assert.equal(fuseRating(7.2), 80);                // heavier turret: 60 A × 1.25 = 75 A → 80 A
  assert.ok(fuseRating(7.2) > fuseRating(5.4), 'more load needs a bigger fuse');
});

test('fuse: the tempting 45 A fuse (equal to normal current) blows; a 100 A fuse is unsafe; 60 A is right', () => {
  const job = createFuseJob(5.4);
  assert.deepEqual(job.options, [45, 60, 80, 100]);
  assert.equal(tryFuse(job, 45), 'blows');
  assert.equal(tryFuse(job, 60), 'ok');
  assert.equal(tryFuse(job, 80), 'unsafe');
  assert.equal(tryFuse(job, 100), 'unsafe');
  assert.ok(FUSE_STEPS.includes(job.correct));
});

test('fuse: options never fall off the ends of the rating table', () => {
  for (const kw of [0.5, 1, 5.4, 7.2, 12, 20]) {
    const job = createFuseJob(kw);
    assert.ok(job.options.includes(job.correct), String(kw));
    assert.ok(job.options.every(o => FUSE_STEPS.includes(o)));
  }
});

test('pipe masks rotate clockwise: a straight pipe flips between east-west and north-south', () => {
  assert.equal(pieceMask('S', 0), DIRS.E | DIRS.W);
  assert.equal(pieceMask('S', 1), DIRS.N | DIRS.S);
  assert.equal(pieceMask('S', 2), DIRS.E | DIRS.W);
  assert.equal(pieceMask('E', 0), DIRS.N | DIRS.E);
  assert.equal(pieceMask('E', 1), DIRS.E | DIRS.S);
  assert.equal(pieceMask('E', 4), pieceMask('E', 0));
});

test('fuel line: every seed starts unsolved, and rotating the path cells to their solution always solves it', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const job = createFuelLine(seed);
    assert.equal(fuelSolved(job), false, `seed ${seed} starts solved`);
    for (const row of job.grid) for (const cell of row) if (cell.path) cell.rot = cell.solution;
    assert.equal(fuelSolved(job), true, `seed ${seed} not solvable`);
  }
});

test('fuel line: the player can solve it by clicking, using at most three turns per cell', () => {
  const job = createFuelLine(7);
  for (let r = 0; r < job.rows; r++) for (let c = 0; c < job.cols; c++) {
    const cell = job.grid[r][c];
    if (!cell.path) continue;
    let guard = 0;
    while (cell.rot !== cell.solution) { rotatePipe(job, r, c); assert.ok(++guard <= 3); }
  }
  assert.ok(fuelSolved(job));
  assert.ok(job.moves > 0);
});

test('fuel line: flow wets only the connected cells from the tank', () => {
  const job = createFuelLine(3);
  const before = flow(job).wet.size;
  for (const row of job.grid) for (const cell of row) if (cell.path) cell.rot = cell.solution;
  const after = flow(job);
  assert.ok(after.wet.size >= before);
  assert.ok(after.wet.has('0,0') && after.wet.has(`${job.rows - 1},${job.cols - 1}`));
});

test('CO2 window: more spare oxygen makes a wider (easier) window, within limits', () => {
  assert.ok(scrubberWindow(2.9) > scrubberWindow(0.5));
  near(scrubberWindow(-3), 0.05);
  near(scrubberWindow(100), 0.2);
});

test('CO2 timing: the marker sweeps between 0 and 1 and a stop inside the window hits', () => {
  for (let t = 0; t < 10; t += 0.1) { const p = timingPosition(t); assert.ok(p >= 0 && p <= 1); }
  const job = createTimingJob(2.9, 5);
  // find a time where the marker is exactly on target
  let best = 0, bestErr = 9;
  for (let t = 0; t < 4; t += 0.001) { const e = Math.abs(timingPosition(t) - job.target); if (e < bestErr) { bestErr = e; best = t; } }
  assert.equal(tryTiming(job, best).hit, true);
  assert.equal(job.attempts, 1);
  // Stopping where the marker is as far from the target as it gets must miss, even in the widest window.
  const wide = createTimingJob(100, 5);
  let worst = 0, worstErr = -1;
  for (let t = 0; t < 4; t += 0.001) { const e = Math.abs(timingPosition(t) - wide.target); if (e > worstErr) { worstErr = e; worst = t; } }
  assert.ok(worstErr > wide.width / 2);
  assert.equal(tryTiming(wide, worst).hit, false);
});

test('jobs come from the design sheet: a heavier build makes the fuse job harder and the CO2 job tighter', () => {
  const base = designSheet(createExpedition(1));
  const heavy = createExpedition(1); heavy.credits = 99999; setUpgrade(heavy, 'weapons', true);
  const h = designSheet(heavy);
  assert.ok(createJob('fuse', h).amps > createJob('fuse', base).amps);
  assert.ok(createJob('fuse', h).correct > createJob('fuse', base).correct);
  assert.equal(createJob('co2', base, 2).kind, 'co2');
  assert.throws(() => createJob('nope', base));
});

test('every repair explains itself with numbers from the build', () => {
  const sheet = designSheet(createExpedition(1));
  const fuse = explain(createJob('fuse', sheet), sheet);
  assert.match(fuse, /45 A/); assert.match(fuse, /60 A/);
  assert.match(explain(createJob('fuel', sheet, 1), sheet), /398 m\/s/);
  assert.match(explain(createJob('co2', sheet, 1), sheet), /2\.9 kg/);
});
