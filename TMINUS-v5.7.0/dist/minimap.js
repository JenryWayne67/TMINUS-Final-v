// Minimap logic: where things go on the map and which things each phase shows. Pure (no DOM, no THREE).
// The map is heading-up: the direction you face is the top of the map.
import {RACKS, CARGO_SPOTS} from './ship-scale.js';

export const ZOOMS = [0.6, 1, 1.7];                       // multiplies the phase range; M cycles through them
export const RANGE = {assembly: 46, outfit: 46, route: 46, gonogo: 46, flight: 34, surface: 58, delivery: 50, spectator: 80};
export const rangeFor = (phase, zoomIndex = 1) => (RANGE[phase] ?? 50) * ZOOMS[zoomIndex];

// Forward in the game is (sin yaw, -cos yaw) on the ground plane; right is (cos yaw, sin yaw).
export function worldToMap(px, pz, cx, cz, yaw, range, size) {
  const dx = px - cx, dz = pz - cz;
  const fwd = dx * Math.sin(yaw) - dz * Math.cos(yaw), right = dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const k = size / 2 / range;
  return {x: size / 2 + right * k, y: size / 2 - fwd * k, dist: Math.hypot(dx, dz), inside: Math.hypot(right, fwd) <= range};
}
// Pin an off-map point to the rim of the circular map, so you still see which way it is.
export function clampToRim(pt, size, margin = 7) {
  const c = size / 2, dx = pt.x - c, dy = pt.y - c, d = Math.hypot(dx, dy), r = c - margin;
  return d <= r ? pt : {...pt, x: c + dx / d * r, y: c + dy / d * r};
}

// Everything the map may show. ctx = {phase, player:{x,z}, actors:[{x,z}], ship:{x,z,upright}, objective:{x,z,label}|null,
//   flags:[{x,z,state}], rivals:[{x,z,bx,bz,color,eliminated}], receiver:{x,z}|null, hazards:[{x,z}], enemies:[{x,z,color}], currentPart:{cx,cz,hx,hz}|null}
export function collectEntities(state, ctx) {
  const e = [], phase = ctx.phase, colors = state.teams.map(t => t.color);
  const ship = ctx.ship;
  if (ship) e.push(ship.upright ? {kind: 'ship', shape: 'circle', x: ship.x, z: ship.z, r: 8, color: colors[0]} : {kind: 'ship', shape: 'rect', x: ship.x, z: ship.z, hx: 8, hz: 16, color: colors[0]});
  if (phase === 'assembly') {
    RACKS.forEach(([x, z], i) => e.push({kind: 'rack', x, z, color: ['#f6a052', '#f5be76', '#f7ce59', '#f7a28f'][i], label: 'RACK'}));
    if (ctx.currentPart) e.push({kind: 'outline', ...ctx.currentPart, color: '#f7ce59'});
  }
  if (phase === 'outfit') {
    CARGO_SPOTS.forEach(([x, z], i) => { const c = state.cargo[i]; if (c && !c.stowed) e.push({kind: 'cargo', x, z, color: '#d5f591', label: 'SUPPLIES'}); });
    if (ctx.stow) e.push({kind: 'stow', x: ctx.stow.x, z: ctx.stow.z, color: '#d5f591', label: 'STOW'});
    for (const c of ctx.checks || []) if (state.checks[c.id] < 1) e.push({kind: 'check', x: c.x, z: c.z, color: c.color, label: c.id.toUpperCase()});
  }
  if (phase === 'surface') {
    for (const f of ctx.flags || []) if (f.state === 'site' || f.state === 'ground' || f.state === 'carried')
      e.push({kind: 'flag', x: f.x, z: f.z, color: f.state === 'site' ? '#7fe6d2' : '#f7ce59'});
    for (const r of ctx.rivals || []) {
      if (r.eliminated) continue;
      e.push({kind: 'rivalShip', shape: 'circle', x: r.x, z: r.z, r: 8, color: r.color});
      e.push({kind: 'enemy', x: r.bx, z: r.bz, color: r.color});
    }
  }
  if (phase === 'flight') {
    for (const h of ctx.hazards || []) e.push({kind: 'hazard', x: h.x, z: h.z, color: '#9a8a8c'});
    for (const m of ctx.enemies || []) e.push({kind: 'enemy', x: m.x, z: m.z, color: m.color});
  }
  if ((phase === 'delivery' || phase === 'outfit') && ctx.receiver && phase === 'delivery') e.push({kind: 'receiver', x: ctx.receiver.x, z: ctx.receiver.z, color: '#d7e1a6', label: 'RECEIVER'});
  (ctx.actors || []).forEach((a, i) => { if (a && i !== state.selected) e.push({kind: 'mate', x: a.x, z: a.z, color: ['#f6a052', '#f5be76', '#f7ce59', '#f7a28f'][i], label: ['F', 'C', 'B', 'R'][i]}); });
  if (ctx.objective) e.push({kind: 'objective', x: ctx.objective.x, z: ctx.objective.z, color: '#ffffff', label: ctx.objective.label});
  return e;
}

// Text for the legend under the map: what is the white ring and how far away is it.
export function objectiveLine(ctx) {
  if (!ctx.objective) return 'No objective';
  const d = Math.hypot(ctx.objective.x - ctx.player.x, ctx.objective.z - ctx.player.z);
  return `${ctx.objective.label} · ${Math.round(d)} m`;
}
