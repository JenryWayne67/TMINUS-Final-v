// Campaign launch cinematic: the spacecraft the player just configured is stacked on a rocket booster,
// counts down, lifts off, drops its side boosters and core stage, and reaches orbit where the solar wings open.
// Owns its own renderer on a private canvas; resolves when finished or skipped. Presentation only.
import * as THREE from './vendor/three.module.js';
import {createSpacecraft} from './spacecraft-model.js';

const toonCache = new Map();
function toon(color, emissive = 0) {
  const key = color + emissive;
  if (!toonCache.has(key)) toonCache.set(key, new THREE.MeshToonMaterial({color, emissive: color, emissiveIntensity: emissive}));
  return toonCache.get(key);
}
function mesh(parent, geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; }
function cyl(parent, r1, r2, h, color, x = 0, y = 0, z = 0, sides = 24) { return mesh(parent, new THREE.CylinderGeometry(r1, r2, h, sides), toon(color), x, y, z); }
function box(parent, w, h, d, color, x = 0, y = 0, z = 0) { return mesh(parent, new THREE.BoxGeometry(w, h, d), toon(color), x, y, z); }

// Same faceted, white-hull + livery style as the multiplayer spacecraft.
function buildBooster(livery = '#f6a052') {
  const stack = new THREE.Group();
  const core = new THREE.Group(); stack.add(core);
  cyl(core, 1.55, 1.55, 15, '#eef1f4', 0, 7.5, 0);
  for (const y of [2.2, 12.6]) cyl(core, 1.57, 1.57, 0.5, livery, 0, y, 0);
  cyl(core, 1.57, 1.57, 0.25, '#2b3245', 0, 7.5, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const fin = box(core, 0.12, 2.2, 1.4, '#2b3245', Math.cos(a) * 1.7, 1.1, Math.sin(a) * 1.7); fin.rotation.y = -a; }
  const bells = new THREE.Group(); core.add(bells);
  for (const [x, z] of [[0, 0], [0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]]) cyl(bells, 0.3, 0.55, 0.9, '#3a3f52', x, -0.45, z, 14);
  const interstage = cyl(core, 1.2, 1.55, 1.4, '#c9d0d8', 0, 15.7, 0);
  interstage.userData.top = 16.4;
  const sides = [];
  for (const sign of [-1, 1]) {
    const sb = new THREE.Group(); sb.position.set(sign * 2.45, 0, 0); stack.add(sb);
    cyl(sb, 0.85, 0.85, 10.5, '#e7ebef', 0, 5.25, 0, 18);
    cyl(sb, 0.86, 0.86, 0.4, livery, 0, 8.6, 0, 18);
    mesh(sb, new THREE.ConeGeometry(0.85, 2.0, 18), toon('#e7ebef'), 0, 11.5, 0);
    cyl(sb, 0.35, 0.6, 0.8, '#3a3f52', 0, -0.4, 0, 12);
    box(sb, 0.3, 0.35, 0.9, '#8a91ad', -sign * 0.95, 3, 0);
    box(sb, 0.3, 0.35, 0.9, '#8a91ad', -sign * 0.95, 8, 0);
    sides.push(sb);
  }
  return {stack, core, sides, top: 16.4};
}

function makeFlame(length = 6, radius = 0.9, color = '#ffb347') {
  const g = new THREE.Group();
  const outer = mesh(g, new THREE.ConeGeometry(radius, length, 16, 1, true), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending}));
  outer.rotation.x = Math.PI; outer.position.y = -length / 2;
  const inner = mesh(g, new THREE.ConeGeometry(radius * 0.5, length * 0.6, 12, 1, true), new THREE.MeshBasicMaterial({color: '#fff4d1', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending}));
  inner.rotation.x = Math.PI; inner.position.y = -length * 0.3;
  g.visible = false;
  return g;
}

function buildPad() {
  const pad = new THREE.Group();
  cyl(pad, 14, 15, 1.2, '#59596a', 0, -0.6, 0, 40);
  cyl(pad, 4.2, 4.2, 0.3, '#3d3d4c', 0, 0.12, 0, 32);
  // Launch tower with two umbilical arms that swing away at T-3.
  const tower = new THREE.Group(); tower.position.set(-6.2, 0, 0); pad.add(tower);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(tower, 0.25, 24, 0.25, '#c8503c', x, 12, z);
  for (let y = 2; y < 24; y += 2.4) { box(tower, 2.0, 0.15, 0.15, '#c8503c', 0, y, -0.9); box(tower, 2.0, 0.15, 0.15, '#c8503c', 0, y, 0.9); box(tower, 0.15, 0.15, 2.0, '#c8503c', -0.9, y, 0); box(tower, 0.15, 0.15, 2.0, '#c8503c', 0.9, y, 0); }
  const arms = [];
  for (const y of [9, 17.5]) { const pivot = new THREE.Group(); pivot.position.set(0.9, y, 0); tower.add(pivot); box(pivot, 3.6, 0.35, 0.6, '#8a91ad', 1.8, 0, 0); arms.push(pivot); }
  // Crane gantry used for stacking the spacecraft on the booster.
  const crane = new THREE.Group(); pad.add(crane);
  box(crane, 0.35, 30, 0.35, '#f4c542', 7, 15, 0);
  box(crane, 12, 0.5, 0.5, '#f4c542', 2, 30, 0);
  const hook = new THREE.Group(); crane.add(hook);
  const cable = box(hook, 0.05, 1, 0.05, '#222', 0, 0, 0);
  return {pad, tower, arms, crane, hook, cable};
}

// Puffs of exhaust/steam that billow and fade.
function createSmoke(scene) {
  const puffs = [], geo = new THREE.IcosahedronGeometry(1, 1);
  return {
    emit(at, color = '#dcd8d2', spread = 3, size = 1.2, up = 1) {
      const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({color, transparent: true, opacity: 0.85}));
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
      m.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      m.userData = {v: new THREE.Vector3((Math.random() - 0.5) * 5, up * (1 + Math.random() * 2), (Math.random() - 0.5) * 5), life: 2.4 + Math.random()};
      scene.add(m); puffs.push(m);
    },
    tick(dt) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const m = puffs[i]; m.userData.life -= dt;
        m.position.addScaledVector(m.userData.v, dt); m.userData.v.multiplyScalar(1 - dt * 0.6);
        m.scale.multiplyScalar(1 + dt * 0.55); m.material.opacity = Math.max(0, Math.min(0.85, m.userData.life / 2));
        if (m.userData.life <= 0) { m.removeFromParent(); m.material.dispose(); puffs.splice(i, 1); }
      }
    },
    dispose() { for (const m of puffs) { m.removeFromParent(); m.material.dispose(); } puffs.length = 0; geo.dispose(); }
  };
}

const BEATS = [
  {t: 0, label: 'INTEGRATION', title: 'STACKING THE SPACECRAFT', copy: d => `${d.mass} kg spacecraft lowered onto the launcher · capacity 850 kg`},
  {t: 5, label: 'COUNTDOWN', title: 'T−5', copy: () => 'Umbilicals retracting · propellant topped off'},
  {t: 9, label: 'LIFTOFF', title: 'LIFTOFF', copy: d => `${d.thrustNote}`},
  {t: 14.5, label: 'STAGING', title: 'BOOSTER SEPARATION', copy: () => 'Side boosters spent · core stage continues'},
  {t: 17.5, label: 'STAGING', title: 'CORE STAGE SEPARATION', copy: () => 'Spacecraft flying free on its own engine'},
  {t: 20, label: 'ORBIT', title: 'ORBIT INSERTION', copy: d => `${d.wingNote} · ${d.radioNote}`},
];
export const BUILD_DURATION = 11;
export const LAUNCH_DURATION = 24;

export function playLaunchCinematic(container, {design = {}, evaluation = null, mission = null, skippable = true} = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div'); wrap.className = 'cp-launch';
    wrap.innerHTML = `<canvas></canvas><div class="cp-launch-hud"><small></small><b></b><span></span><div class="cp-launch-bar"><i></i></div></div>${skippable ? '<button class="cp-launch-skip" type="button">SKIP ▸▸</button>' : ''}<div class="cp-launch-count" hidden></div>`;
    container.append(wrap);
    const canvas = wrap.querySelector('canvas');
    const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const sky = new THREE.Color('#9fc4e8'), space = new THREE.Color('#050914');
    scene.background = sky.clone(); scene.fog = new THREE.Fog('#9fc4e8', 80, 420);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
    scene.add(new THREE.HemisphereLight('#f7f0e6', '#4b4a5c', 1.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(40, 80, 30); scene.add(sun);
    const ground = mesh(scene, new THREE.CircleGeometry(900, 48), toon('#6f8a5c'), 0, -1.2, 0); ground.rotation.x = -Math.PI / 2;
    const ocean = mesh(scene, new THREE.CircleGeometry(900, 48, 0, Math.PI * 0.7), toon('#3f78b5'), 0, -1.15, 0); ocean.rotation.x = -Math.PI / 2; ocean.position.z = -120;
    const {pad, arms, crane, hook, cable} = buildPad(); scene.add(pad);
    const evalData = evaluation || {mass: 640, parts: {}};
    const livery = '#f6a052';
    const booster = buildBooster(livery); scene.add(booster.stack);
    // The player's spacecraft, carrying the equipment they picked.
    const craftHolder = new THREE.Group(); scene.add(craftHolder);
    const helpers = {THREE, SHIP_SCALE: 1, SHIP_Y: 0,
      material: c => toon(c),
      mesh: (geo, m, parent, x = 0, y = 0, z = 0) => mesh(parent, geo, m, x, y, z),
      sphere: (r, c, parent, x = 0, y = 0, z = 0, detail = 16) => mesh(parent, new THREE.SphereGeometry(r, detail, 12), toon(c), x, y, z),
      cylinder: (rt, rb, h, c, parent, x = 0, y = 0, z = 0, n = 16) => cyl(parent, rt, rb, h, c, x, y, z, n),
      box: (w, h, d, c, parent, x = 0, y = 0, z = 0) => box(parent, w, h, d, c, x, y, z),
      glow: (w, h, d, c, parent, x = 0, y = 0, z = 0) => mesh(parent, new THREE.BoxGeometry(w, h, d), toon(c, 0.5), x, y, z)};
    let craft = null, craftFlames = [];
    try {
      const built = createSpacecraft(helpers, craftHolder); craft = built.ship; craftFlames = built.engineFlames || [];
      // Stand the spacecraft nose-up on the interstage: the model's nose points down -Z.
      const s = 0.75; craft.scale.setScalar(s); craft.rotation.set(Math.PI / 2, 0, 0); craft.position.set(0, 2.5 * s, -1.4 * s);
    } catch { craft = new THREE.Group(); craftHolder.add(craft); cyl(craft, 1.2, 1.2, 3.4, '#eef1f4', 0, 1.7, 0); }
    craftFlames.forEach(f => (f.visible = false));
    // Robotic assembly (same idea as FAST ASSEMBLY in the crew mode): modules arrive one by one on a horizontal jig.
    const uprightPose = {rx: craft.rotation.x, pos: craft.position.clone()};
    const parts = craft.children.map(o => ({o, home: o.position.clone()}));
    const jig = new THREE.Group(); jig.position.set(16, 0, 8); scene.add(jig);
    box(jig, 7, 0.5, 2.2, '#4a4f66', 0, 0.25, 0); for (const x of [-3, 0, 3]) box(jig, 0.3, 1.0, 1.6, '#f4c542', x, 0.9, 0);
    const arm = new THREE.Group(); arm.position.set(0, 0, -3.4); jig.add(arm);
    cyl(arm, 0.6, 0.8, 0.6, '#3a3f52', 0, 0.3, 0); const shoulder = new THREE.Group(); shoulder.position.y = 0.7; arm.add(shoulder);
    const boom = box(shoulder, 0.35, 0.35, 4.2, '#f6a052', 0, 0, 2.1); const tip = mesh(shoulder, new THREE.SphereGeometry(0.28, 12, 8), toon('#8ff0d0', 0.6), 0, 0, 4.2); void boom;
    // Equipment that shows the trade-offs: expanded wings are longer, high-gain antenna is a bigger dish.
    const wings = new THREE.Group(); craftHolder.add(wings);
    const wingLen = design.array === 'expanded' ? 5.2 : 3.4;
    const wingPanels = [];
    for (const sign of [-1, 1]) { const pivot = new THREE.Group(); pivot.position.set(sign * 1.25, 1.6, 0); wings.add(pivot); const panel = box(pivot, wingLen, 0.06, 1.4, '#2c5581', sign * wingLen / 2, 0, 0); for (let i = 1; i < 5; i++) box(panel, 0.04, 0.08, 1.42, '#7eacc3', -wingLen / 2 + i * wingLen / 5, 0, 0); pivot.scale.x = 0.05; wingPanels.push(pivot); }
    const dishR = design.radio === 'highgain' ? 0.95 : 0.55;
    const dish = mesh(craftHolder, new THREE.SphereGeometry(dishR, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), toon('#d9dee6'), 0, 3.3, 0.6); dish.rotation.x = Math.PI * 0.85; dish.scale.setScalar(0.01);
    const fairing = [];
    for (const sign of [-1, 1]) { const half = mesh(craftHolder, new THREE.CylinderGeometry(1.25, 1.55, 4.6, 24, 1, true, sign > 0 ? 0 : Math.PI, Math.PI), new THREE.MeshToonMaterial({color: '#f2f4f7', side: THREE.DoubleSide}), 0, 2.2, 0); const nose = mesh(half, new THREE.ConeGeometry(1.25, 2.2, 24, 1, true, sign > 0 ? 0 : Math.PI, Math.PI), new THREE.MeshToonMaterial({color: '#f2f4f7', side: THREE.DoubleSide}), 0, 3.4, 0); nose.userData.n = 1; fairing.push(half); }
    fairing.forEach(f => (f.visible = false));
    const coreFlame = makeFlame(9, 1.4); booster.core.add(coreFlame); coreFlame.position.y = -0.9;
    const sideFlames = booster.sides.map(sb => { const f = makeFlame(7, 0.8); sb.add(f); f.position.y = -0.8; return f; });
    const craftFlame = makeFlame(3.5, 0.5, '#9fd8ff'); craftHolder.add(craftFlame); craftFlame.position.y = -0.4;
    const smoke = createSmoke(scene);
    // Earth seen from altitude and a starfield, faded in during the climb.
    const earth = mesh(scene, new THREE.SphereGeometry(900, 48, 32), new THREE.MeshToonMaterial({color: '#2f6fb3'}), 0, -1000, 0); earth.visible = false;
    for (let i = 0; i < 60; i++) { const a = i * 2.39996, r = Math.sqrt(i / 60) * 850; const land = mesh(earth, new THREE.CircleGeometry(40 + (i % 5) * 18, 7), toon(i % 3 ? '#5f8d4e' : '#e9eef2'), Math.cos(a) * r, 0, Math.sin(a) * r); land.position.y = Math.sqrt(Math.max(0, 900 * 900 - r * r)) + 1; land.rotation.x = -Math.PI / 2; }
    const starGeo = new THREE.BufferGeometry(), sv = [];
    for (let i = 0; i < 900; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); sv.push(Math.cos(t) * r * 2500, u * 2500, Math.sin(t) * r * 2500); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0}));
    scene.add(stars);

    const data = {
      mass: Math.round(evalData.mass || 640),
      thrustNote: `Thrust beats ${Math.round(evalData.mass || 640)} kg of spacecraft plus the launcher's own weight`,
      wingNote: design.array === 'expanded' ? 'Expanded solar wings open · 2600 W' : 'Standard solar wings open · 1800 W',
      radioNote: design.radio === 'highgain' ? 'High-gain dish deployed' : 'Standard antenna deployed',
    };
    const hud = {small: wrap.querySelector('.cp-launch-hud small'), b: wrap.querySelector('.cp-launch-hud b'), span: wrap.querySelector('.cp-launch-hud span'), bar: wrap.querySelector('.cp-launch-bar i'), count: wrap.querySelector('.cp-launch-count')};
    let beat = -1, clock = 0, last = performance.now(), done = false, raf = 0, buildBeat = false, buildDone = false;
    const boosterDrop = booster.sides.map(() => ({v: new THREE.Vector3(), spin: 0})), coreDrop = {v: new THREE.Vector3()};
    let detachedSides = false, detachedCore = false, fairingOff = false;
    const craftBase = booster.top;    // spacecraft sits on the interstage

    function resize() { const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    resize(); addEventListener('resize', resize);

    function finish() {
      if (done) return; done = true; cancelAnimationFrame(raf);
      removeEventListener('resize', resize); removeEventListener('keydown', onKey, true); removeEventListener('keydown', onDown); removeEventListener('keyup', onUp);
      wrap.classList.add('fade');
      setTimeout(() => {
        smoke.dispose();
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !toonCache.has(o.material)) for (const m of [o.material].flat()) m.dispose?.(); });
        renderer.dispose(); renderer.forceContextLoss?.(); wrap.remove(); resolve();
      }, 450);
    }
    function onKey(e) { if (skippable && ['Escape', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); finish(); } }
    addEventListener('keydown', onKey, true);
    wrap.querySelector('.cp-launch-skip')?.addEventListener('click', finish);

    const tmp = new THREE.Vector3(), look = new THREE.Vector3();
    // ---- Build bay gameplay: buy each chosen piece at the shop kiosk, then bolt it onto the jig. ----
    const shop = new THREE.Group(); shop.position.set(16, 0, -6); scene.add(shop);
    box(shop, 6, 2.6, 0.4, '#2b3245', 0, 1.3, -1.2); box(shop, 6.4, 0.3, 1.6, '#f6a052', 0, 2.75, -0.6);
    box(shop, 5, 0.9, 1.2, '#565c7a', 0, 0.45, 0.2);
    const shopSign = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#0b1220'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ffd27a'; g.font = '800 38px sans-serif'; g.textAlign = 'center'; g.fillText('PARTS SHOP', 128, 46); const m = mesh(shop, new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c)}), 0, 3.4, -0.58); return m; })(); void shopSign;
    const P = evalData.parts || {};
    const items = [
      {key: 'battery', part: P.battery, make: g => { box(g, 0.9, 0.6, 0.7, '#3b4058', 0, 0, 0); box(g, 0.92, 0.08, 0.5, '#7dffb5', 0, 0.2, 0, ); }},
      {key: 'array', part: P.array, make: g => { box(g, 1.4, 0.15, 0.9, '#2c5581', 0, 0, 0); }},
      {key: 'instrument', part: P.instrument, make: g => { cyl(g, 0.35, 0.45, 0.9, '#d5dbe4', 0, 0, 0, 16); cyl(g, 0.25, 0.25, 0.1, '#8ff0d0', 0, 0.5, 0, 16); }},
      {key: 'radio', part: P.radio, make: g => { mesh(g, new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), toon('#d9dee6'), 0, 0, 0).rotation.x = Math.PI; }},
    ].filter(i => i.part);
    const mountAt = [[-1.6, 1.4, 1.3], [0, 2.2, 0], [1.6, 1.4, 1.3], [0.4, 2.3, -1.6]];
    items.forEach((it, i) => { it.crate = new THREE.Group(); it.make(it.crate); it.crate.position.set(-1.8 + i * 1.2, 1.25, 0.2); shop.add(it.crate); it.mount = new THREE.Vector3(...mountAt[i % 4]); it.bolt = 0; it.state = 'shop'; });
    let budgetLeft = evalData.budget ?? 100, stepIdx = 0, frameClock = 0, raiseClock = -1, holdE = false, deliverT = 0;
    const onDown = e => { if (e.key === 'e' || e.key === 'E') { holdE = true; if (!e.repeat) pressE(); } };
    const onUp = e => { if (e.key === 'e' || e.key === 'E') holdE = false; };
    addEventListener('keydown', onDown); addEventListener('keyup', onUp);
    canvas.addEventListener('pointerdown', () => { holdE = true; pressE(); }); addEventListener('pointerup', () => (holdE = false));
    function pressE() {
      const it = items[stepIdx]; if (!it || frameClock < 3 || it.state !== 'shop') return;
      // Buying spends the mission budget; the robot arm carries the piece to the jig.
      budgetLeft -= it.part.cost; it.state = 'deliver'; deliverT = 0;
      const w = it.crate.getWorldPosition(new THREE.Vector3()); shop.remove(it.crate); scene.add(it.crate); it.crate.position.copy(w); it.from = w.clone();
    }
    function buildStep(bt, dt) {
      buildBeat = true;
      fairing.forEach(f => (f.visible = false)); wings.visible = dish.visible = false; hook.visible = cable.visible = false;
      frameClock += dt;
      const it = items[stepIdx];
      if (raiseClock < 0) {
        // 1) Robots frame the structure on the jig (horizontal), module by module.
        craftHolder.position.set(jig.position.x, 1.2, jig.position.z); craft.rotation.set(0, Math.PI / 2, 0); craft.position.set(0, 0.2, 0);
        const per = 3 / Math.max(1, parts.length);
        parts.forEach((p, i) => { const k = (frameClock - i * per) / per; p.o.visible = k > 0; const e = Math.min(1, Math.max(0, k)); p.o.position.copy(p.home); p.o.position.y += (1 - (1 - Math.pow(1 - e, 3))) * 5; if (k > 0.6 && k < 0.6 + dt / per * 1.5) smoke.emit(p.o.getWorldPosition(tmp), '#ffb347', 0.5, 0.1, 2); });
        let msg;
        if (frameClock < 3) msg = ['STRUCTURE', 'ROBOTS FRAMING THE HULL', 'Structure and propulsion modules arriving'];
        else if (!it) { raiseClock = 0; msg = ['ASSEMBLY', 'SPACECRAFT COMPLETE', 'Raising to vertical']; }
        else if (it.state === 'shop') { msg = ['PARTS SHOP · BUDGET ' + budgetLeft, 'PRESS E · BUY ' + it.part.name.toUpperCase(), `${it.part.cost} credits · ${it.part.mass} kg${it.part.watts ? ' · ' + it.part.watts + ' W' : ''}${it.part.wh ? ' · ' + it.part.wh + ' Wh' : ''}`]; it.crate.rotation.y += dt; it.crate.position.y = 1.25 + Math.sin(frameClock * 3) * 0.06; }
        else if (it.state === 'deliver') {
          deliverT += dt / 1.1; const k = Math.min(1, deliverT), target = jig.localToWorld(it.mount.clone());
          it.crate.position.lerpVectors(it.from, target, k); it.crate.position.y += Math.sin(k * Math.PI) * 3; shoulder.lookAt(it.crate.position);
          if (k >= 1) it.state = 'bolt';
          msg = ['DELIVERY', 'ROBOT ARM PLACING ' + it.part.name.toUpperCase(), 'Budget left ' + budgetLeft];
        } else if (it.state === 'bolt') {
          if (holdE) { it.bolt = Math.min(1, it.bolt + dt / 1.3); if (Math.random() < dt * 30) smoke.emit(it.crate.getWorldPosition(tmp), '#ffd27a', 0.4, 0.08, 2.5); }
          if (it.bolt >= 1) { it.state = 'done'; stepIdx++; }
          msg = ['HANDS-ON ASSEMBLY', 'HOLD E · BOLT ' + it.part.name.toUpperCase() + ' · ' + Math.round(it.bolt * 100) + '%', 'Fasten it to the spacecraft frame'];
        }
        hud.small.textContent = msg[0]; hud.b.textContent = msg[1]; hud.span.textContent = msg[2];
        const focus = it && it.state === 'shop' ? shop.position : jig.position;
        camera.position.lerp(tmp.set(focus.x + 10, 6.5, focus.z + 9), 1 - Math.exp(-dt * 3)); look.lerp(new THREE.Vector3(focus.x, 1.4, focus.z), 1 - Math.exp(-dt * 3)); camera.lookAt(look);
        return false;
      }
      // 2) Tilt upright and crane it over the launcher, matching the stacking shot that follows.
      raiseClock += dt; const k = Math.min(1, raiseClock / 3), e = k * k * (3 - 2 * k);
      items.forEach(i => (i.crate.visible = false));
      parts.forEach(p => { p.o.visible = true; p.o.position.copy(p.home); });
      craft.rotation.set(uprightPose.rx * e, Math.PI / 2 * (1 - e), 0); craft.position.lerpVectors(new THREE.Vector3(0, 0.2, 0), uprightPose.pos, e);
      craftHolder.position.set(jig.position.x * (1 - e), 1.2 + (craftBase + 12 - 1.2) * e, jig.position.z * (1 - e));
      hud.small.textContent = 'ASSEMBLY'; hud.b.textContent = 'RAISING TO VERTICAL'; hud.span.textContent = 'Budget left ' + budgetLeft + ' credits';
      camera.position.set(30, 10 + e * 12, 30); camera.lookAt(craftHolder.position.x, craftHolder.position.y, craftHolder.position.z);
      return k >= 1;
    }
    function frame(now) {
      if (done) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; clock += dt;
      hud.bar.style.width = buildDone ? Math.min(100, (clock - BUILD_DURATION) / LAUNCH_DURATION * 100) + '%' : Math.min(100, (stepIdx / Math.max(1, items.length)) * 100) + '%';
      if (!buildDone) { buildDone = buildStep(clock, dt); smoke.tick(dt); renderer.render(scene, camera); if (!buildDone) return; clock = BUILD_DURATION; }
      if (buildBeat) { buildBeat = false; jig.visible = false; craft.rotation.x = uprightPose.rx; craft.position.copy(uprightPose.pos); parts.forEach(p => { p.o.visible = true; p.o.position.copy(p.home); }); }
      const t = clock - BUILD_DURATION;
      // Beat text.
      let b = 0; for (let i = 0; i < BEATS.length; i++) if (t >= BEATS[i].t) b = i;
      if (b !== beat) { beat = b; hud.small.textContent = BEATS[b].label; hud.b.textContent = BEATS[b].title; hud.span.textContent = BEATS[b].copy(data); }
      // Countdown digits.
      if (t >= 5 && t < 9) { const n = Math.max(0, Math.ceil(9 - t) - 0); hud.count.hidden = false; hud.count.textContent = n > 0 ? 'T−' + n : 'IGNITION'; hud.b.textContent = n > 0 ? 'T−' + n : 'IGNITION'; } else hud.count.hidden = true;

      // 1) Integration: crane lowers the craft onto the booster.
      const lowerK = Math.min(1, t / 4.2), ease = 1 - Math.pow(1 - lowerK, 3);
      let altitude = 0;
      if (t >= 9) { const k = t - 9; altitude = k * k * 1.6 + k * 2; }
      const stackY = altitude;
      booster.stack.position.y = detachedCore ? booster.stack.position.y : stackY;
      if (!detachedSides) booster.sides.forEach(sb => (sb.position.y = 0));
      const craftY = t < 4.2 ? craftBase + 12 * (1 - ease) : craftBase + (detachedCore ? 0 : stackY);
      if (!detachedCore) craftHolder.position.set(0, craftY, 0);
      hook.position.set(0, Math.max(craftY + 4.4, craftBase + 4.4), 0);
      cable.scale.y = Math.max(0.1, 30 - hook.position.y); cable.position.y = cable.scale.y / 2;
      hook.visible = cable.visible = t < 4.6;
      crane.position.x = t < 4.6 ? 0 : Math.min(18, (t - 4.6) * 6);
      fairing.forEach(f => (f.visible = t >= 4.2 && !fairingOff));
      wings.visible = dish.visible = t < 4.2 || fairingOff;   // stowed under the fairing during ascent
      // 2) Countdown: arms swing away, vapour vents.
      if (t > 6) arms.forEach((a, i) => (a.rotation.y = Math.min(Math.PI / 2, (t - 6 - i * 0.3) * 1.2)));
      if (t > 5 && t < 9.5 && Math.random() < dt * 14) smoke.emit(tmp.set((Math.random() - 0.5) * 2.5, 6 + Math.random() * 8, 1.6), '#f4f6f8', 0.5, 0.6, 0.4);
      // 3) Liftoff: engines light, smoke floods the pad.
      const burning = t >= 8.6;
      coreFlame.visible = burning && !detachedCore;
      sideFlames.forEach(f => (f.visible = burning && !detachedSides));
      if (burning) {
        const flick = 0.9 + Math.random() * 0.2; coreFlame.scale.set(flick, 1 + Math.random() * 0.15 + Math.min(1.5, altitude / 60), flick);
        sideFlames.forEach(f => f.scale.set(flick, flick + Math.min(1, altitude / 70), flick));
        if (altitude < 60 && Math.random() < dt * 40) smoke.emit(tmp.set(0, 0.6, 0), '#e6e1da', 7, 2.4, 0.5);
        if (altitude > 2 && altitude < 400 && Math.random() < dt * 18) smoke.emit(tmp.set(0, booster.stack.position.y - 2, 0), '#f0ede8', 1.5, 1.6, -0.3);
      }
      // 4) Side boosters separate and tumble away.
      if (t >= 14.5 && !detachedSides) {
        detachedSides = true;
        booster.sides.forEach((sb, i) => { const world = sb.getWorldPosition(new THREE.Vector3()); booster.stack.remove(sb); scene.add(sb); sb.position.copy(world); boosterDrop[i].v.set((i ? 1 : -1) * 6, 4, 0); boosterDrop[i].spin = (i ? -1 : 1) * 1.2; });
      }
      if (detachedSides) booster.sides.forEach((sb, i) => { boosterDrop[i].v.y -= dt * 14; sb.position.addScaledVector(boosterDrop[i].v, dt); sb.rotation.z += boosterDrop[i].spin * dt; });
      // 5) Fairing and core separation; the spacecraft continues on its own engine.
      if (t >= 17 && !fairingOff) { fairingOff = true; }
      if (t >= 17.5 && !detachedCore) { detachedCore = true; coreDrop.v.set(0, 18, 0); }
      if (detachedCore) {
        coreDrop.v.y -= dt * 16; booster.stack.position.addScaledVector(coreDrop.v, dt); booster.stack.rotation.z += dt * 0.25;
        craftHolder.position.y += dt * (26 + (t - 17.5) * 6);
        craftFlame.visible = t < 21; craftFlames.forEach(f => (f.visible = t < 21));
      }
      // 6) Orbit: wings unfold, dish deploys, sky turns black and Earth curves below.
      const climb = Math.min(1, Math.max(0, (t - 11) / 8));
      scene.background.copy(sky).lerp(space, climb);
      scene.fog.color.copy(scene.background); scene.fog.far = 420 + climb * 4000;
      stars.material.opacity = Math.max(0, (climb - 0.5) * 2);
      earth.visible = climb > 0.35; ground.visible = ocean.visible = pad.visible = climb < 0.6;
      if (earth.visible) earth.position.set(0, craftHolder.position.y - 985 - (1 - climb) * 200, 0);
      if (t >= 20) { const k = Math.min(1, (t - 20) / 2.2); wingPanels.forEach(p => (p.scale.x = 0.05 + 0.95 * k)); dish.scale.setScalar(0.01 + 0.99 * k); }
      // Camera: wide integration shot, ground-level countdown, tracking climb, close orbit beauty pass.
      const cy = detachedCore ? craftHolder.position.y : booster.stack.position.y + 10;
      if (t < 5) { camera.position.set(34 - t * 1.5, 18 + t, 38); look.set(0, 14, 0); }
      else if (t < 9) { camera.position.set(22, 4, 26); look.set(0, 12, 0); }
      else if (t < 14.5) { const k = t - 9; camera.position.set(26 + k * 2, 4 + Math.max(0, cy - 14) * 0.75, 30 + k * 2); look.set(0, cy, 0); }
      else if (t < 20) { const k = t - 14.5; camera.position.set(Math.sin(k * 0.3) * 30, cy + 6, Math.cos(k * 0.3) * 30); look.set(0, cy, 0); }
      else { const k = t - 20; camera.position.set(Math.sin(1.6 + k * 0.25) * 16, craftHolder.position.y + 9, Math.cos(1.6 + k * 0.25) * 16); look.set(0, craftHolder.position.y - 1.5, 0); }
      if (burning && altitude < 40) { camera.position.x += (Math.random() - 0.5) * 0.25; camera.position.y += (Math.random() - 0.5) * 0.25; }
      camera.lookAt(look);
      smoke.tick(dt);
      renderer.render(scene, camera);
      if (t >= LAUNCH_DURATION) finish();
    }
    raf = requestAnimationFrame(frame);
  });
}
