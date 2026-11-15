// Campaign crew bots: Chip (engineer), Barbara (science) and Fernando (specialist) walk the spacecraft, work their
// room consoles and respond to the mission state - a tripped circuit, EVA preparation, securing the lab for return.
// They use the same rigged characters as the player and the multiplayer crews.
import * as THREE from './vendor/three.module.js';
import {attachSkin} from './characters.js';
import {stateFor} from './locomotion.js';

const CREW = [
  {name: 'CHIP', role: 'ENGINEER', species: 1, color: '#f5be76', rooms: ['engine_bay', 'power_room'], start: ['power_room', 0.8]},
  {name: 'BARBARA', role: 'SCIENCE', species: 2, color: '#f7ce59', rooms: ['lab', 'life_support'], start: ['lab', -0.6]},
  {name: 'FERNANDO', role: 'SPECIALIST', species: 3, color: '#f7a28f', rooms: ['workshop', 'airlock', 'life_support'], start: ['workshop', 0.6]},
];
const SPEED = 2.3;

function label(text, sub, color) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 92; const g = c.getContext('2d');
  const draw = (t, s) => {
    g.clearRect(0, 0, 320, 92);
    g.fillStyle = 'rgba(8,14,26,.86)'; g.fillRect(4, 4, 312, 84); g.fillStyle = color; g.fillRect(4, 4, 8, 84);
    g.fillStyle = '#ffffff'; g.font = '700 28px sans-serif'; g.fillText(t, 24, 40);
    g.fillStyle = '#cfe0f5'; g.font = '600 21px sans-serif'; g.fillText(s.slice(0, 26), 24, 74);
  };
  draw(text, sub);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, depthTest: false}));
  sprite.scale.set(1.25, 0.36, 1); sprite.position.y = 2.75; sprite.renderOrder = 10;
  let last = sub;
  return {sprite, set(s) { if (s !== last) { last = s; draw(text, s); tex.needsUpdate = true; } }, dispose() { tex.dispose(); sprite.material.dispose(); }};
}

export function createCampaignCrew(scene, layout, {getState = () => null, crewAct = () => false, playerPosition = () => ({x: 0, z: 0})} = {}) {
  const roomOf = name => layout.modules.find(m => m.name === name);
  // Work spots: stand 0.75 m in front of each wall prop, facing it.
  const spots = layout.props.map(p => {
    const [x, , z] = p.position, inward = Math.abs(x) > 1 ? -Math.sign(x) : 0, along = inward ? 0 : (z > (roomOf(p.module)?.center[2] ?? z) ? -1 : 1);
    return {room: p.module, task: p.task, x: x + inward * 0.75, z: z + along * 0.75, face: Math.atan2(x - (x + inward * 0.75), z - (z + along * 0.75))};
  });
  const spot = (room, task) => spots.find(s => s.room === room && (!task || s.task === task)) || {room, x: roomOf(room)?.center[0] || 0, z: roomOf(room)?.center[2] || 0, face: 0};
  const bots = CREW.map(def => {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const placeholder = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshToonMaterial({color: def.color}));
    placeholder.position.y = 0.9; body.add(placeholder);
    const r = roomOf(def.start[0]); group.position.set(def.start[1], 0, r ? r.center[2] : 0);
    scene.add(group);
    const tag = label(def.name + ' · ' + def.role, 'Starting shift', def.color); group.add(tag.sprite);
    const bot = {def, group, body, tag, path: [], target: null, wait: 1 + Math.random() * 2, task: 'Starting shift', job: null, speed: 0, placeholder};
    attachSkin(bot, def.species, {height: 1.9}).catch(() => {});
    return bot;
  });

  // Route along the centre line through the hatches; the airlock is reached from the workshop side door.
  function routeTo(bot, s) {
    const p = bot.group.position, path = [];
    const inAirlock = z => false;
    void inAirlock;
    const fromAir = p.x < -2.6, toAir = s.room === 'airlock';
    const airZ = roomOf('airlock')?.center[2] ?? 19.4;
    if (fromAir) { path.push({x: -1.6, z: airZ}, {x: 0, z: airZ}); }
    else path.push({x: 0, z: p.z});
    if (toAir) path.push({x: 0, z: airZ}, {x: -1.6, z: airZ}, {x: s.x, z: s.z});
    else path.push({x: 0, z: s.z}, {x: s.x, z: s.z});
    bot.path = path; bot.target = s;
  }
  function assign(bot, s, task, job = null, work = 5) { routeTo(bot, s); bot.task = task; bot.job = job; bot.work = work; bot.tag.set('→ ' + task); }
  function routine(bot) {
    const rooms = bot.def.rooms, room = rooms[Math.floor(Math.random() * rooms.length)];
    const options = spots.filter(s => s.room === room);
    const s = options[Math.floor(Math.random() * options.length)] || spot(room);
    const verb = {engine_bay: 'Checking the engines', power_room: 'Balancing power buses', lab: 'Running instrument checks', life_support: 'Servicing CO₂ filters', workshop: 'Sorting spare parts', airlock: 'Inspecting suits'}[room] || 'On rounds';
    assign(bot, s, verb, null, 4 + Math.random() * 4);
  }
  // React to the mission: faults first, then phase-specific preparation, otherwise routine rounds.
  function plan(bot) {
    const s = getState(); if (!s) return routine(bot);
    const name = bot.def.name[0] + bot.def.name.slice(1).toLowerCase();
    if (bot.def.name === 'CHIP' && s.fault) {
      if (!s.isolated) return assign(bot, spot('power_room', null), 'Isolating tripped circuit', 'isolate', 6);
      if (!s.spare) return assign(bot, spot('workshop', null), 'Fetching a spare fuse', 'spare', 4);
      return assign(bot, spot('power_room', null), 'Standing by for fuse swap', null, 6);
    }
    if (bot.def.name === 'FERNANDO' && s.phase === 'prepare') {
      if (!s.tool) return assign(bot, spot('workshop', null), 'Preparing the instrument', 'tool', 7);
      if (!s.tether) return assign(bot, spot('airlock'), 'Checking the EVA tether', 'tether', 6);
    }
    if (bot.def.name === 'BARBARA' && s.phase === 'return' && !s.done?.includes('secure')) return assign(bot, spot('lab', null), 'Securing the laboratory', 'secure', 8);
    if (bot.def.name === 'BARBARA' && (s.phase === 'science' || s.observing)) return assign(bot, spot('lab', null), s.observing ? 'Watching the data stream' : 'Calibration assist', null, 6);
    void name;
    routine(bot);
  }
  const tmp = new THREE.Vector3();
  function tick(dt, camera) {
    const st = getState();
    for (const bot of bots) {
      const g = bot.group, p = g.position;
      // Urgent faults interrupt routine work.
      if (st?.fault && bot.def.name === 'CHIP' && !bot.job && bot.task.indexOf('circuit') < 0 && !st.isolated) { bot.wait = 0; bot.path = []; }
      let moving = false;
      if (bot.path.length) {
        const n = bot.path[0], dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.08) bot.path.shift();
        else {
          const step = Math.min(d, SPEED * dt); p.x += dx / d * step; p.z += dz / d * step; moving = true;
          const want = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
          g.rotation.y += diff * Math.min(1, dt * 10);
        }
        if (!bot.path.length) { bot.wait = bot.work || 5; bot.tag.set(bot.task); }
      } else if (bot.target) {
        const diff = Math.atan2(Math.sin(bot.target.face - g.rotation.y), Math.cos(bot.target.face - g.rotation.y));
        g.rotation.y += diff * Math.min(1, dt * 6);
        bot.wait -= dt;
        if (bot.wait <= 0) {
          if (bot.job) { const ok = crewAct(bot.job, bot.def.name[0] + bot.def.name.slice(1).toLowerCase()); bot.job = null; if (ok) bot.tag.set('✓ ' + bot.task); }
          bot.target = null; bot.wait = 0.6 + Math.random();
        }
      } else { bot.wait -= dt; if (bot.wait <= 0) plan(bot); }
      bot.speed += ((moving ? SPEED : 0) - bot.speed) * Math.min(1, dt * 10);
      const working = !moving && !!bot.target && bot.wait > 0;
      if (bot.skin) {
        bot.skin.setState(stateFor(bot.speed, {interacting: working}), bot.speed);
        bot.skin.mixer.update(dt);
        bot.skin.ground?.(dt, {grounded: true, speed: bot.speed, floorAt: () => 0});
        if (bot.skin.setLook) {
          // Glance at the player when they are close; otherwise look where they are going.
          const pl = playerPosition(); const dx = pl.x - p.x, dz = pl.z - p.z, near = Math.hypot(dx, dz) < 3.2;
          bot.skin.setLook(near ? Math.atan2(Math.sin(Math.atan2(dx, dz) - g.rotation.y), Math.cos(Math.atan2(dx, dz) - g.rotation.y)) : 0, 0);
        }
      }
      // Name tags only for nearby crew so they never stack up across rooms.
      if (camera) bot.tag.sprite.visible = camera.position.distanceTo(tmp.set(p.x, 1.6, p.z)) < 9;
    }
  }
  function dispose() { for (const b of bots) { b.skin?.dispose(); b.tag.dispose(); b.placeholder.geometry.dispose(); b.placeholder.material.dispose(); b.group.removeFromParent(); } }
  return {bots, tick, dispose, setVisible(v) { bots.forEach(b => (b.group.visible = v)); }};
}
