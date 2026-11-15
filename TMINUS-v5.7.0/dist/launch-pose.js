// Pure launch-pad pose: the shuttle tips from lying down to standing nose-up, then climbs.
export const RAISE_TIME = 2.5, CLIMB_TIME = 4;
export const TOTAL_TIME = RAISE_TIME + CLIMB_TIME;
const clamp01 = v => Math.max(0, Math.min(1, v));
// Smooth 0..1 progress of the raise; the nose (-z) rotates up about the x axis.
export const raiseProgress = clock => { const t = clamp01(clock / RAISE_TIME); return t * t * (3 - 2 * t); };
export const pitchFor = clock => raiseProgress(clock) * Math.PI / 2;
// Seconds spent climbing after the raise finished (0 while still tipping up).
export const climbClock = clock => Math.max(0, clock - RAISE_TIME);
export const launchDone = clock => clock >= TOTAL_TIME;
// Vertical lift that keeps the lowest hull point on the ground while pitching.
// halfLength: tail distance from the pivot along +z; pitch in radians.
export const groundLift = (halfLength, pitch) => Math.max(0, halfLength * Math.sin(pitch));
