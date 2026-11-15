import {createFootGrounding} from './rig-grounding.js';
// Rigged, animated crew characters. Frog, bee and flamingo come from the T-MINUS asset pack (90 clips each); Chip the
// robot is the CC0 Quaternius Animated Robot (FBX). Until a model has loaded, the procedural avatar stays visible.
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {FBXLoader} from './vendor/FBXLoader.js';
import * as SkeletonUtils from './vendor/SkeletonUtils.js';
import {clipFor, timeScaleFor} from './locomotion.js';

export const SPECIES = ['frog', 'robot', 'bee', 'flamingo'];          // indexed by crew role: pilot, engineer, gunner, raider
const FILES = {frog: './assets/characters/frog.glb', bee: './assets/characters/bee.glb', flamingo: './assets/characters/flamingo.glb',
  robot: './assets/characters/Robot.fbx'};
export const TARGET_HEIGHT = 2.5;                                     // metres, same as the procedural crew
const FADE = 0.18;
const ONE_SHOT = new Set(['pickup', 'celebrate']);
// FBX clips arrive as "Armature|Clip"; GLB clips are bare. Match either form.
function findClip(list, name) {
  if (!name) return null;
  return list.find(c => c.name === name) || list.find(c => c.name.endsWith('|' + name)) || null;
}
const cache = new Map();

function loadTemplate(species) {
  if (!cache.has(species)) {
    cache.set(species, new Promise((resolve, reject) => {
      if (species === 'robot') new FBXLoader().load(FILES.robot, o => resolve({scene: o, animations: o.animations}), undefined, reject);
      else new GLTFLoader().load(FILES[species], g => resolve({scene: g.scene, animations: g.animations}), undefined, reject);
    }));
    cache.get(species).catch(() => cache.delete(species));
  }
  return cache.get(species);
}

// Make a loaded model safe to render: no culling glitches, and opaque materials.
function prepare(obj) {
  obj.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    if(o.geometry)o.geometry.userData.tminusAssetShared=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){m.userData.tminusAssetShared=true;if(m.map)m.map.userData.tminusAssetShared=true;}
    o.frustumCulled = false; o.castShadow = true;
    // FBX exports often arrive with opacity 0 and transparency on, which makes the model invisible: force them opaque.
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.opacity = 1; m.transparent = false; m.depthWrite = true; m.needsUpdate = true; }
  });
}

// Scale the model to the target height and stand it on the floor, centred on its own origin.
function normalise(obj, height) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true), size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0)) return;
  obj.scale.multiplyScalar(height / size.y);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj, true), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
}

// Put a rigged, animated skin on a procedural avatar. Resolves to the skin, or null if the model could not load.
export async function attachSkin(avatar, role, {height = TARGET_HEIGHT} = {}) {
  const species = SPECIES[role];
  let tpl;
  try { tpl = await loadTemplate(species); } catch { return null; }
  const obj = SkeletonUtils.clone(tpl.scene);
  obj.traverse(o=>{if(o.isMesh||o.isSkinnedMesh)o.userData.tminusAssetShared=true;});
  prepare(obj);
  normalise(obj, height);
  const holder = new THREE.Group(); holder.add(obj);
  avatar.group.add(holder);
  avatar.body.visible = false;                                         // hide the procedural body, keep the selection ring
  const mixer = new THREE.AnimationMixer(holder);
  const actions = new Map();
  const action = state => {
    const name = clipFor(species, state);
    if (!actions.has(name)) {
      const clip = findClip(tpl.animations, name) || findClip(tpl.animations, clipFor(species, 'idle')) || tpl.animations[0];
      const a = mixer.clipAction(clip);
      if (ONE_SHOT.has(state)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      else a.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(name, a);
    }
    return actions.get(name);
  };
  let disposed=false;
  const skin = {species, mixer, holder, state: null, name: null,
    dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(holder);const skeletons=new Set();holder.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();holder.removeFromParent();},
    lock: 0,
    // Play a one-shot clip (pick-up, celebrate) and hold it before locomotion resumes.
    playOnce(state, seconds = 0.9) { this.lock = 0; this.setState(state, 0); this.lock = performance.now() + seconds * 1000; },
    setState(state, speed = 0) {
      if (this.lock && performance.now() < this.lock) return;
      this.lock = 0;
      const next = action(state), rate = timeScaleFor(species, state, speed);
      if (this.state !== state) {
        const prev = this.name && actions.get(this.name);
        if (next !== prev) { next.reset().play(); if (prev) prev.crossFadeTo(next, FADE, false); next.enabled = true; next.setEffectiveWeight(1); }
        this.state = state; this.name = clipFor(species, state);
      }
      next.setEffectiveTimeScale(rate);
    }};
  skin.setState('idle', 0);
  mixer.update(0.001);
  // Bones used for the head turn and the hand socket. Animals have no hand bone: the middle-finger root is the palm.
  // Loaders sanitise bone names ("Middle1.R" becomes "Middle1R"), so compare without punctuation.
  const plain = n => String(n).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const bone = (...names) => { for (const n of names) { let found = null; const want = plain(n); obj.traverse(o => { if (!found && o.isBone && (plain(o.name) === want || plain(o.name).endsWith(want))) found = o; }); if (found) return found; } return null; };
  const head = bone('Head'), neck = bone('Neck');
  let palm = bone('Hand.R', 'Middle1.R', 'LowerArm.R'), palmL = bone('Hand.L', 'Middle1.L', 'LowerArm.L');
  // Rigs disagree on which side ".R" is. The model faces +Z, so its right hand is the palm at -X.
  if (palm && palmL) {
    holder.updateMatrixWorld(true);
    const a = holder.worldToLocal(palm.getWorldPosition(new THREE.Vector3())), b = holder.worldToLocal(palmL.getWorldPosition(new THREE.Vector3()));
    if (a.x > b.x) [palm, palmL] = [palmL, palm];
  }
  // Hand sockets live on the avatar (not on the bone) so a held item never inherits the rig's import scale.
  const socket = new THREE.Group(); socket.name = 'hand-socket'; avatar.group.add(socket);
  const look = {yaw: 0, pitch: 0, tYaw: 0, tPitch: 0};
  const crouchDip = {v: 0};
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), vtmp = new THREE.Vector3(), vtmp2 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
  function turnBone(b, yaw, pitch) {
    if (!b?.parent) return;
    b.parent.getWorldQuaternion(qp);
    avatar.group.getWorldQuaternion(qb);
    // Rotate about the avatar's up axis, then about its side axis, expressed in the bone's parent space.
    qa.setFromAxisAngle(vtmp.copy(UP).applyQuaternion(qb), yaw).multiply(qb.clone().multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, pitch)).multiply(qb.clone().invert()));
    b.quaternion.premultiply(qp.clone().invert().multiply(qa).multiply(qp));
  }
  skin.setLook = (yaw = 0, pitch = 0) => { look.tYaw = Math.max(-1.05, Math.min(1.05, yaw)); look.tPitch = Math.max(-0.5, Math.min(0.5, pitch)); };
  skin.socket = socket;
  skin.handWorld = (target = new THREE.Vector3()) => (palm ? palm.getWorldPosition(target) : avatar.group.localToWorld(target.set(-0.35, 1.2, 0.35)));
  skin.handWorldL = (target = new THREE.Vector3()) => (palmL ? palmL.getWorldPosition(target) : avatar.group.localToWorld(target.set(0.35, 1.2, 0.35)));
  skin.grounding=createFootGrounding(obj);
  skin.ground=(dt,options={})=>{
    skin.grounding.apply(dt,options);
    // Chip has no crouch clip: lower and compress the rig so crouching still reads clearly.
    const wantDip = species === 'robot' && /^crouch/.test(skin.state || '') ? 1 : 0;
    crouchDip.v += (wantDip - crouchDip.v) * (1 - Math.exp(-10 * Math.max(0, dt || 0)));
    holder.scale.y = 1 - crouchDip.v * 0.24; holder.position.y = -crouchDip.v * 0.05;
    // Head turns toward where the crew member is moving or looking, split between neck and head.
    const k = 1 - Math.exp(-9 * Math.max(0, dt || 0));
    look.yaw += (look.tYaw - look.yaw) * k; look.pitch += (look.tPitch - look.pitch) * k;
    if (Math.abs(look.yaw) > 1e-3 || Math.abs(look.pitch) > 1e-3) {
      holder.updateMatrixWorld(true);
      turnBone(neck, look.yaw * 0.4, look.pitch * 0.35);
      if (neck) neck.updateMatrixWorld(true);
      turnBone(head, look.yaw * 0.6, look.pitch * 0.65);
    }
    // Socket follows the right palm in avatar space every frame.
    if (palm) { holder.updateMatrixWorld(true); palm.getWorldPosition(vtmp2); avatar.group.worldToLocal(vtmp2); socket.position.copy(vtmp2); }
  };
  avatar.skin = skin;
  return skin;
}

// A square head-and-shoulders portrait of a crew member as a PNG data URL, rendered once from the 3D model.
export async function portraitFor(role, size = 128) {
  const species = SPECIES[role];
  const tpl = await loadTemplate(species);
  const obj = SkeletonUtils.clone(tpl.scene);
  obj.traverse(o=>{if(o.isMesh||o.isSkinnedMesh)o.userData.tminusAssetShared=true;});
  prepare(obj); normalise(obj, TARGET_HEIGHT);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const r = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, preserveDrawingBuffer: true});
  r.setClearColor(0x000000, 0); r.setSize(size, size, false);
  const scene = new THREE.Scene(); scene.add(obj);
  scene.add(new THREE.HemisphereLight('#fff2dd', '#4a3a58', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(2, 3, 5); scene.add(key);
  const box = new THREE.Box3().setFromObject(obj, true), h = box.max.y - box.min.y, headY = box.max.y - h * 0.15;
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 60);
  cam.position.set(0, headY + 0.1, h * 0.95); cam.lookAt(0, headY, 0);
  r.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  r.dispose(); r.forceContextLoss?.();
  return url;
}
