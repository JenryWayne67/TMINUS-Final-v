import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS, SLOTS, createLoadout, currentWeapon, currentGun, spreadAngle, canFire, fire, startReload, switchTo, cycle,
  tickLoadout, falloff, createVitals, damage, tickVitals, heal, moveSpeed, isSprinting, approach, throwGrenade, stepGrenade,
  explosionDamage, GRENADE, raySphere, firstHit, applySpread, addAmmo} from '../dist/fps-core.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const idle = l => { tickLoadout(l, 5); return l; };

test('three weapons with distinct roles; every model file is shipped', async () => {
  assert.deepEqual(SLOTS, ['carbine', 'sidearm', 'scatter']);
  assert.ok(WEAPONS.carbine.auto && !WEAPONS.sidearm.auto && !WEAPONS.scatter.auto);
  assert.ok(WEAPONS.scatter.pellets > 1);
  const {access} = await import('node:fs/promises');
  for (const id of SLOTS) await access(new URL('../dist/assets/weapons/' + WEAPONS[id].model, import.meta.url));
  for (const id of SLOTS) await access(new URL(`../dist/assets/audio/${WEAPONS[id].sound}.ogg`, import.meta.url));
});

test('fire spends one round, sets the fire-rate cooldown and blooms the spread', () => {
  const l = createLoadout(), before = currentGun(l).mag;
  const r = fire(l, {}, seq(0.5));
  assert.ok(r.ok);
  assert.equal(currentGun(l).mag, before - 1);
  near(l.cooldown, 60 / WEAPONS.carbine.rpm);
  assert.ok(l.bloom > 0);
  assert.equal(fire(l, {}, seq(0.5)).reason, 'cooldown');
  tickLoadout(l, 0.2);
  assert.ok(fire(l, {}, seq(0.5)).ok, 'cooldown elapsed');
});

test('spread: aiming and crouching tighten it, moving and sprinting widen it, firing blooms it', () => {
  const l = createLoadout();
  const hip = spreadAngle(l, {}), ads = spreadAngle(l, {ads: true}), crouch = spreadAngle(l, {crouch: true});
  const moving = spreadAngle(l, {moving: true}), sprint = spreadAngle(l, {sprint: true});
  assert.ok(ads < hip && crouch < hip && moving > hip && sprint > moving);
  fire(l, {}, seq(0.5));
  assert.ok(spreadAngle(l, {}) > hip, 'bloom after a shot');
  idle(l);
  near(spreadAngle(l, {}), hip, 1e-9);
});

test('the scatter blaster fires 8 pellets inside its cone; the carbine fires 1', () => {
  const l = createLoadout();
  assert.equal(fire(l, {}, Math.random).shots.length, 1);
  idle(l); switchTo(l, 2); idle(l);
  const r = fire(l, {}, Math.random);
  assert.equal(r.shots.length, 8);
  const cone = WEAPONS.scatter.spread.hip;
  for (const s of r.shots) assert.ok(Math.hypot(s.yaw, s.pitch) <= cone + 1e-9);
});

test('auto reload cannot start with a full magazine or no reserve; reloading blocks fire then refills', () => {
  const l = createLoadout();
  assert.equal(startReload(l), false, 'full magazine');
  for (let i = 0; i < 5; i++) { fire(l, {}, seq(0.5)); tickLoadout(l, 0.2); }
  assert.equal(currentGun(l).mag, 25);
  assert.ok(startReload(l));
  assert.equal(fire(l, {}, seq(0.5)).reason, 'reloading');
  const done = tickLoadout(l, WEAPONS.carbine.reload + 0.01);
  assert.ok(done.reloaded);
  assert.equal(currentGun(l).mag, 30);
  assert.equal(currentGun(l).reserve, WEAPONS.carbine.reserve - 5);
  currentGun(l).mag = 0; currentGun(l).reserve = 0;
  assert.equal(startReload(l), false, 'nothing left to load');
});

test('partial reserve: reload only loads what is available', () => {
  const l = createLoadout();
  currentGun(l).mag = 10; currentGun(l).reserve = 4;
  startReload(l); tickLoadout(l, 3);
  assert.equal(currentGun(l).mag, 14);
  assert.equal(currentGun(l).reserve, 0);
});

test('an empty magazine reports "empty" so the game can click and auto-reload', () => {
  const l = createLoadout(); currentGun(l).mag = 0;
  assert.equal(canFire(l), false);
  assert.equal(fire(l, {}, seq(0.5)).reason, 'empty');
});

test('switching takes the draw time, cancels a reload, and cycles both ways', () => {
  const l = createLoadout();
  startReload(l);
  assert.ok(switchTo(l, 1));
  assert.equal(l.reloading, 0, 'reload cancelled');
  assert.equal(currentWeapon(l).id, 'sidearm');
  assert.equal(fire(l, {}, seq(0.5)).reason, 'switching');
  tickLoadout(l, 1);
  assert.ok(fire(l, {}, seq(0.5)).ok);
  assert.equal(switchTo(l, 1), false, 'already holding it');
  assert.ok(cycle(l, 1)); assert.equal(currentWeapon(l).id, 'scatter');
  assert.ok(cycle(l, 1)); assert.equal(currentWeapon(l).id, 'carbine');
  assert.ok(cycle(l, -1)); assert.equal(currentWeapon(l).id, 'scatter');
});

test('sprinting blocks firing', () => {
  const l = createLoadout();
  assert.equal(fire(l, {sprint: true}, seq(0.5)).reason, 'sprinting');
});

test('recoil kicks the camera up and settles back', () => {
  const l = createLoadout();
  const r = fire(l, {}, seq(0.5));
  assert.ok(r.recoil.pitch > 0 && l.recoil.pitch > 0);
  const kicked = l.recoil.pitch;
  tickLoadout(l, 0.5);
  assert.ok(l.recoil.pitch < kicked * 0.1);
  const l2 = createLoadout(), a = fire(l2, {ads: true}, seq(0.5));
  assert.ok(a.recoil.pitch < r.recoil.pitch, 'aiming down sights steadies the weapon');
});

test('damage falls off with distance', () => {
  const w = WEAPONS.carbine;
  assert.equal(falloff(w, 10), 1);
  near(falloff(w, w.range), 0.5);
  assert.equal(falloff(w, w.range + 1), 0);
  assert.ok(falloff(w, 50) < falloff(w, 40));
});

test('shield absorbs first, then health; shield break is reported once', () => {
  const v = createVitals();
  let r = damage(v, 40);
  assert.deepEqual([r.shield, r.health, r.shieldBroke], [40, 0, false]);
  r = damage(v, 40);
  assert.deepEqual([r.shield, r.health, r.shieldBroke], [20, 20, true]);
  assert.equal(v.health, 80);
  r = damage(v, 30);
  assert.deepEqual([r.shield, r.health], [0, 30]);
  assert.equal(r.shieldBroke, false);
});

test('death at zero health, and a dead player takes no more damage', () => {
  const v = createVitals();
  const r = damage(v, 500);
  assert.ok(r.died);
  assert.equal(v.health, 0);
  assert.equal(damage(v, 10).health, 0);
});

test('shield recharges only after a delay without damage, and reports when it comes back', () => {
  const v = createVitals(); damage(v, 60);
  assert.equal(v.shield, 0);
  tickVitals(v, 3);
  assert.equal(v.shield, 0, 'still in the delay');
  let back = false;
  for (let i = 0; i < 40; i++) back = tickVitals(v, 0.1) || back;
  assert.ok(back && v.shield > 0, 'shield is back up');
  for (let i = 0; i < 200; i++) tickVitals(v, 0.1);
  near(v.shield, v.maxShield);
  damage(v, 10); tickVitals(v, 1);
  assert.ok(v.shield < v.maxShield, 'a new hit restarts the delay');
});

test('health does not regenerate by itself; heal caps at max', () => {
  const v = createVitals(); damage(v, 90);
  const h = v.health; for (let i = 0; i < 300; i++) tickVitals(v, 0.1);
  assert.equal(v.health, h);
  heal(v, 500); assert.equal(v.health, v.maxHealth);
});

test('movement speeds: sprint faster, crouch and aiming slower, carrying a flag slows and blocks sprint', () => {
  const walk = moveSpeed({});
  assert.ok(moveSpeed({sprint: true}) > walk);
  assert.ok(moveSpeed({crouch: true}) < walk);
  assert.ok(moveSpeed({ads: true}) < walk);
  assert.ok(moveSpeed({carrying: true}) < walk);
  assert.equal(moveSpeed({sprint: true, carrying: true}), moveSpeed({carrying: true}));
  assert.equal(moveSpeed({sprint: true, crouch: true}), moveSpeed({crouch: true}));
  assert.equal(moveSpeed({sprint: true, forward: false}), walk, 'no sprinting backwards');
  assert.equal(isSprinting({sprint: true, moving: true, forward: true}), true);
  assert.equal(isSprinting({sprint: true, moving: false, forward: true}), false);
  assert.equal(isSprinting({sprint: true, moving: true, forward: true, ads: true}), false);
  near(approach(0, 10, 100, 1), 10, 1e-6);
});

test('grenade: thrown from the stock of three, arcs, bounces, and explodes on its fuse', () => {
  const l = createLoadout();
  const g = throwGrenade(l, [0, 1.5, 0], [0, 0, -1]);
  assert.equal(l.grenades, 2);
  assert.ok(g.vel[2] < -10 && g.vel[1] > 0);
  let peak = 0, t = 0;
  while (!g.exploded && t < 5) { stepGrenade(g, 1 / 60); peak = Math.max(peak, g.pos[1]); t += 1 / 60; }
  assert.ok(g.exploded);
  near(t, GRENADE.fuse, 0.05);
  assert.ok(peak > 1.5, 'it arced upward first');
  assert.ok(g.bounces >= 1, 'it bounced on the ground');
  assert.ok(g.pos[1] >= 0 && g.pos[2] < -5, 'it landed down range');
  throwGrenade(l, [0, 1, 0], [0, 0, -1]); throwGrenade(l, [0, 1, 0], [0, 0, -1]);
  assert.equal(throwGrenade(l, [0, 1, 0], [0, 0, -1]), null, 'out of grenades');
});

test('grenade damage is highest at the centre and zero outside the blast radius', () => {
  near(explosionDamage(0), GRENADE.maxDamage);
  assert.ok(explosionDamage(3) < explosionDamage(1));
  assert.ok(explosionDamage(GRENADE.radius - 0.01) > 0);
  assert.equal(explosionDamage(GRENADE.radius), 0);
  assert.equal(explosionDamage(50), 0);
});

test('hit scan: ray vs sphere, nearest target wins, range respected', () => {
  near(raySphere([0, 0, 0], [0, 0, -1], [0, 0, -10], 1), 9);
  assert.equal(raySphere([0, 0, 0], [0, 0, -1], [5, 0, -10], 1), null);
  assert.equal(raySphere([0, 0, 0], [0, 0, 1], [0, 0, -10], 1), null, 'behind the shooter');
  const targets = [{id: 'far', center: [0, 0, -30], radius: 1}, {id: 'near', center: [0, 0, -12], radius: 1}];
  const h = firstHit([0, 0, 0], [0, 0, -1], targets, 50);
  assert.equal(h.target.id, 'near');
  assert.equal(firstHit([0, 0, 0], [0, 0, -1], targets, 5), null);
});

test('spread offsets turn the aim a little, and zero spread leaves it unchanged', () => {
  const f = [0, 0, -1];
  const same = applySpread(f, 0, 0);
  near(same[0], 0); near(same[1], 0); near(same[2], -1);
  const right = applySpread(f, 0.1, 0);
  assert.ok(right[0] > 0.09 && Math.abs(right[1]) < 1e-9);
  const up = applySpread(f, 0, 0.1);
  assert.ok(up[1] > 0.09);
  near(Math.hypot(...applySpread([0.6, 0.3, -0.742], 0.05, -0.03)), 1);
});

test('ammo pickups add to reserve', () => {
  const l = createLoadout(); addAmmo(l, 'sidearm', 24);
  assert.equal(l.guns.sidearm.reserve, WEAPONS.sidearm.reserve + 24);
});
