// Shared bounded A* navigation. Every segment is swept using the gameplay collider.
import { blocked, movePlanar, recoverPlanar } from "./motion-physics.js";
export function findPath(start, goal, boxes = [], circles = [], radius = 0.55) {
  const end = recoverPlanar(goal.x, goal.z, boxes, circles, radius + 0.05);
  const clear = (a, b) =>
    !movePlanar(a.x, a.z, b.x - a.x, b.z - a.z, boxes, circles, radius).hit;
  if (clear(start, end)) return [end];
  const cell = 1.1,
    key = (x, z) => x + "," + z;
  const sx = Math.round(start.x / cell),
    sz = Math.round(start.z / cell);
  const h = (x, z) => Math.hypot(x * cell - end.x, z * cell - end.z);
  const first = { x: sx, z: sz, g: 0, f: h(sx, sz), parent: null };
  const open = [];
  const push = (n) => {
    let i = open.length;
    open.push(n);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (open[parent].f <= n.f) break;
      open[i] = open[parent];
      i = parent;
    }
    open[i] = n;
  };
  const pop = () => {
    const first = open[0],
      last = open.pop();
    if (open.length) {
      let i = 0;
      while (i * 2 + 1 < open.length) {
        let j = i * 2 + 1;
        if (j + 1 < open.length && open[j + 1].f < open[j].f) j++;
        if (open[j].f >= last.f) break;
        open[i] = open[j];
        i = j;
      }
      open[i] = last;
    }
    return first;
  };
  push(first);
  const seen = new Map([[key(sx, sz), first]]),
    closed = new Set();
  let best = first;
  for (let count = 0; open.length && count < 7000; count++) {
    const n = pop(),
      nk = key(n.x, n.z);
    if (closed.has(nk)) continue;
    closed.add(nk);
    const p = n.parent ? { x: n.x * cell, z: n.z * cell } : start;
    if (h(n.x, n.z) < h(best.x, best.z)) best = n;
    if (h(n.x, n.z) < 1.6 && clear(p, end)) {
      best = n;
      break;
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const x = n.x + dx,
          z = n.z + dz,
          k = key(x, z);
        if (closed.has(k) || Math.abs(x - sx) > 90 || Math.abs(z - sz) > 90)
          continue;
        const q = { x: x * cell, z: z * cell };
        if (blocked(q.x, q.z, boxes, circles, radius) || !clear(p, q)) continue;
        const g = n.g + Math.hypot(dx, dz);
        if (seen.has(k) && seen.get(k).g <= g) continue;
        const next = { x, z, g, f: g + h(x, z) / cell, parent: n };
        seen.set(k, next);
        push(next);
      }
  }
  const path = [];
  for (let n = best; n?.parent; n = n.parent)
    path.unshift({ x: n.x * cell, z: n.z * cell });
  if (path.length && clear(path[path.length - 1], end)) path.push(end);
  // Simplify only across verified collision-free segments.
  const simplified = [];
  let from = start;
  while (path.length) {
    let i = path.length - 1;
    while (i > 0 && !clear(from, path[i])) i--;
    from = path[i];
    simplified.push(from);
    path.splice(0, i + 1);
  }
  return simplified;
}
