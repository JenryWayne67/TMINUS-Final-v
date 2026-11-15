// Visual models for things the crew pick up and carry: science flags, equipment crates and weapons in the hand.
// Presentation only. Ownership, carrying and scoring stay authoritative on the server / match logic.
import * as THREE from './vendor/three.module.js';

const shared = new Map();
function toon(color, emissive = 0) {
  const key = color + ':' + emissive;
  if (!shared.has(key)) {
    const m = new THREE.MeshToonMaterial({color, emissive: color, emissiveIntensity: emissive});
    m.userData.tminusShared = true;
    shared.set(key, m);
  }
  return shared.get(key);
}
function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}

// Scale any object so its largest dimension equals `size`, and centre it on its own origin.
export function fitToSize(object, size) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object), dims = box.getSize(new THREE.Vector3());
  const largest = Math.max(dims.x, dims.y, dims.z);
  if (!(largest > 0)) return object;
  object.scale.multiplyScalar(size / largest);
  object.updateMatrixWorld(true);
  // Call before the holder is placed in a transformed scene: world space equals holder space here.
  const centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  object.position.sub(centre);
  return object;
}

// A planted science flag: stone cairn, pole, finial and a waving cloth. Neutral until a crew claims it.
export function createFlagModel({neutral = '#f2e7c9'} = {}) {
  const g = new THREE.Group(); g.name = 'science-flag';
  const cairn = new THREE.Group(); g.add(cairn);
  part(cairn, new THREE.CylinderGeometry(0.55, 0.75, 0.32, 8), toon('#6f6473'), 0, 0.16, 0);
  part(cairn, new THREE.DodecahedronGeometry(0.22), toon('#857a88'), 0.42, 0.22, 0.18);
  part(cairn, new THREE.DodecahedronGeometry(0.17), toon('#5f5563'), -0.38, 0.2, -0.2);
  const pole = part(g, new THREE.CylinderGeometry(0.045, 0.045, 2.5, 8), toon('#d7dce4'), 0, 1.25, 0);
  const finial = part(g, new THREE.SphereGeometry(0.1, 12, 8), toon('#ffd27a', 0.5), 0, 2.55, 0);
  const geo = new THREE.PlaneGeometry(1.15, 0.72, 10, 4); geo.translate(0.575, 0, 0);
  const rest = Float32Array.from(geo.attributes.position.array);
  const clothMat = new THREE.MeshToonMaterial({color: neutral, side: THREE.DoubleSide});
  const cloth = part(g, geo, clothMat, 0.04, 2.1, 0);
  // Chevron emblem on the cloth so a flag never reads as a gem or crate.
  const emblem = part(cloth, new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({color: '#1d2433', side: THREE.DoubleSide}), 0.6, 0, 0.004);
  emblem.rotation.z = Math.PI / 4; emblem.castShadow = false;
  const ringMat = new THREE.MeshBasicMaterial({color: '#ffe3a1', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false});
  const ring = part(g, new THREE.RingGeometry(1.0, 1.12, 48), ringMat, 0, 0.04, 0); ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
  // Hold-E progress arc around the flag: fills from 0 to 360° over the pick-up time.
  const progressMat = new THREE.MeshBasicMaterial({color: '#7dffb5', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false});
  const progress = part(g, new THREE.RingGeometry(1.16, 1.42, 48, 1, 0, 0.0001), progressMat, 0, 0.06, 0);
  progress.rotation.x = -Math.PI / 2; progress.castShadow = false; progress.visible = false;
  let lastFrac = -1, t = Math.random() * 10;
  const flag = {
    group: g, cloth, pole, cairn, ring, progress, finial,
    setColor(color) { clothMat.color.set(color); },
    setProgress(frac) {
      frac = Math.max(0, Math.min(1, frac || 0));
      progress.visible = frac > 0.001;
      if (Math.abs(frac - lastFrac) < 0.004) return;
      lastFrac = frac;
      progress.geometry.dispose();
      progress.geometry = new THREE.RingGeometry(1.16, 1.42, 48, 1, Math.PI / 2, -Math.max(0.0001, frac * Math.PI * 2));
    },
    // planted: cairn + ring on the ground; carried: pole only, held in a hand.
    setCarried(carried) { cairn.visible = !carried; ring.visible = !carried; if (carried) progress.visible = false; },
    update(dt, speed = 0) {
      t += dt * (2.4 + Math.min(4, speed) * 0.6);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1];
        pos.setZ(i, Math.sin(t + x * 5 + y * 1.5) * 0.09 * (x / 1.15));
        pos.setY(i, y - (x / 1.15) * 0.04 * (1 + Math.sin(t * 0.7)));
      }
      pos.needsUpdate = true;
      ring.rotation.z += dt * 0.6;
    }
  };
  return flag;
}

// A carried equipment crate: open frame, team colour band and a fitted miniature of the module inside.
// It is sized for a two-hand carry so the pose and the object always match.
export function createEquipmentCrate(color, miniature = null, {width = 1.2, height = 0.7, depth = 0.7, label = ''} = {}) {
  const g = new THREE.Group(); g.name = 'equipment-crate';
  const frameMat = toon('#c9d2db'), dark = toon('#3a4255');
  part(g, new THREE.BoxGeometry(width, 0.06, depth), dark, 0, -height / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    part(g, new THREE.BoxGeometry(0.06, height, 0.06), frameMat, sx * (width / 2 - 0.03), 0, sz * (depth / 2 - 0.03));
  for (const sy of [-1, 1]) for (const sz of [-1, 1])
    part(g, new THREE.BoxGeometry(width, 0.05, 0.05), frameMat, 0, sy * (height / 2 - 0.025), sz * (depth / 2 - 0.025));
  part(g, new THREE.BoxGeometry(width + 0.02, 0.12, depth + 0.02), toon(color, 0.25), 0, height * 0.12, 0);
  // Grab handles on each side line up with where the hands land in the carry pose.
  for (const sx of [-1, 1]) part(g, new THREE.BoxGeometry(0.05, 0.08, 0.28), toon('#f4b860'), sx * (width / 2 + 0.03), height * 0.1, 0);
  if (miniature) {
    const holder = new THREE.Group(); g.add(holder); holder.add(miniature);
    fitToSize(miniature, Math.min(width, height, depth) * 1.15);
  }
  if (label) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#10151f'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#ffffff'; x.font = '700 18px sans-serif'; x.textAlign = 'center'; x.fillText(label.slice(0, 10).toUpperCase(), 64, 23);
    const tex = new THREE.CanvasTexture(c);
    const tag = part(g, new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({map: tex}), 0, -height * 0.18, depth / 2 + 0.011);
    tag.castShadow = false;
  }
  return g;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
// Where a carried object goes, in world space. Two-hand items sit between the palms; one-hand items in the right palm.
// Falls back to a point in front of the chest while a skin is still loading.
export function holdPoint(avatar, kind = 'two', out = new THREE.Vector3()) {
  const g = avatar.group || avatar.g;
  const skin = avatar.skin;
  if (skin?.handWorld) {
    if (kind === 'two' && skin.handWorldL) {
      skin.handWorld(tmpA); skin.handWorldL(tmpB);
      out.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      // Push slightly forward of the palms so the crate rests against the hands, not inside the chest.
      tmpC.set(0, 0, 0.18).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      return out.add(tmpC);
    }
    return skin.handWorld(out);
  }
  g.updateMatrixWorld(true);
  return g.localToWorld(out.set(kind === 'two' ? 0 : 0.35, kind === 'two' ? 1.15 : 1.05, 0.55));
}

// Place an object at a world point while it is parented somewhere else (e.g. inside a ship group).
export function placeAtWorld(object, world, yaw = 0) {
  const parent = object.parent;
  if (parent) { parent.updateMatrixWorld(true); object.position.copy(parent.worldToLocal(tmpC.copy(world))); }
  else object.position.copy(world);
  const parentYaw = parent ? new THREE.Euler().setFromQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
  object.rotation.set(0, yaw - parentYaw, 0);
}

// Third-person weapon in the right hand. The three Kenney blasters load once and are shared by every avatar.
import {loadGLB} from './asset-loader.js';
const WEAPON_FILES = ['blaster-f.glb', 'blaster-b.glb', 'blaster-d.glb'];   // carbine, sidearm, scatter (fps-core SLOTS)
const weaponTemplates = WEAPON_FILES.map(() => null);
let weaponLoad = null;
function loadWeapons() {
  weaponLoad ??= Promise.all(WEAPON_FILES.map((f, i) => loadGLB('./assets/weapons/' + f).then(g => { weaponTemplates[i] = g.scene; }).catch(() => {})));
  return weaponLoad;
}
export function createHeldWeapon() {
  const g = new THREE.Group(); g.name = 'held-weapon';
  const slots = WEAPON_FILES.map(() => null);
  let current = -1;
  function build(i) {
    if (slots[i] || !weaponTemplates[i]) return slots[i];
    const m = weaponTemplates[i].clone(true);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.tminusAssetShared = true; if (o.geometry) o.geometry.userData.tminusAssetShared = true; for (const mm of [o.material].flat()) if (mm) mm.userData.tminusAssetShared = true; } });
    const holder = new THREE.Group(); holder.add(m);
    fitToSize(m, i === 1 ? 0.62 : 1.0);   // sized for the chunky crew gloves so it reads in third person
    // Avatars face +Z; the blaster muzzle is modelled toward -Z, so turn it to point where the crew member faces.
    holder.rotation.y = Math.PI;
    // Grip sits slightly behind the model centre: shift so the palm holds the handle.
    holder.position.set(0, 0.06, 0.34);
    holder.visible = false; g.add(holder); slots[i] = holder;
    return holder;
  }
  loadWeapons();
  return {
    group: g,
    setSlot(i) {
      i = Math.max(0, Math.min(2, i | 0));
      if (!slots[i]) build(i);
      if (current === i && slots[i]?.visible) return;
      slots.forEach((s, k) => { if (s) s.visible = k === i; });
      current = slots[i] ? i : -1;
    }
  };
}
