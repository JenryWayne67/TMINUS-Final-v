// Pure logic for walking inside the ship (no THREE, no DOM), so it can be unit tested.
// Data comes from the T-MINUS_Latest ship_interior pack: ship_nav.json (0.5 m walk grids, portals)
// and ship_interior.scene.json (module extents, repair-prop placements).

export const EYE_HEIGHT = 1.65;
export const RADIUS = 0.2;   // the airlock door has only ~0.6 m of free floor in the nav grid
export const WALK_SPEED = 2.6;
export const RUN_SPEED = 4.4;

export const TASK_LABEL = {
  clear_fuel_line: 'Clear the fuel line', open_coolant_valve: 'Open the coolant valve', patch_hull: 'Patch the hull',
  manual_ignition: 'Manual ignition', swap_fuse: 'Swap the burnt fuse', reconnect_wires: 'Reconnect the wires',
  reroute_power: 'Reroute power', balance_power: 'Balance power', swap_co2_filter: 'Swap the CO₂ filter'
};
export const prettyTask = t => TASK_LABEL[t] || String(t || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// A point is walkable if it lies on a free cell of some module grid, or inside a doorway.
export function isWalkable(nav, x, z) {
  const cell = nav.cell;
  for (const m of Object.values(nav.modules)) {
    const col = Math.floor((x - m.origin[0]) / cell), row = Math.floor((z - m.origin[1]) / cell);
    if (row >= 0 && row < m.rows_z_cols_x.length && col >= 0 && col < m.rows_z_cols_x[row].length && m.rows_z_cols_x[row][col] === 1) return true;
  }
  for (const p of nav.portals) {
    const [px, , pz] = p.position;
    const sideDoor = Math.abs(px) > 1;                        // the airlock door is in a side wall
    const halfAcross = p.width / 2, halfAlong = 0.3;
    const inX = sideDoor ? Math.abs(x - px) <= halfAlong : Math.abs(x - px) <= halfAcross;
    const inZ = sideDoor ? Math.abs(z - pz) <= halfAcross : Math.abs(z - pz) <= halfAlong;
    if (inX && inZ) return true;
  }
  return false;
}

// The body is a small square: all four corners must stand on walkable floor.
export function canStand(nav, x, z, r = RADIUS) {
  return isWalkable(nav, x, z) && isWalkable(nav, x + r, z + r) && isWalkable(nav, x + r, z - r)
    && isWalkable(nav, x - r, z + r) && isWalkable(nav, x - r, z - r);
}

export function spawnPoint(scene, room = 'engine_bay') {
  const m = scene.modules.find(m => m.name === room) || scene.modules[0];
  return {x: m.center[0], z: m.zmin + 1.2, yaw: 0};
}

export function createWalker(nav, scene, room = 'engine_bay') {
  const s = spawnPoint(scene, room);
  return {x: s.x, z: s.z, yaw: s.yaw, pitch: 0};
}

// forward / strafe in -1..1. yaw 0 looks along +Z (rear to nose), matching the model.
export function stepWalker(w, nav, dt, {forward = 0, strafe = 0, run = false} = {}) {
  // Facing +Z (yaw 0), the player's right hand points to -X, so strafe > 0 (right) moves toward -X.
  let dx = Math.sin(w.yaw) * forward - Math.cos(w.yaw) * strafe;
  let dz = Math.cos(w.yaw) * forward + Math.sin(w.yaw) * strafe;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  const v = (run ? RUN_SPEED : WALK_SPEED) * Math.min(dt, 0.1);
  const nx = w.x + dx * v, nz = w.z + dz * v;
  if (canStand(nav, nx, w.z)) w.x = nx;       // slide along walls: axes are tried separately
  if (canStand(nav, w.x, nz)) w.z = nz;
  return w;
}

// Prevent the third-person camera from passing through ship walls. Uses the exact
// navigation grid instead of a broad room AABB, so doorways remain traversable.
export function cameraNavFraction(nav, fromX, fromZ, toX, toZ, step = 0.1) {
  const dx=toX-fromX,dz=toZ-fromZ,dist=Math.hypot(dx,dz);
  if(dist<1e-6)return 1;
  const count=Math.max(1,Math.ceil(dist/step));
  for(let i=1;i<=count;i++){
    const t=i/count;
    if(!canStand(nav,fromX+dx*t,fromZ+dz*t,0.08))return Math.max(0.08,(i-1)/count-.02);
  }
  return 1;
}

// Which module's floor area contains the point (null in a doorway gap). Uses the nav grid bounds.
export function roomAt(nav, x, z) {
  for (const [name, m] of Object.entries(nav.modules)) {
    const w = m.rows_z_cols_x[0].length * nav.cell, d = m.rows_z_cols_x.length * nav.cell;
    if (x >= m.origin[0] && x < m.origin[0] + w && z >= m.origin[1] && z < m.origin[1] + d) return name;
  }
  return null;
}

export function nearestProp(scene, x, z, within = 2.2) {
  let best = null, bd = within;
  for (const p of scene.props) {
    const d = Math.hypot(p.position[0] - x, p.position[2] - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? {...best, distance: bd, label: prettyTask(best.task)} : null;
}

// Science text shown on the HUD for a room, taken from the live design sheet.
export const ROOM_BLURB = {
  engine_bay: 'Where thrust is made. Mass and thrust decide whether the ship can leave the pad.',
  power_room: 'Reactor, battery and radiator. Every system you add draws from here.',
  life_support: 'Scrubbers and stores keep four crew breathing for the whole mission.',
  workshop: 'Spares, tools and cargo racks. The airlock opens off this room.',
  lab: 'Instruments and the antenna. Science is only worth something once it reaches home.',
  cockpit: 'The pilot flies on the numbers the other rooms produce.',
  airlock: 'Where crew leave the ship for spacewalk repairs.'
};

export function roomLessons(sheet, room) {
  return sheet.checks.filter(c => c.room === room);
}
