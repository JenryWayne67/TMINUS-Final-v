// Pure solid-rocket collision on the ground plane (no THREE, no DOM).
// A box is {x0,x1,z0,z1}. Players are circles of radius r. The finished hull has one side door.
import { SHIP_SCALE } from "./ship-scale.js";
// At walking height, only the belly and landing gear intersect a 2.5 m crew.
// The raised engines and radiator wings are overhead. Bounds derive from the
// spacecraft factory: belly 1.45 x 4 m, feet at +/-1.2 m, all at SHIP_SCALE.
export const HULL = { x0: -2.61, x1: 2.61, z0: -6.84, z1: 7.56 };
export const DOOR = { x: 1.12 * SHIP_SCALE, z: -0.6 * SHIP_SCALE, half: 1.7 };
export const PLAYER_R = 0.45;
export function hullBoxes(offset = { x: 0, z: 0 }) {
  const shapes = [{ id: "keel", ...HULL,y0:2.358,y1:3.618 }];
  for (const sign of [-1, 1])
    for (const z of [-1.4, 1.7]) {
      const x = sign * 1.2 * SHIP_SCALE,
        cz = z * SHIP_SCALE;
      shapes.push({
        id: sign < 0 ? "port" : "thruster",
        x0: x - 0.99,
        x1: x + 0.99,
        z0: cz - 1.17,
        z1: cz + 1.17,y0:0,y1:.432,
      });
      const legX=sign*1.07*SHIP_SCALE;
      shapes.push({id:sign<0?'port':'thruster',x0:legX-.592,x1:legX+.592,z0:cz-.216,z1:cz+.216,y0:.34,y1:3.475});
    }
  return shapes.map((b) => ({
    ...b,
    x0: b.x0 + offset.x,
    x1: b.x1 + offset.x,
    z0: b.z0 + offset.z,
    z1: b.z1 + offset.z,
  }));
}
export function partBoxes(parts) {
  const installed = new Set(
    parts.filter((p) => p.stage === "secured").map((p) => p.id),
  );
  return hullBoxes().filter((b) => installed.has(b.id));
}
const inside = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
const grow = (b, r) => ({
  x0: b.x0 - r,
  x1: b.x1 + r,
  z0: b.z0 - r,
  z1: b.z1 + r,
});
// Push (x,z) out of every box, along the shortest way.
export function resolve(x, z, boxes, r = PLAYER_R) {
  let px = x,
    pz = z;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const raw of boxes) {
      const b = grow(raw, r);
      if (!inside(b, px, pz)) continue;
      const c = [
        [b.x0, pz],
        [b.x1, pz],
        [px, b.z0],
        [px, b.z1],
      ]
        .map(([cx, cz]) => ({ cx, cz, d: Math.hypot(cx - px, cz - pz) }))
        .filter(
          (o) =>
            !boxes.some(
              (other) =>
                other !== raw && inside(grow(other, r - 0.01), o.cx, o.cz),
            ),
        )
        .sort((a, b2) => a.d - b2.d);
      if (c.length) {
        px = c[0].cx;
        pz = c[0].cz;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}
export const nearDoor = (x, z, offset = { x: 0, z: 0 }) =>
  Math.hypot(x - (DOOR.x + offset.x), z - (DOOR.z + offset.z)) < 3.2;
// World size is already ship scale; exported so tests can assert the hull spans the 33 m ship.
export const SHIP_LENGTH = HULL.z1 - HULL.z0;
export const _scale = SHIP_SCALE;

// Actual tool reach to the visible exterior service fastener; no distance through walls.
export function reachDistance(px, pz, tx, ty, tz) {
  return Math.hypot(tx - px, ty, tz - pz);
}

// Round obstacles (rocks, posts): each is {x,z,r}. Resolved the same way as the hull boxes, but as a disc.
export function resolveCircles(x, z, circles, r = PLAYER_R) {
  let px = x,
    pz = z;
  for (const c of circles) {
    const dx = px - c.x,
      dz = pz - c.z,
      min = c.r + r,
      dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < min) {
      const k = min / dist;
      px = c.x + dx * k;
      pz = c.z + dz * k;
    } else if (dist === 0) {
      px = c.x + min;
      pz = c.z;
    }
  }
  return { x: px, z: pz };
}

export const atActorHeight=(boxes,bottom=0,height=2.5)=>boxes.filter(b=>b.y0===undefined||bottom+height>b.y0+.001&&bottom<(b.y1??Infinity)-.001);
