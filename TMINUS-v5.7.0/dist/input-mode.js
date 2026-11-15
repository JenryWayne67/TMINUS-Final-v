// Mouse and cursor rules. Pure logic (no DOM) so it can be unit tested.
//
// Tab flips between two modes:
//   look   : the mouse turns the camera and the crosshair is the aim point (default while playing)
//   cursor : the mouse is a normal pointer for menus and panels; the camera stays put
// Each mouse button and the wheel does something different, and what it does depends on the phase.

export const MODE = {LOOK: 'look', CURSOR: 'cursor'};
export const BASE_SENSITIVITY = 0.0024;      // radians of turn per pixel of mouse movement at sensitivity 1
export const WHEEL_STEP = 60;                // wheel units that make one step (a notched wheel sends ~100 per click)
export const PITCH_LIMIT = 1.4;

export function createInput() {
  return {mode: MODE.LOOK, left: false, middle: false, right: false, wheel: 0, lastWheel: -1e9};
}

export function toggleCursor(input) {
  input.mode = input.mode === MODE.LOOK ? MODE.CURSOR : MODE.LOOK;
  if (input.mode === MODE.CURSOR) { input.left = input.middle = input.right = false; input.wheel = 0; }   // nothing stays "held" in the menu
  return input.mode;
}
export const isLook = input => input.mode === MODE.LOOK;

// Mouse movement -> camera turn. Returns {yaw, pitch} deltas, or null in cursor mode.
// Aiming down sights slows the turn in proportion to the zoom so the crosshair stays controllable.
export function lookDelta(input, dx, dy, {sensitivity = 1, ads = false, fovRatio = 1, invertY = false} = {}) {
  if (!isLook(input)) return null;
  const k = BASE_SENSITIVITY * sensitivity * (ads ? Math.max(0.35, fovRatio) : 1);
  return {yaw: dx * k, pitch: (invertY ? dy : -dy) * k};
}
export const clampPitch = p => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

// What the three buttons do in each situation. "work" = building, tests, repairs; "combat" = firefight on the surface.
export const MOUSE_MAP = {
  combat: {left: 'Fire', right: 'Aim down sights (hold)', middle: 'Throw grenade', wheel: 'Switch weapon'},
  flight: {left: 'Fire turret / thrusters', right: 'Precision aim (hold)', middle: 'Role ability', wheel: 'Switch role'},
  work: {left: 'Use tool: fasten, scan, test', right: 'Precision aim (hold)', middle: 'Role ability', wheel: 'Calibrate dial / switch role'}
};
export const contextFor = phase => (phase === 'surface' ? 'combat' : phase === 'flight' ? 'flight' : 'work');

// Button press/release -> action. Returns null when nothing should happen (cursor mode, or a repeat).
// action = {type, active} for held actions (fire, ads, tool, aim) or {type} for one-shot actions (grenade, ability).
export function onButton(input, button, down, phase) {
  if (!isLook(input)) return null;
  const ctx = contextFor(phase);
  const name = button === 0 ? 'left' : button === 1 ? 'middle' : button === 2 ? 'right' : null;
  if (!name) return null;
  if (input[name] === down) return null;
  input[name] = down;
  if (name === 'left') return {type: ctx === 'work' ? 'tool' : 'fire', active: down};
  if (name === 'right') return {type: ctx === 'combat' ? 'ads' : 'aim', active: down};
  return down ? {type: ctx === 'combat' ? 'grenade' : 'ability'} : null;
}

// Wheel -> action, with accumulation so trackpads and free-spinning wheels give one step at a time.
export function onWheel(input, deltaY, phase, now = Date.now()) {
  if (!isLook(input)) return null;                  // in cursor mode the wheel scrolls panels as normal
  input.wheel += deltaY;
  if (Math.abs(input.wheel) < WHEEL_STEP) return null;
  if (now - input.lastWheel < 90) { input.wheel = 0; return null; }
  const dir = input.wheel > 0 ? 1 : -1;
  input.wheel = 0; input.lastWheel = now;
  const ctx = contextFor(phase);
  return ctx === 'combat' ? {type: 'weapon', dir} : {type: ctx === 'work' ? 'calibrate' : 'role', dir: -dir};
}
