// Phase 3 preview — repair minigames. Pure logic (no DOM, no THREE) so every rule is unit tested.
// Each repair is tied to a number from the design sheet, so the player's build decides how hard it is.
import {seededRandom} from './expedition-core.js';

// Which repair opens at which station (task names come from the ship_interior scene file).
export const REPAIR_BY_TASK = {clear_fuel_line: 'fuel', swap_fuse: 'fuse', swap_co2_filter: 'co2'};
// Flight faults a crew member can fix by hand, and the minigame that does it. Cooling has no minigame yet.
export const FAULT_REPAIR = {reactor: 'fuse', power: 'fuse', scrubber: 'co2'};
export const REPAIR_TITLE = {fuel: 'Clear the fuel line', fuse: 'Swap the burnt fuse', co2: 'Swap the CO₂ filter'};

// ---- 1. Fuse: pick the right rating. I = P / V, and a fuse is sized with a safety margin. -----------
export const BUS_VOLTS = 120;
export const FUSE_STEPS = [20, 32, 45, 60, 80, 100, 125];
export const FUSE_MARGIN = 1.25;

export const currentDraw = (loadKW, volts = BUS_VOLTS) => loadKW * 1000 / volts;          // amps
export function fuseRating(loadKW) {
  const need = currentDraw(loadKW) * FUSE_MARGIN;
  return FUSE_STEPS.find(r => r >= need) ?? FUSE_STEPS[FUSE_STEPS.length - 1];
}
export function createFuseJob(loadKW) {
  const amps = currentDraw(loadKW), correct = fuseRating(loadKW), i = FUSE_STEPS.indexOf(correct);
  const options = [FUSE_STEPS[i - 1], correct, FUSE_STEPS[i + 1], FUSE_STEPS[i + 2]].filter(v => v !== undefined);
  return {kind: 'fuse', loadKW, volts: BUS_VOLTS, amps, required: amps * FUSE_MARGIN, correct, options};
}
// 'ok' | 'blows' (too small: trips on normal surges) | 'unsafe' (too big: the wire can overheat before it trips)
export function tryFuse(job, rating) {
  if (rating === job.correct) return 'ok';
  return rating < job.correct ? 'blows' : 'unsafe';
}

// ---- 2. Fuel line: rotate pipe pieces until fuel flows from the tank to the engine. ----------------
const N = 1, E = 2, S = 4, W = 8;
export const DIRS = {N, E, S, W};
const OPPOSITE = {[N]: S, [S]: N, [E]: W, [W]: E};
const ROT = m => ((m << 1) | (m >> 3)) & 15;                // rotate a 4-bit mask a quarter turn clockwise (N→E→S→W)
export const pieceMask = (type, rot) => { let m = type === 'S' ? (E | W) : (N | E); for (let i = 0; i < rot; i++) m = ROT(m); return m; };

export function createFuelLine(seed = 1, rows = 3, cols = 5) {
  const rand = seededRandom(seed);
  const grid = Array.from({length: rows}, () => Array.from({length: cols}, () => ({type: rand() < 0.5 ? 'S' : 'E', rot: Math.floor(rand() * 4), path: false, solution: 0})));
  // A random right/down walk from the tank (west of 0,0) to the engine (east of the last cell).
  let r = 0, c = 0, incoming = W;
  while (true) {
    const last = r === rows - 1 && c === cols - 1;
    let outgoing;
    if (last) outgoing = E;
    else if (r === rows - 1) outgoing = E;
    else if (c === cols - 1) outgoing = S;
    else outgoing = rand() < 0.55 ? E : S;
    const need = incoming | outgoing, cell = grid[r][c];
    cell.path = true;
    cell.type = (need === (E | W) || need === (N | S)) ? 'S' : 'E';
    for (let k = 0; k < 4; k++) if (pieceMask(cell.type, k) === need) { cell.solution = k; break; }
    if (last) break;
    if (outgoing === E) c++; else r++;
    incoming = OPPOSITE[outgoing];
  }
  // Scramble the path so it starts unsolved.
  for (const row of grid) for (const cell of row) cell.rot = cell.path ? (cell.solution + 1 + Math.floor(rand() * 3)) % 4 : cell.rot;
  return {kind: 'fuel', rows, cols, grid, moves: 0};
}
export function rotatePipe(job, r, c) { job.grid[r][c].rot = (job.grid[r][c].rot + 1) % 4; job.moves++; return job; }
// Follow the fuel from the tank. Returns the set of wet cells ("r,c") and whether it reaches the engine.
export function flow(job) {
  const wet = new Set();
  let r = 0, c = 0, from = W;
  while (r >= 0 && r < job.rows && c >= 0 && c < job.cols) {
    const m = pieceMask(job.grid[r][c].type, job.grid[r][c].rot);
    if (!(m & from)) return {wet, solved: false};
    wet.add(`${r},${c}`);
    const out = m & ~from;
    if (r === job.rows - 1 && c === job.cols - 1 && (out & E)) return {wet, solved: true};
    if (out & E) { c++; from = W; } else if (out & S) { r++; from = N; } else if (out & N) { r--; from = S; } else { c--; from = E; }
  }
  return {wet, solved: false};
}
export const fuelSolved = job => flow(job).solved;

// ---- 3. CO2 filter: stop the moving marker inside the green window. -----------------------------
export const TIMING_SPEED = 3.2;                              // radians per second of the sweeping marker
export const scrubberWindow = o2SpareKg => Math.min(0.2, Math.max(0.05, 0.05 + Math.max(0, o2SpareKg) * 0.04));
export const timingPosition = t => 0.5 + 0.5 * Math.sin(t * TIMING_SPEED);
export function createTimingJob(o2SpareKg, seed = 1) {
  const rand = seededRandom(seed);
  return {kind: 'co2', o2SpareKg, width: scrubberWindow(o2SpareKg), target: 0.3 + rand() * 0.4, attempts: 0};
}
export function tryTiming(job, t) {
  job.attempts++;
  const pos = timingPosition(t), error = Math.abs(pos - job.target);
  return {hit: error <= job.width / 2, pos, error};
}

// ---- Jobs from a design sheet, and plain-language explanations for the debrief. ------------------
export function createJob(kind, sheet, seed = 1) {
  if (kind === 'fuse') return createFuseJob(sheet.power.loadKW);
  if (kind === 'fuel') return createFuelLine(seed);
  if (kind === 'co2') return createTimingJob(sheet.oxygen.suppliedKg - sheet.oxygen.requiredKg, seed);
  throw new Error('unknown repair ' + kind);
}

export function explain(job, sheet) {
  if (job.kind === 'fuse') {
    return `Your systems draw ${job.loadKW.toFixed(2)} kW on a ${job.volts} V bus, so I = P ÷ V = ${job.amps.toFixed(0)} A. `
      + `A fuse is sized about ${Math.round((FUSE_MARGIN - 1) * 100)}% above normal current (${job.required.toFixed(0)} A), so the right rating is ${job.correct} A. `
      + `Too small and it blows on every surge; too large and the wire overheats before it trips. Every option you add to the ship raises this current.`;
  }
  if (job.kind === 'fuel') {
    return `A blocked feed line starves the engine, so the ${sheet.deltaV.toFixed(0)} m/s of delta-v you designed only exists while fuel reaches it. `
      + `Fuel mass is ${sheet.mass.propellant.toFixed(0)} kg of the ${sheet.mass.wet.toFixed(0)} kg wet mass.`;
  }
  const spare = job.o2SpareKg;
  return `The scrubber removes CO₂ so the crew can breathe. Your design has ${spare.toFixed(1)} kg of spare oxygen, which sets how forgiving this job is: `
    + `the green window is ${Math.round(job.width * 100)}% wide. A design with less oxygen margin leaves less time to get this right.`;
}
