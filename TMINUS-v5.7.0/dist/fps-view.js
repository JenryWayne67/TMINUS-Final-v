import {getPreferences} from './preferences.js';
// First-person presentation for the firefight: weapon models on the camera with procedural animation,
// muzzle flash, tracers, grenades, the HUD and the sound effects. Rules live in fps-core.js.
import * as THREE from './vendor/three.module.js';
import {loadGLB} from './asset-loader.js';
import {WEAPONS, SLOTS, currentWeapon, currentGun, GRENADE, bob, approach} from './fps-core.js';

const WEAPON_URL = './assets/weapons/', AUDIO_URL = './assets/audio/';
const SOUNDS = ['shot_carbine', 'shot_sidearm', 'shot_scatter', 'shield_hit', 'shield_break', 'shield_recharge', 'explosion', 'hitmarker',
  'hurt', 'step_0', 'step_1', 'step_2', 'step_3', 'capture_tick'];
const WAV = ['reload_click', 'reload_ratchet'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ---- Sound -----------------------------------------------------------------------------------------
export function createSfx(isMuted = () => false) {
  let ctx = null;
  const buffers = new Map();
  const ensure = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } } return ctx; };
  async function load() {
    const c = ensure(); if (!c) return;
    await Promise.all([...SOUNDS.map(n => [n, n + '.ogg']), ...WAV.map(n => [n, n + '.wav'])].map(async ([n, f]) => {
      try { const r = await fetch(AUDIO_URL + f); buffers.set(n, await c.decodeAudioData(await r.arrayBuffer())); } catch { /* falls back to a synthesized tone */ }
    }));
  }
  function tone(freq, dur, type = 'square', vol = 0.06) {
    if(isMuted())return;const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol*getPreferences().masterVolume*getPreferences().effectsVolume; g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  function play(name, {volume = 0.6, rate = 1} = {}) {
    if (isMuted()) return;
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume?.();
    const b = buffers.get(name);
    if (!b) { tone(name === 'click' ? 900 : 260 + (name.length % 5) * 60, 0.07); return; }
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08); g.gain.value = volume*getPreferences().masterVolume*getPreferences().effectsVolume;
    s.connect(g).connect(c.destination); s.start();
  }
  return {load, play, tone, resume: () => ensure()?.resume?.()};
}

// ---- Viewmodel, effects and HUD -----------------------------------------------------------------------
export function createFpsView({camera, scene, sfx}) {
  const root = new THREE.Group();                    // lives on the camera
  camera.add(root);
  if (!camera.parent) scene.add(camera);
  const models = {};                                 // weapon id -> {group, muzzle}
  let grenadeModel = null;
  const effects = [];                                // short-lived meshes {obj, life, fn}
  const flashLight = new THREE.PointLight('#ffd9a0', 0, 8, 2);
  root.add(flashLight); flashLight.position.set(0.2, -0.1, -1);

  const anim = {phase: 0, sway: [0, 0], kick: 0, kickRot: 0, adsT: 0, sprintT: 0, crouchT: 0, flash: 0, throwT: 0, shown: -1,
    prevPitch: 0, prevYaw: 0, fov: 70, lowered: 0};

  async function loadModels() {
    for (const id of SLOTS) {
      const w = WEAPONS[id], group = new THREE.Group();
      let muzzle = new THREE.Vector3(0, 0.04, -0.6);
      try {
        const gltf = await loadGLB(WEAPON_URL + w.model);
        const m = gltf.scene.clone(true);
        m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
        const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
        m.position.sub(centre);                      // centre the model on its own origin
        // Kenney blasters are modelled with the muzzle toward +Z; the camera looks down -Z, so turn it round.
        m.rotation.y = Math.PI;
        const holder = new THREE.Group(); holder.add(m); holder.scale.setScalar(w.view.scale); group.add(holder);
        muzzle = new THREE.Vector3(0, size.y * 0.15 * w.view.scale, -size.z * 0.5 * w.view.scale);
      } catch {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({color: '#6b6479'}));
        group.add(b);
      }
      group.visible = false; root.add(group); models[id] = {group, muzzle};
    }
    try {
      const gltf = await loadGLB(WEAPON_URL + 'grenade-a.glb');
      grenadeModel = gltf.scene;
    } catch { /* a plain sphere is used */ }
  }

  function muzzleWorld(id) {
    const m = models[id]; if (!m) return new THREE.Vector3();
    return m.group.localToWorld(m.muzzle.clone());
  }

  // ---- Per-frame animation. st = {loadout, ads, sprinting, crouch, moving, speed, dt, look:{yaw,pitch}, carrying}
  function update(st) {
    const {loadout: l, dt} = st, w = currentWeapon(l);
    if (anim.shown !== l.current) { for (const id of SLOTS) if (models[id]) models[id].group.visible = id === SLOTS[l.current]; anim.shown = l.current; }
    const m = models[SLOTS[l.current]]; if (!m) return;
    anim.phase += st.moving ? dt * (st.sprinting ? 12 : st.crouch ? 5 : 8) : 0;
    anim.adsT = approach(anim.adsT, st.ads ? 1 : 0, 14, dt);
    anim.sprintT = approach(anim.sprintT, st.sprinting ? 1 : 0, 9, dt);
    anim.crouchT = approach(anim.crouchT, st.crouch ? 1 : 0, 9, dt);
    anim.kick = approach(anim.kick, 0, 18, dt);
    anim.kickRot = approach(anim.kickRot, 0, 14, dt);
    anim.flash = Math.max(0, anim.flash - dt);
    anim.throwT = Math.max(0, anim.throwT - dt);
    // weapon lag behind the camera turning
    const dyaw = st.look.yaw - anim.prevYaw, dpitch = st.look.pitch - anim.prevPitch;
    anim.prevYaw = st.look.yaw; anim.prevPitch = st.look.pitch;
    anim.sway[0] = approach(anim.sway[0], 0, 10, dt) - dyaw * 0.9;
    anim.sway[1] = approach(anim.sway[1], 0, 10, dt) + dpitch * 0.9;
    anim.sway[0] = Math.max(-0.12, Math.min(0.12, anim.sway[0])); anim.sway[1] = Math.max(-0.1, Math.min(0.1, anim.sway[1]));

    const hip = w.view.pos, ads = w.view.ads, t = anim.adsT;
    let x = hip[0] + (ads[0] - hip[0]) * t, y = hip[1] + (ads[1] - hip[1]) * t, z = hip[2] + (ads[2] - hip[2]) * t;
    let rx = 0, ry = 0, rz = 0;
    // walking bob (less when aiming)
    const b = bob(anim.phase, st.speed, st.crouch),motion=getPreferences().reducedMotion?0:getPreferences().cameraShake;b.x*=motion;b.y*=motion;
    x += b.x * (1 - t * 0.85); y += b.y * (1 - t * 0.85);
    // sprint carry: gun drops and turns across the body
    x += -0.1 * anim.sprintT; y += -0.1 * anim.sprintT; rx += 0.5 * anim.sprintT; ry += -0.7 * anim.sprintT; rz += 0.25 * anim.sprintT;
    y += -0.02 * anim.crouchT;
    // weapon sway
    x += anim.sway[0] * 0.5; y += anim.sway[1] * 0.4; ry += anim.sway[0] * 0.8; rx += anim.sway[1] * 0.6;
    // recoil: kicks back and tips up
    z += anim.kick * 0.09; rx += anim.kickRot;
    // switching: rises from below
    if (l.switching > 0) { const p = 1 - l.switching / w.draw; y += -0.35 * (1 - p) * (1 - p); rx += -0.6 * (1 - p); }
    // reloading: dips, tilts, then returns (three beats)
    if (l.reloading > 0) {
      const p = 1 - l.reloading / w.reload, curve = p < 0.2 ? p / 0.2 : p > 0.85 ? (1 - p) / 0.15 : 1;
      y += -0.22 * curve; rx += 0.75 * curve; rz += -0.5 * curve; x += -0.05 * curve;
      if (p > 0.45 && p < 0.7) { y += Math.sin((p - 0.45) / 0.25 * Math.PI) * 0.03; }
    }
    // grenade throw: the gun drops out of the way
    if (anim.throwT > 0) { const p = 1 - anim.throwT / 0.55; y += -0.4 * Math.sin(p * Math.PI); rx += -0.5 * Math.sin(p * Math.PI); }
    m.group.position.set(x, y, z); m.group.rotation.set(rx, ry, rz);

    // field of view: aiming zooms, sprinting widens slightly
    const targetFov = st.ads ? w.adsFov : st.sprinting ? 78 : 70;
    anim.fov = approach(anim.fov, targetFov, 12, dt);
    flashLight.intensity = anim.flash > 0 ? 2.5 * (anim.flash / 0.06) : 0;
    // transient effects
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.life -= dt; e.fn?.(e, dt);
      if (e.life <= 0) { e.obj.removeFromParent();e.obj.geometry?.dispose?.();if(e.obj.material)for(const m of (Array.isArray(e.obj.material)?e.obj.material:[e.obj.material]))m.dispose?.();effects.splice(i,1); }
    }
    return {fov: anim.fov, adsT: anim.adsT};
  }

  function onFire(id, recoilPitch) {
    anim.kick = getPreferences().reducedMotion?0:getPreferences().cameraShake; anim.kickRot = (getPreferences().reducedMotion?0:getPreferences().cameraShake)*Math.min(0.12, 0.04 + recoilPitch * 4); anim.flash = 0.06;
    sfx.play(WEAPONS[id].sound, {volume: 0.55, rate: id === 'scatter' ? 0.9 : 1});
    // muzzle flash: a small additive star at the barrel, parented to the viewmodel so it follows the weapon
    const m = models[id]; if (!m) return;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshBasicMaterial({color: '#ffe3a1', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}));
    f.position.copy(m.muzzle); f.position.z -= 0.03; f.rotation.z = Math.random() * 6; m.group.add(f);
    effects.push({obj: f, life: 0.05, fn: e => { e.obj.scale.setScalar(0.8 + Math.random() * 0.5); }});
  }

  function tracer(from, to, color = '#ffe0a0') {
    const dir = to.clone().sub(from), len = dir.length();
    if (len < 0.5) return;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 4);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.9, depthWrite: false}));
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(mesh);
    effects.push({obj: mesh, life: 0.09, fn: e => { e.obj.material.opacity = Math.max(0, e.life / 0.09) * 0.9; }});
  }

  function impact(point, color = '#ffd29a') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.9, depthWrite: false}));
    s.position.copy(point); scene.add(s);
    effects.push({obj: s, life: 0.18, fn: e => { const k = 1 - e.life / 0.18; e.obj.scale.setScalar(1 + k * 2.2); e.obj.material.opacity = 0.9 * (1 - k); }});
  }

  // ---- Grenades in the world
  function spawnGrenadeMesh() {
    let mesh;
    if (grenadeModel) { mesh = grenadeModel.clone(true); mesh.scale.setScalar(1.4); }
    else mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({color: '#7a8f6a'}));
    scene.add(mesh); return mesh;
  }
  function explosion(point) {
    sfx.play('explosion', {volume: 0.8});
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({color: '#ffb35a', transparent: true, opacity: 0.85, depthWrite: false}));
    s.position.copy(point); scene.add(s);
    const light = new THREE.PointLight('#ffb35a', 40, GRENADE.radius * 3, 2); light.position.copy(point); scene.add(light);
    effects.push({obj: s, life: 0.45, fn: e => { const k = 1 - e.life / 0.45; e.obj.scale.setScalar(0.5 + k * GRENADE.radius * 0.6); e.obj.material.opacity = 0.85 * (1 - k);
      light.intensity = 40 * (1 - k); if (e.life <= 0.02) light.removeFromParent(); }});
  }
  const throwAnim = () => { anim.throwT = 0.55; };

  // ---- HUD
  const hud = document.createElement('div');
  hud.id = 'fps-hud'; hud.hidden = true;
  hud.innerHTML = `
    <div class="fps-cross" aria-hidden="true"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i><i class="hit"></i></div>
    <div class="fps-ring fps-reload" hidden><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"></circle><path></path></svg><span>RELOADING</span></div>
    <div class="fps-ring fps-capture" hidden><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"></circle><path></path></svg><span class="cap-label">CAPTURE</span></div>
    <div class="fps-cursor" hidden>CURSOR MODE · TAB TO LOOK</div>
    <div class="fps-vitals"><div class="bar shield"><i></i><b>SHIELD</b><em></em></div><div class="bar health"><i></i><b>HEALTH</b><em></em></div><div class="stance"></div></div>
    <div class="fps-ammo"><div class="wname"></div><div class="count"><b class="mag"></b><span class="res"></span></div><div class="slots"></div><div class="gren"></div></div>
    <div class="fps-help">LMB FIRE · RMB AIM · MMB GRENADE · WHEEL SWITCH · R RELOAD · SHIFT SPRINT · C CROUCH · HOLD E CAPTURE · TAB CURSOR</div>`;
  document.body.appendChild(hud);
  const q = s => hud.querySelector(s);
  const el = {cross: q('.fps-cross'), reload: q('.fps-reload'), capture: q('.fps-capture'), cursor: q('.fps-cursor'), shield: q('.shield'), health: q('.health'),
    stance: q('.stance'), wname: q('.wname'), mag: q('.mag'), res: q('.res'), slots: q('.slots'), gren: q('.gren'), hitT: 0};
  const arc = (path, frac) => { const a = Math.max(0, Math.min(0.9999, frac)) * Math.PI * 2, r = 19, x = 22 + r * Math.sin(a), y = 22 - r * Math.cos(a);
    path.setAttribute('d', frac <= 0 ? '' : `M22 3 A19 19 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`); };

  function hitMarker(kill = false) { el.cross.classList.add('hit-on'); el.cross.classList.toggle('kill', kill); clearTimeout(el.hitT); el.hitT = setTimeout(() => el.cross.classList.remove('hit-on'), 130); sfx.play('hitmarker', {volume: 0.5}); }

  // m = {visible, loadout, vitals, spread, ads, sprinting, crouch, cursor, capture:null|{frac,label}, carrying}
  function updateHud(m) {
    hud.hidden = !m.visible; if (!m.visible) return;
    const l = m.loadout, w = currentWeapon(l), g = currentGun(l);
    el.cursor.hidden = !m.cursor;
    const gap = 6 + m.spread * 520;                 // spread in radians -> pixels of crosshair gap
    el.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    el.cross.classList.toggle('ads', !!m.ads);
    el.wname.textContent = w.name;
    el.mag.textContent = g.mag; el.mag.classList.toggle('low', g.mag <= Math.ceil(w.mag * 0.25));
    el.res.textContent = '/ ' + g.reserve;
    el.slots.innerHTML = SLOTS.map((id, i) => `<span class="${i === l.current ? 'on' : ''}"><b>${i + 1}</b>${esc(WEAPONS[id].name.split(' ')[0])}</span>`).join('');
    el.gren.innerHTML = '●'.repeat(l.grenades) + '<small> GRENADE</small>';
    const v = m.vitals;
    el.shield.style.setProperty('--f', (v.shield / v.maxShield * 100).toFixed(1) + '%'); el.shield.querySelector('em').textContent = Math.ceil(v.shield);
    el.health.style.setProperty('--f', (v.health / v.maxHealth * 100).toFixed(1) + '%'); el.health.querySelector('em').textContent = Math.ceil(v.health);
    el.shield.classList.toggle('down', v.shield <= 0); el.health.classList.toggle('low', v.health < 35);
    el.stance.textContent = [m.sprinting ? 'SPRINT' : '', m.crouch ? 'CROUCH' : '', m.ads ? 'AIM' : '', m.carrying ? 'CARRYING FLAG' : ''].filter(Boolean).join(' · ');
    el.reload.hidden = !(l.reloading > 0);
    if (l.reloading > 0) arc(el.reload.querySelector('path'), 1 - l.reloading / w.reload);
    el.capture.hidden = !m.capture;
    if (m.capture) { arc(el.capture.querySelector('path'), m.capture.frac); el.capture.querySelector('.cap-label').textContent = m.capture.label || 'CAPTURE'; }
  }

  return {root, models, loadModels, update, onFire, tracer, impact, spawnGrenadeMesh, explosion, throwAnim, hitMarker, updateHud, muzzleWorld,
    setVisible(v) { root.visible = v; hud.hidden = !v; }, get fov() { return anim.fov; }, sfx};
}
