// First-person firefight rules. Pure logic: no THREE, no DOM, so every number can be unit tested.
// Used on the Planet B surface, where the crew capture flags while rival crews fight back.

// ---- Weapons -------------------------------------------------------------------------------------
// Angles are radians. rpm = rounds per minute. spread = cone half-angle when hip-firing / aiming down sights.
export const WEAPONS = {
  carbine: {id: 'carbine', name: 'ARC CARBINE', slot: 1, model: 'blaster-f.glb', auto: true, rpm: 620, damage: 12, pellets: 1,
    spread: {hip: 0.032, ads: 0.006}, recoil: {pitch: 0.010, yaw: 0.0035}, mag: 30, reserve: 120, reload: 1.9, draw: 0.45,
    range: 70, adsFov: 46, sound: 'shot_carbine', view: {scale: 0.36, pos: [0.2, -0.22, -0.5], ads: [0, -0.15, -0.4]}},
  sidearm: {id: 'sidearm', name: 'PULSE SIDEARM', slot: 2, model: 'blaster-b.glb', auto: false, rpm: 380, damage: 21, pellets: 1,
    spread: {hip: 0.02, ads: 0.004}, recoil: {pitch: 0.016, yaw: 0.004}, mag: 12, reserve: 72, reload: 1.3, draw: 0.3,
    range: 55, adsFov: 54, sound: 'shot_sidearm', view: {scale: 0.4, pos: [0.19, -0.19, -0.42], ads: [0, -0.125, -0.34]}},
  scatter: {id: 'scatter', name: 'SCATTER BLASTER', slot: 3, model: 'blaster-d.glb', auto: false, rpm: 80, damage: 7, pellets: 8,
    spread: {hip: 0.085, ads: 0.05}, recoil: {pitch: 0.05, yaw: 0.01}, mag: 6, reserve: 30, reload: 2.7, draw: 0.6,
    range: 28, adsFov: 58, sound: 'shot_scatter', view: {scale: 0.36, pos: [0.2, -0.21, -0.48], ads: [0, -0.14, -0.38]}}
};
export const SLOTS = ['carbine', 'sidearm', 'scatter'];
export const GRENADES_START = 3;

export function createLoadout() {
  const guns = {};
  for (const id of SLOTS) guns[id] = {mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve};
  return {current: 0, guns, cooldown: 0, reloading: 0, switching: 0, bloom: 0, recoil: {pitch: 0, yaw: 0},
    grenades: GRENADES_START, lastShot: 99, fired: 0};
}
export const currentWeapon = l => WEAPONS[SLOTS[l.current]];
export const currentGun = l => l.guns[SLOTS[l.current]];

// Cone half-angle: widens while moving, shrinks when crouched or aiming, and blooms as you keep firing.
export function spreadAngle(l, ctx = {}) {
  const w = currentWeapon(l);
  let a = ctx.ads ? w.spread.ads : w.spread.hip;
  if (ctx.crouch) a *= 0.7;
  if (ctx.moving) a *= 1.5;
  if (ctx.sprint) a *= 2;
  return a * (1 + l.bloom);
}

export const canFire = l => l.cooldown <= 0 && l.reloading <= 0 && l.switching <= 0 && currentGun(l).mag > 0;

// Fire the current weapon. Returns {ok:true, shots:[{yaw,pitch,damage}], recoil} or {ok:false, reason}.
// `rand` returns 0..1 and is injected so tests are deterministic.
export function fire(l, ctx = {}, rand = Math.random) {
  const w = currentWeapon(l), g = currentGun(l);
  if (ctx.sprint) return {ok: false, reason: 'sprinting'};
  if (l.switching > 0) return {ok: false, reason: 'switching'};
  if (l.reloading > 0) return {ok: false, reason: 'reloading'};
  if (l.cooldown > 0) return {ok: false, reason: 'cooldown'};
  if (g.mag <= 0) return {ok: false, reason: 'empty'};
  const cone = spreadAngle(l, ctx), shots = [];
  for (let i = 0; i < w.pellets; i++) {
    const r = Math.sqrt(rand()) * cone, th = rand() * Math.PI * 2;      // uniform point inside the cone
    shots.push({yaw: Math.cos(th) * r, pitch: Math.sin(th) * r, damage: w.damage});
  }
  g.mag--;
  l.cooldown = 60 / w.rpm;
  l.lastShot = 0;
  l.fired++;
  l.bloom = Math.min(1.2, l.bloom + (w.pellets > 1 ? 0.5 : 0.12));
  const kick = ctx.ads ? 0.6 : 1, crouch = ctx.crouch ? 0.75 : 1;
  const recoil = {pitch: w.recoil.pitch * kick * crouch, yaw: (rand() - 0.5) * 2 * w.recoil.yaw * kick};
  l.recoil.pitch += recoil.pitch; l.recoil.yaw += recoil.yaw;
  return {ok: true, shots, recoil, weapon: w.id};
}

export function startReload(l) {
  const w = currentWeapon(l), g = currentGun(l);
  if (l.reloading > 0 || l.switching > 0 || g.mag >= w.mag || g.reserve <= 0) return false;
  l.reloading = w.reload;
  return true;
}
export function cancelReload(l) { l.reloading = 0; }

export function switchTo(l, index) {
  if (index < 0 || index >= SLOTS.length || index === l.current) return false;
  cancelReload(l);
  l.current = index;
  l.switching = currentWeapon(l).draw;
  l.cooldown = Math.max(l.cooldown, currentWeapon(l).draw * 0.6);
  return true;
}
export const cycle = (l, dir = 1) => switchTo(l, (l.current + (dir >= 0 ? 1 : SLOTS.length - 1)) % SLOTS.length);

export function addAmmo(l, id, n) { if (l.guns[id]) l.guns[id].reserve += n; }

// Advance timers. Returns {reloaded:true} on the frame a reload completes.
export function tickLoadout(l, dt) {
  const out = {reloaded: false};
  l.cooldown = Math.max(0, l.cooldown - dt);
  l.switching = Math.max(0, l.switching - dt);
  l.lastShot += dt;
  if (l.reloading > 0) {
    l.reloading -= dt;
    if (l.reloading <= 0) {
      l.reloading = 0;
      const w = currentWeapon(l), g = currentGun(l), need = w.mag - g.mag, take = Math.min(need, g.reserve);
      g.mag += take; g.reserve -= take;
      out.reloaded = true;
    }
  }
  l.bloom = Math.max(0, l.bloom - dt * (l.lastShot > 0.25 ? 2.2 : 0.4));
  const rec = Math.exp(-dt * 7);                                  // camera kick settles back
  l.recoil.pitch *= rec; l.recoil.yaw *= rec;
  return out;
}

// Damage falls off with distance: full to half range, then down to 50% at full range, nothing beyond.
export function falloff(w, distance) {
  if (distance > w.range) return 0;
  const half = w.range * 0.5;
  return distance <= half ? 1 : 1 - 0.5 * (distance - half) / (w.range - half);
}

// ---- Health and shield ----------------------------------------------------------------------------
export function createVitals() {
  return {health: 100, maxHealth: 100, shield: 60, maxShield: 60, sinceHit: 99, regenDelay: 4, regenRate: 22, shieldDown: false};
}
export function damage(v, amount) {
  const out = {shield: 0, health: 0, shieldBroke: false, died: false};
  if (amount <= 0 || v.health <= 0) return out;
  v.sinceHit = 0;
  const s = Math.min(v.shield, amount);
  v.shield -= s; out.shield = s;
  if (s > 0 && v.shield <= 0) { out.shieldBroke = true; v.shieldDown = true; }
  const rest = amount - s;
  if (rest > 0) { const h = Math.min(v.health, rest); v.health -= h; out.health = h; }
  if (v.health <= 0) out.died = true;
  return out;
}
// Shield recharges after a few seconds without damage. Returns true on the frame the shield comes back up.
export function tickVitals(v, dt) {
  v.sinceHit += dt;
  if (v.health > 0 && v.sinceHit > v.regenDelay && v.shield < v.maxShield) {
    v.shield = Math.min(v.maxShield, v.shield + v.regenRate * dt);
    if (v.shieldDown && v.shield > 0) { v.shieldDown = false; return true; }
  }
  return false;
}
export const heal = (v, n) => { if (v.health > 0) v.health = Math.min(v.maxHealth, v.health + n); };
export const resetVitals = v => { Object.assign(v, createVitals()); };

// ---- Movement and stance --------------------------------------------------------------------------
import {speedFor, SPEED} from './locomotion.js';
export const RUN_SPEED = SPEED.run;
export const EYE_STAND = 1.85, EYE_CROUCH = 1.15;
// W is run, W + Shift is sprint; carrying a flag slows you and blocks sprint; heavy loads are walk only.
export function moveSpeed({sprint = false, crouch = false, ads = false, carrying = false, heavy = false, forward = true} = {}) {
  return speedFor({sprint, crouch, ads, carrying: heavy ? 'heavy' : carrying ? 'light' : 'none', forward});
}
export const isSprinting = ({sprint, crouch, ads, carrying, moving, forward}) => !!(sprint && moving && forward && !crouch && !ads && !carrying);
// Smoothly move a value toward a target (used for eye height and field of view).
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Head bob while walking: a small vertical wave tied to distance travelled.
export function bob(phase, speed, crouch) {
  const amp = crouch ? 0.012 : Math.min(0.045, speed * 0.008);
  return {y: Math.sin(phase * 2) * amp, x: Math.cos(phase) * amp * 0.6};
}

// ---- Grenades -------------------------------------------------------------------------------------
export const GRENADE = {fuse: 2.2, radius: 7, maxDamage: 90, gravity: 14, restitution: 0.38, friction: 0.7, throwSpeed: 17, radiusBody: 0.12};
export function throwGrenade(l, origin, dir, carrySpeed = 0) {
  if (l.grenades <= 0) return null;
  l.grenades--;
  const sp = GRENADE.throwSpeed + carrySpeed * 0.5;
  // a slight upward lob so a level throw arcs rather than drops
  return {pos: [...origin], vel: [dir[0] * sp, dir[1] * sp + 3, dir[2] * sp], fuse: GRENADE.fuse, bounces: 0, exploded: false};
}
export function stepGrenade(g, dt, groundY = 0) {
  if (g.exploded) return g;
  g.fuse -= dt;
  g.vel[1] -= GRENADE.gravity * dt;
  for (let i = 0; i < 3; i++) g.pos[i] += g.vel[i] * dt;
  if (g.pos[1] < groundY + GRENADE.radiusBody) {
    g.pos[1] = groundY + GRENADE.radiusBody;
    if (Math.abs(g.vel[1]) > 0.8) { g.vel[1] = -g.vel[1] * GRENADE.restitution; g.bounces++; } else g.vel[1] = 0;
    g.vel[0] *= GRENADE.friction; g.vel[2] *= GRENADE.friction;
  }
  if (g.fuse <= 0) g.exploded = true;
  return g;
}
// Full damage at the centre, falling to 15% at the edge, nothing outside the radius.
export function explosionDamage(distance) {
  if (distance >= GRENADE.radius) return 0;
  return GRENADE.maxDamage * (1 - 0.85 * distance / GRENADE.radius);
}

// ---- Hit scanning ---------------------------------------------------------------------------------
// Ray against a sphere: distance along the ray (dir must be a unit vector) or null.
export function raySphere(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? t2 : null;
}
// Nearest target hit by the ray within maxRange. targets: [{id, center:[x,y,z], radius}].
export function firstHit(o, d, targets, maxRange) {
  let best = null;
  for (const t of targets) {
    const dist = raySphere(o, d, t.center, t.radius);
    if (dist !== null && dist <= maxRange && (!best || dist < best.distance)) best = {target: t, distance: dist};
  }
  return best;
}
// Rotate a unit forward vector by small yaw/pitch offsets (the spread cone), around the camera's own axes.
export function applySpread(forward, yaw, pitch) {
  const [x, y, z] = forward;
  const len = Math.hypot(x, z) || 1;
  const rx = -z / len, rz = x / len;                 // right-hand vector in the horizontal plane (+X when facing -Z)
  const ux = -x * y / len, uy = len, uz = -z * y / len;   // up vector
  const v = [x + rx * yaw + ux * pitch, y + uy * pitch, z + rz * yaw + uz * pitch];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
}
