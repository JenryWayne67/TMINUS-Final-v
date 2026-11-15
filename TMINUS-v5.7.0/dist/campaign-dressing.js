// Room dressing for the campaign spacecraft: each 5 m module becomes a recognisable working room instead of an
// empty lit box. Same faceted toon style as the multiplayer cabin. Props hug the walls so the walk grid stays clear.
import * as THREE from './vendor/three.module.js';

const ROOM_STYLE = {
  cockpit: {name: 'FLIGHT DECK', accent: '#6fb2ff', light: '#cfe4ff'},
  lab: {name: 'SCIENCE LAB', accent: '#8ff0d0', light: '#e6fff6'},
  workshop: {name: 'WORKSHOP', accent: '#f4b860', light: '#fff1dc'},
  life_support: {name: 'LIFE SUPPORT', accent: '#7fd6ff', light: '#e2f6ff'},
  power_room: {name: 'POWER ROOM', accent: '#ffd25a', light: '#fff6dc'},
  engine_bay: {name: 'ENGINE BAY', accent: '#ff8a5c', light: '#ffe6da'},
  airlock: {name: 'AIRLOCK', accent: '#ffb347', light: '#fff0dc'},
};

export function dressShip(parent, layout, {owned = [], ownedMaterials = []} = {}) {
  const group = new THREE.Group(); group.name = 'ship-dressing'; parent.add(group);
  const mats = new Map();
  const mat = (color, emissive = 0) => {
    const key = color + ':' + emissive;
    if (!mats.has(key)) { const m = new THREE.MeshToonMaterial({color, emissive: color, emissiveIntensity: emissive}); mats.set(key, m); ownedMaterials.push(m); }
    return mats.get(key);
  };
  const geo = g => { owned.push(g); return g; };
  const box = (p, w, h, d, color, x, y, z, emissive = 0) => { const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), mat(color, emissive)); m.position.set(x, y, z); m.receiveShadow = true; p.add(m); return m; };
  const cyl = (p, r1, r2, h, color, x, y, z, n = 16, emissive = 0) => { const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(r1, r2, h, n)), mat(color, emissive)); m.position.set(x, y, z); p.add(m); return m; };
  const sign = (p, text, color, x, y, z, ry = 0) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, 512, 96); g.fillStyle = color; g.fillRect(0, 0, 14, 96); g.fillRect(0, 88, 512, 8);
    g.fillStyle = '#f2f7ff'; g.font = '700 46px sans-serif'; g.textAlign = 'center'; g.fillText(text, 266, 64);
    const tex = new THREE.CanvasTexture(c); const m = new THREE.MeshBasicMaterial({map: tex}); ownedMaterials.push(m);
    const s = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.1, 0.4)), m); s.position.set(x, y, z); s.rotation.y = ry; p.add(s); return s;
  };
  // Shared window texture: stars with a slice of Earth.
  const wc = document.createElement('canvas'); wc.width = 256; wc.height = 128; const wg = wc.getContext('2d');
  wg.fillStyle = '#040814'; wg.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 90; i++) { wg.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; wg.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); }
  const eg = wg.createRadialGradient(128, 300, 160, 128, 300, 210); eg.addColorStop(0, '#2f6fb3'); eg.addColorStop(0.9, '#5fa0e0'); eg.addColorStop(1, 'rgba(120,180,255,0)');
  wg.fillStyle = eg; wg.beginPath(); wg.arc(128, 300, 210, 0, Math.PI * 2); wg.fill();
  const winTex = new THREE.CanvasTexture(wc); const winMat = new THREE.MeshBasicMaterial({map: winTex}); ownedMaterials.push(winMat);
  const windowPane = (p, w, h, x, y, z, ry) => { const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), winMat); m.position.set(x, y, z); m.rotation.y = ry; p.add(m); box(p, ry ? 0.08 : w + 0.16, h + 0.16, ry ? w + 0.16 : 0.08, '#8a91ad', x - (ry > 0 ? 0.03 : ry < 0 ? -0.03 : 0), y, z - (ry ? 0 : 0.03 * Math.sign(z))); return m; };

  const lights = [];
  for (const room of layout.modules) {
    const st = ROOM_STYLE[room.name] || {name: room.name.toUpperCase(), accent: '#8ff0d0', light: '#e8f4ff'};
    const [cx, , cz] = room.center, [w, h, d] = room.size;
    const zmin = room.zmin ?? cz - d / 2, zmax = room.zmax ?? cz + d / 2, hw = w / 2;
    const r = new THREE.Group(); r.name = 'room-' + room.name; group.add(r);
    // Deck plating, walkway stripe and kick plates.
    box(r, w - 0.1, 0.03, d - 0.1, '#2f3347', cx, 0.015, cz);
    box(r, 1.1, 0.035, d - 0.3, '#3d4462', cx, 0.03, cz);
    for (let z = zmin + 0.6; z < zmax - 0.3; z += 1.0) box(r, 1.2, 0.04, 0.06, st.accent, cx, 0.035, z);
    for (const s of [-1, 1]) box(r, 0.06, 0.18, d - 0.2, '#4b5274', cx + s * (hw - 0.05), 0.09, cz);
    // Wall ribs, a handrail and ceiling beams with light strips.
    for (const s of [-1, 1]) {
      for (let z = zmin + 0.25; z <= zmax - 0.2; z += 1.25) box(r, 0.1, h - 0.1, 0.16, '#5c6283', cx + s * (hw - 0.06), h / 2, z);
      box(r, 0.05, 0.05, d - 0.4, '#b9c3d6', cx + s * (hw - 0.14), 1.0, cz);
      box(r, 0.22, 0.14, d - 0.2, '#3a3f57', cx + s * (hw - 0.2), h - 0.16, cz);           // cable tray
      box(r, 0.04, 0.04, d - 0.3, st.accent, cx + s * (hw - 0.2), h - 0.25, cz, 0.6);       // tray lamp
    }
    for (let z = zmin + 0.9; z < zmax - 0.4; z += 1.6) { box(r, w - 0.2, 0.1, 0.18, '#4a5070', cx, h - 0.08, z); box(r, 1.6, 0.03, 0.34, st.light, cx, h - 0.15, z, 0.65); }
    const lamp = new THREE.PointLight(st.light, 2.6, 7.5, 1.7); lamp.position.set(cx, h - 0.45, cz); r.add(lamp); lights.push(lamp);
    const glow = new THREE.PointLight(st.accent, 1.1, 4.5, 2); glow.position.set(cx, 0.6, cz); r.add(glow);
    // Room-specific furniture.
    if (room.name === 'cockpit') {
      for (const s of [-1, 1]) { box(r, 0.7, 0.12, 0.7, '#262a3b', cx + s * 0.85, 0.5, cz - 0.3); box(r, 0.7, 0.85, 0.12, '#262a3b', cx + s * 0.85, 0.95, cz - 0.62); cyl(r, 0.08, 0.08, 0.45, '#8a91ad', cx + s * 0.85, 0.22, cz - 0.3, 8); }
      const desk = box(r, 3.4, 0.9, 0.6, '#565c7a', cx, 0.45, zmax - 0.95);
      for (const x of [-1.1, 0, 1.1]) { const scr = box(r, 0.9, 0.5, 0.05, x ? '#6fb2ff' : '#ffd27a', cx + x, 1.18, zmax - 1.05, 0.8); scr.rotation.x = -0.35; }
      windowPane(r, 3.4, 1.1, cx, 1.85, zmax - 0.08, Math.PI);
      void desk;
    } else if (room.name === 'lab') {
      box(r, 0.5, 0.9, 1.2, '#d5dbe4', cx + hw - 0.35, 0.45, cz + 0.1); box(r, 0.52, 0.05, 1.22, st.accent, cx + hw - 0.35, 0.92, cz + 0.1);
      cyl(r, 0.08, 0.12, 0.35, '#3a3f57', cx + hw - 0.35, 1.1, cz - 0.2, 10); const mon = box(r, 0.05, 0.38, 0.55, '#8ff0d0', cx + hw - 0.45, 1.22, cz + 0.35, 0.8); mon.rotation.y = 0;
      box(r, 0.55, 1.6, 0.9, '#c4ccd8', cx - hw + 0.35, 0.8, cz + 0.1); box(r, 0.02, 1.2, 0.7, '#9fe8ff', cx - hw + 0.63, 0.95, cz + 0.1, 0.35);
      windowPane(r, 1.2, 0.7, cx + hw - 0.04, 1.85, cz + 1.6, -Math.PI / 2);
    } else if (room.name === 'workshop') {
      box(r, 0.08, 1.3, 1.5, '#4a5070', cx - hw + 0.1, 1.45, cz + 1.2);
      for (let i = 0; i < 6; i++) box(r, 0.06, 0.32, 0.06, i % 2 ? '#f4b860' : '#c9d2db', cx - hw + 0.18, 1.15 + (i % 3) * 0.35, cz + 0.7 + Math.floor(i / 3) * 0.6);
      box(r, 0.6, 0.85, 0.9, '#c8503c', cx - hw + 0.4, 0.42, cz + 1.2); for (let i = 0; i < 3; i++) box(r, 0.62, 0.03, 0.88, '#2b2f42', cx - hw + 0.4, 0.2 + i * 0.25, cz + 1.2);
    } else if (room.name === 'life_support') {
      for (const [x, z, c] of [[hw - 0.35, cz + 0.2, '#e7ebef'], [hw - 0.35, cz - 0.45, '#7fd6ff'], [-hw + 0.35, cz + 0.2, '#e7ebef']]) { cyl(r, 0.24, 0.24, 1.7, c, cx + x, 0.85, z, 14); cyl(r, 0.26, 0.26, 0.08, '#2b2f42', cx + x, 1.2, z, 14); }
      for (const s of [-1, 1]) cyl(r, 0.05, 0.05, d - 0.4, '#9fb3c8', cx + s * (hw - 0.3), 2.2, cz, 8).rotation.x = Math.PI / 2;
    } else if (room.name === 'power_room') {
      for (const s of [-1, 1]) { box(r, 0.55, 1.8, 1.0, '#3b4058', cx + s * (hw - 0.35), 0.9, cz); for (let i = 0; i < 4; i++) box(r, 0.02, 0.18, 0.8, i < 3 ? '#7dffb5' : '#ffd25a', cx + s * (hw - 0.63), 0.5 + i * 0.32, cz, 1.1); }
      box(r, w - 0.6, 0.12, 0.12, '#ffd25a', cx, h - 0.45, cz, 0.7);
    } else if (room.name === 'engine_bay') {
      const housing = cyl(r, 1.0, 1.15, 2.6, '#707792', cx, 1.2, zmin + 0.55, 20); housing.rotation.z = Math.PI / 2;
      cyl(r, 0.55, 0.55, 2.7, '#ff8a5c', cx, 1.2, zmin + 0.55, 20, 0.35).rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) cyl(r, 0.09, 0.09, d - 0.6, '#c99a5a', cx + s * (hw - 0.3), 2.35, cz, 8).rotation.x = Math.PI / 2;
    } else if (room.name === 'airlock') {
      for (const z of [-0.6, 0.6]) { cyl(r, 0.28, 0.32, 1.1, '#f2f4f7', cx + 0.9, 1.05, cz + z, 12); const helmet = new THREE.Mesh(geo(new THREE.SphereGeometry(0.22, 14, 10)), mat('#f2f4f7')); helmet.position.set(cx + 0.9, 1.8, cz + z); r.add(helmet); box(r, 0.04, 0.12, 0.22, '#ffb347', cx + 0.72, 1.82, cz + z, 0.5); }
      const hatch = cyl(r, 0.75, 0.75, 0.12, '#8a91ad', cx - hw + 0.08, 1.2, cz, 24); hatch.rotation.z = Math.PI / 2;
      cyl(r, 0.55, 0.55, 0.14, '#ffb347', cx - hw + 0.08, 1.2, cz, 24, 0.3).rotation.z = Math.PI / 2;
    }
  }
  // Hatch frames between modules: posts, lintel and hazard trim.
  for (const hatch of layout.hatches || []) {
    const [x, y, z] = hatch.position, hw = (hatch.width || 1.2) / 2, hh = hatch.height || 2.1;
    const side = Math.abs(x) > 1.5;     // the airlock hatch sits in the side wall
    const f = new THREE.Group(); f.position.set(x, 0, z); if (side) f.rotation.y = -Math.PI / 2;   // "to" face points back into the workshop group.add(f);
    for (const s of [-1, 1]) { box(f, 0.14, hh, 0.3, '#7d86a6', s * (hw + 0.07), hh / 2, 0); box(f, 0.03, hh - 0.2, 0.32, '#ffd25a', s * (hw + 0.15), hh / 2, 0, 0.2); }
    box(f, hw * 2 + 0.28, 0.16, 0.3, '#7d86a6', 0, hh + 0.08, 0);
    box(f, hw * 2 + 0.1, 0.03, 0.32, '#ffd25a', 0, hh, 0, 0.4);
    // Directional signs: each face of the hatch names the room on the other side.
    const to = ROOM_STYLE[hatch.to] || {name: String(hatch.to).toUpperCase(), accent: '#8ff0d0'};
    const from = ROOM_STYLE[hatch.from] || {name: String(hatch.from).toUpperCase(), accent: '#8ff0d0'};
    sign(f, to.name + '  ▸', to.accent, 0, hh + 0.42, -0.17, Math.PI);
    sign(f, '◂  ' + from.name, from.accent, 0, hh + 0.42, 0.17, 0);
    void y;
  }
  return {group, lights};
}
