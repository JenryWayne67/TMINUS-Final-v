// Walk the ship: a self-contained first-person overlay (own scene, camera, renderer and input).
// It does not touch the match state machine; closing it returns to whatever screen opened it.
import * as THREE from './vendor/three.module.js';
import {loadShipInterior, loadGLB} from './asset-loader.js';
import {designSheet, ROOM_LABEL, ROOM_ORDER} from './design-science.js';
import {REPAIR_BY_TASK} from './repairs-core.js';
import {openRepair} from './repairs-ui.js';
import {EYE_HEIGHT, createWalker, stepWalker, roomAt, nearestProp, roomLessons, ROOM_BLURB} from './ship-walk-core.js';

let open = null;
let dataPromise = null;
const loadData = () => dataPromise ??= Promise.all([
  fetch('./assets/ship/ship_nav.json').then(r => r.json()),
  fetch('./assets/ship/ship_interior.scene.json').then(r => r.json())
]).catch(e => { dataPromise = null; throw e; });

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const fmt = (c) => {
  const v = c.value, n = c.id === 'twr' ? 2 : c.id === 'downlink' ? 0 : 1;
  return `${Number.isFinite(v) ? v.toFixed(n) : '—'} ${c.unit}`.trim();
};
const STATUS = {go: 'GO', caution: 'CAUTION', nogo: 'NO-GO'};

export function isShipWalkOpen() { return !!open; }

export function openShipWalk(state, onClose = () => {}) {
  if (open) return open.close;
  const root = document.createElement('div');
  root.className = 'ag-walk';
  root.innerHTML = `<canvas class="ag-walk-canvas"></canvas>
    <div class="ag-walk-top"><div><div class="ce-overline">SHIP WALK / T-MINUS INTERIOR</div><h2 class="ag-walk-room">Loading the ship…</h2><p class="ag-walk-blurb"></p></div><button class="ag-walk-close" type="button">BACK TO BUILD ↩</button></div>
    <aside class="ag-walk-science" aria-live="polite"></aside>
    <div class="ag-walk-station" hidden></div>
    <div class="ag-walk-hint">W A S D MOVE · SHIFT RUN · CLICK TO LOOK (OR DRAG) · ESC BACK</div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const el = {room: root.querySelector('.ag-walk-room'), blurb: root.querySelector('.ag-walk-blurb'),
    science: root.querySelector('.ag-walk-science'), station: root.querySelector('.ag-walk-station')};

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a1420');
  scene.fog = new THREE.Fog('#1a1420', 12, 42);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  scene.add(new THREE.HemisphereLight('#ffe9d2', '#3a2c44', 1.1));
  const lamp = new THREE.PointLight('#ffd7a8', 5, 8, 2);
  scene.add(lamp);

  const keys = new Set();
  let walker = null, nav = null, layout = null, raf = 0, last = performance.now(), closed = false;
  let dragging = false, lastRoom = null, lastStation = '', ready = false;
  let currentNear = null, modalOpen = false, closeRepair = null, opens = 0;
  const sheet = designSheet(state);
  state.repairs ??= {};

  function openStation(near) {
    const kind = REPAIR_BY_TASK[near.task];
    if (!kind || modalOpen) return;
    modalOpen = true;
    keys.clear();
    dragging = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    const seed = [...near.task].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + (++opens);
    closeRepair = openRepair(root, kind, sheet, seed,
      result => { if (result.ok) { state.repairs[near.task] = result; lastStation = ''; } },
      () => { modalOpen = false; closeRepair = null; lastStation = ''; });
  }

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  function showRoom(room) {
    const name = ROOM_LABEL[room] || 'Doorway';
    el.room.textContent = name;
    el.blurb.textContent = ROOM_BLURB[room] || '';
    const checks = roomLessons(sheet, room);
    el.science.innerHTML = checks.length
      ? `<div class="ce-overline">THE SCIENCE IN THIS ROOM</div>` + checks.map(c => `<section data-status="${c.status}"><div><b>${esc(c.label)}</b><strong>${esc(fmt(c))}</strong></div><em>${STATUS[c.status]} · ${esc(c.limit)}</em><p>${esc(c.why)}</p></section>`).join('')
      : `<div class="ce-overline">NO DESIGN CHECK HERE</div><p>${esc(ROOM_BLURB[room] || '')}</p>`;
  }

  function onKey(down) {
    return event => {
      const k = event.key.toLowerCase();
      if (modalOpen) {                                   // a repair is open: Esc leaves it, everything else is the minigame's
        if (down && k === 'escape') { event.preventDefault(); event.stopPropagation(); closeRepair?.(); }
        return;
      }
      if (down && k === 'escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (down && k === 'e') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat && currentNear && REPAIR_BY_TASK[currentNear.task]) openStation(currentNear);
        return;
      }
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) return;
      event.preventDefault(); event.stopPropagation();
      if (down) keys.add(k); else keys.delete(k);
    };
  }
  const keydown = onKey(true), keyup = onKey(false);
  addEventListener('keydown', keydown, true);
  addEventListener('keyup', keyup, true);

  const look = event => {
    if (!walker || (document.pointerLockElement !== canvas && !dragging)) return;
    walker.yaw -= event.movementX * 0.0025;
    walker.pitch = Math.max(-1.2, Math.min(1.2, walker.pitch - event.movementY * 0.0025));
  };
  const down = () => { dragging = true; if (canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch {} } };
  const up = () => { dragging = false; };
  canvas.addEventListener('mousedown', down);
  addEventListener('mouseup', up);
  addEventListener('mousemove', look);
  root.querySelector('.ag-walk-close').addEventListener('click', () => close());

  function frame(now) {
    if (closed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (ready) {
      const turn = ((keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0)) * 1.8 * dt;
      walker.yaw += turn;
      stepWalker(walker, nav, dt, {
        forward: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
        strafe: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
        run: keys.has('shift')
      });
      camera.position.set(walker.x, EYE_HEIGHT, walker.z);
      camera.lookAt(walker.x + Math.sin(walker.yaw) * Math.cos(walker.pitch), EYE_HEIGHT + Math.sin(walker.pitch),
        walker.z + Math.cos(walker.yaw) * Math.cos(walker.pitch));
      lamp.position.set(walker.x, 2.5, walker.z);
      root.dataset.x = walker.x.toFixed(2); root.dataset.z = walker.z.toFixed(2); root.dataset.yaw = walker.yaw.toFixed(2);
      const room = roomAt(nav, walker.x, walker.z) ?? lastRoom;
      if (room !== lastRoom) { lastRoom = room; showRoom(room); }
      const near = nearestProp(layout, walker.x, walker.z);
      currentNear = near;
      const fixed = near && state.repairs[near.task];
      const text = near ? `${near.label}|${near.owner}|${fixed ? 1 : 0}|${modalOpen ? 1 : 0}` : '';
      if (text !== lastStation) {
        lastStation = text;
        el.station.hidden = !near || modalOpen;
        if (near) {
          const can = !!REPAIR_BY_TASK[near.task];
          const line = fixed ? `Repaired ✓ in ${fixed.seconds.toFixed(0)} s · press E to try again`
            : can ? 'Press E to start the repair' : 'This repair arrives in a later phase';
          el.station.innerHTML = `<div class="ce-overline">REPAIR STATION · ${esc(near.owner.toUpperCase())}</div><b>${esc(near.label)}</b><span>${line}</span>`;
        }
      }
    }
    renderer.render(scene, camera);
  }

  (async () => {
    try {
      [nav, layout] = await loadData();
      const gltf = await loadShipInterior();
      if (closed) return;
      scene.add(gltf.scene);
      // Repair props, placed where the pack's scene file puts them. A missing prop must not block the walk.
      await Promise.all(layout.props.map(async p => {
        try {
          const g = await loadGLB('./assets/props/' + p.asset.split('/').pop());
          if (closed) return;
          const m = g.scene.clone(true);
          m.position.set(p.position[0], p.position[1], p.position[2]);
          m.rotation.y = THREE.MathUtils.degToRad(p.rotation_y_deg || 0);
          scene.add(m);
        } catch { /* prop skipped */ }
      }));
      walker = createWalker(nav, layout);
      ready = true;
      lastRoom = null;
    } catch (error) {
      el.room.textContent = 'The ship could not be loaded';
      el.blurb.textContent = String(error?.message || error);
    }
  })();
  raf = requestAnimationFrame(frame);

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    closeRepair?.();
    removeEventListener('resize', resize);
    removeEventListener('keydown', keydown, true);
    removeEventListener('keyup', keyup, true);
    removeEventListener('mouseup', up);
    removeEventListener('mousemove', look);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    // Cached models are reused next time, so detach them rather than dispose their geometry.
    for (const child of [...scene.children]) scene.remove(child);
    renderer.dispose();
    root.remove();
    open = null;
    onClose();
  }
  open = {close};
  return close;
}

export {ROOM_ORDER};
