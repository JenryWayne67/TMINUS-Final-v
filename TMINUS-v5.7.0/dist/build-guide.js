// Build-phase guidance. Pure logic (no DOM, no THREE) so the rules and the wording are unit tested.
// A part is "in reach" when the player stands within REACH metres of its outline on the ground, not of its centre,
// because parts at ship scale can be 20 m long.

import {SHIP_SCALE} from './ship-scale.js';
import {reachDistance} from './hull-collision.js';

export const REACH = 3;                 // metres from the outline edge
export const STEP_COUNT = 5;
export const BOLT_REACH = 3.5;          // metres, straight-line from the player's feet to the bolt (matches fastenBolt)
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Where bolt i of a part sits in the world. Mirrors the placement in crew-world: offsets scale with the ship, and the
// height is clamped so the bolts are always within a crew member's reach.
// Service fasteners are on accessible exterior panels, rather than hidden in the
// centre of an installed solid part. Human aiming and bot work use these same points.
const SERVICE={keel:[-2.64,-2.5],port:[-2.64,-1.4],bridge:[2.64,-2.5],reactor:[-2.64,-.3],battery:[2.64,3],coolant:[-2.64,3],cargo:[2.64,-.3],scrubber:[-2.64,.8],stores:[2.64,.8],engine:[2.64,-1.4],thruster:[2.64,1.9],antenna:[-2.64,1.9]};
export function boltPosition(part,i) {
 const [x,z]=SERVICE[part.id]||[part.position[0],part.position[2]];
 return [x,[2.55,2.85,2.55][i],z+[-.22,0,.22][i]];
}
export function boltDistance(part, i, x, z) {
  const [bx, by, bz] = boltPosition(part, i);
  return reachDistance(x, z, bx, by, bz);
}

// Ground footprint of a part: centre and half-extents. A quarter-turn (odd angle) swaps width and depth.
export function footprint(part) {
  const [w, , d] = part.size, odd = part.angle % 2 !== 0;
  return {cx: part.position[0], cz: part.position[2], hx: (odd ? d : w) / 2, hz: (odd ? w : d) / 2};
}

// Distance on the ground from (x, z) to the edge of the footprint. 0 when standing on it.
export function footprintDistance(part, x, z) {
  const f = footprint(part);
  const dx = Math.max(0, Math.abs(x - f.cx) - f.hx), dz = Math.max(0, Math.abs(z - f.cz) - f.hz);
  return Math.hypot(dx, dz);
}

export const degrees = turns => turns * 90;

// What the player should do next. s = expedition state (parts, carry, rotation, credits), role index, ground position.
export function buildStep(s, role, x, z) {
  const carriedId = s.carry[role];
  if (carriedId && !carriedId.startsWith('cargo:')) {
    const p = s.parts.find(q => q.id === carriedId);
    const have = s.rotation[role], need = p.angle, dist = footprintDistance(p, x, z);
    if (have !== need) return {id: 'rotate', n: 2, part: p, have: degrees(have), need: degrees(need), distance: dist};
    if (dist > REACH) return {id: 'walk', n: 3, part: p, distance: dist};
    return {id: 'place', n: 4, part: p, distance: dist};
  }
  const mine = s.parts.filter(p => p.owner === role);
  const bolting = mine.find(p => p.stage === 'positioned');
  if (bolting) {
    const done = bolting.bolts.filter(b => b >= 1).length, bolt = bolting.bolts.findIndex(b => b < 1);
    const distance = boltDistance(bolting, Math.max(0, bolt), x, z);
    return {id: 'fasten', n: 5, part: bolting, done, of: 3, bolt, distance, far: distance > BOLT_REACH - 0.4};
  }
  const next = mine.find(p => p.stage === 'shelf');
  if (next) return {id: 'pickup', n: 1, part: next, price: next.purchased ? 0 : next.price, affordable: next.purchased || s.credits >= next.price};
  return {id: 'done', n: 0};
}

const m = n => `${Math.max(0, Math.round(n))} m`;
// Plain-language title and lines for a step. `mouse` lists exactly which button or key does what.
export function guideText(step) {
  switch (step.id) {
    case 'pickup': return {n: step.n, title: 'PICK UP',
      lines: [`Walk to the glowing ${step.part.name} on your rack, look straight at it, then press E or click the left mouse button.`,
        step.affordable ? (step.price ? `It costs ${step.price} credits.` : 'Already paid for.') : `Not enough credits for the ${step.part.name} (${step.price}).`],
      mouse: ['LEFT CLICK or E: pick up']};
    case 'rotate': return {n: step.n, title: 'ROTATE IT TO MATCH',
      lines: [`The ${step.part.name} must face the outline: it is at ${step.have}° and needs ${step.need}°.`],
      mouse: ['SCROLL WHEEL or R: turn 90°']};
    case 'walk': return {n: step.n, title: 'CARRY IT TO THE OUTLINE',
      lines: [`Follow the beam to the ${step.part.name} outline on the ship. ${m(step.distance)} to go; stand beside the outline.`],
      mouse: ['Move with W A S D', 'Hold SHIFT to run']};
    case 'place': return {n: step.n, title: 'PLACE IT',
      lines: [`You are at the outline. Set the ${step.part.name} in place.`],
      mouse: ['LEFT CLICK or E: place']};
    case 'fasten': return step.far
      ? {n: step.n, title: 'WALK UP TO THE GLOWING BOLT',
        lines: [`The next bolt on the ${step.part.name} is ${m(step.distance)} away; you must be within ${BOLT_REACH} m. ${step.done} of ${step.of} done.`],
        mouse: ['Move with W A S D', 'B: face the bolt']}
      : {n: step.n, title: 'FASTEN THE BOLTS',
        lines: [`Put the crosshair on the glowing bolt and HOLD the left mouse button until it turns green. ${step.done} of ${step.of} done.`],
        mouse: ['HOLD LEFT MOUSE: fasten', 'B: look at the next bolt']};
    default: return {n: 0, title: 'YOUR PARTS ARE IN', lines: ['Your teammates are finishing theirs.'], mouse: []};
  }
}

// The message when a placement is refused. Says what to do, and how far.
export function placeRefusal(part, distance, have, need) {
  if (distance > REACH) return `Walk to the glowing outline: ${m(distance)} to go.`;
  if (have !== need) return `Turn it to ${degrees(need)}° (now ${degrees(have)}°): scroll the wheel or press R.`;
  return 'Cannot place it here.';
}
