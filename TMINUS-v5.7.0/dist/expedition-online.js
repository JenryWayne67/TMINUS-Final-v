import {estimateSceneMemory} from './performance-core.js';
import {mountAccountUI} from './account-ui.js';
import {groundObject} from './model-grounding.js';
import {createOnlineCombatView} from './online-combat-view.js';
import {getPreferences,observePreferences,mountPreferences} from './preferences.js';
import {EVA} from './spacewalk-core.js';
// Network expedition client. Sends intentions; displays authoritative shared mission models.
import * as THREE from "./vendor/three.module.js";
import { FACTIONS, FLAG_SITES, UPGRADES, scanFraction } from "./science-match.js";
import { createPartModel } from "./part-model.js";
import { createFlagModel, createEquipmentCrate, createHeldWeapon, holdPoint, placeAtWorld } from "./held-items.js";
import {
  createExpedition,
  routeBudget,
  ROUTES,
  SPECIALISTS,
} from "./expedition-core.js";
import { createSpacecraft } from "./spacecraft-model.js";
import { SHIP_SCALE } from "./ship-scale.js";
import { attachSkin } from "./characters.js";
import { stateFor } from "./locomotion.js";
import { boltPosition, footprintDistance } from "./build-guide.js";
import {
  baseFor,
  spaceBaseFor,
  shelfPoint,
  STOW_POINT,
  RECEIVER_POINT,
  CHECK_STATIONS,
  SYSTEM_STATIONS,
  SURFACE_ROCKS,
  expeditionColliders,
} from "./expedition-network.js";
import { interpolateSnapshots } from "./multiplayer-foundation.js";
import { cameraBoomFraction, smoothFacing } from "./motion-physics.js";
import { disposeDetachedTree } from "./resource-lifecycle.js";
const TEAMS = FACTIONS.map((t) => t.name),
  COLORS = FACTIONS.map((t) => t.color),
  ROLES = ["Pilot", "Engineer", "Gunner", "Raider"];
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const readLocal = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  writeLocal = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
const isTyping = () =>
  ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
const limit = (x, a, b) => Math.max(a, Math.min(b, x));
const screens = {
  lobby: "CREW ASSEMBLY",
  expedition: "LIVE EXPEDITION",
  results: "MISSION COMPLETE",
};
let ws = null,
  alive = false,
  joined = false,
  reconnecting = false,
  retry = 0,
  id = null,
  token = null,
  room = null,
  latest = null,
  previous = null,
  receivedAt = 0,
  seq = 0,
  commandSeq = -1,
  lastHud = 0,
  serverUrl = "",
  manualClose = false,
  lastEvents = new Set(),
  shownResult = false,
  profile = null;
const keys = new Set(),
  selfDisplay = { x: 0, z: 0, init: false };
let yaw = 0,
  pitch = 0.24,
  shooting = false,
  working = false,
  toastUntil = 0,
  toastText = "",
  view = "third",
  ads=false,crouch=false,combatView=null,
  lastTask = "",
  lastPhase = "",
  calibration = { engine: 35, power: 30, pressure: 101.3 };
const canvas = $("online-scene");
let scene,
  camera,
  renderer,
  root,
  ground,
  stars,
  clock = new THREE.Clock(),
  marker;
const stowFlights = [], bursts = [];
let stowPulse = 0, crashShake = 0;
const tmpHold = new THREE.Vector3();
// Short-lived particle burst for stows, crashes and pick-ups.
function burst(at, color = "#ffffff", count = 14, size = 0.16, spread = 5) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(at);
    const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2;
    m.userData.v = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(spread * (0.4 + Math.random()));
    m.userData.life = 0.8 + Math.random() * 0.4;
    scene.add(m); bursts.push(m);
  }
}
function tickBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const m = bursts[i];
    m.userData.life -= dt;
    m.userData.v.y -= dt * 6;
    m.position.addScaledVector(m.userData.v, dt);
    m.material.opacity = Math.max(0, m.userData.life);
    if (m.userData.life <= 0) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); bursts.splice(i, 1); }
  }
}
let cine = null, cineLastPhase = "";
// Cinematic overlay (DOM) shared by take-off and landing.
function cineBanner() {
  let el = document.getElementById("cine-banner");
  if (!el) {
    el = document.createElement("div"); el.id = "cine-banner"; el.className = "cine-banner"; el.hidden = true;
    el.innerHTML = '<small></small><b></b><span></span><i><em></em></i>';
    document.body.append(el);
  }
  return el;
}
function startCine(type, planet, title, detail) {
  cine = { type, planet, t: 0, dur: type === "takeoff" ? 4.6 : 3.6, title };
  const el = cineBanner();
  el.querySelector("small").textContent = type === "takeoff" ? "IGNITION" : "DESCENT";
  el.querySelector("b").textContent = title;
  el.querySelector("span").textContent = detail;
  el.hidden = false;
  document.body.classList.add("cine-active");
}
function endCine() { cine = null; cineBanner().hidden = true; document.body.classList.remove("cine-active"); }
function cineAltitude() {
  if (!cine) return 0;
  const k = Math.min(1, cine.t / cine.dur);
  if (cine.type === "takeoff") { const lift = Math.max(0, k - 0.18) / 0.82; return lift * lift * 70; }
  const d = 1 - k; return d * d * 55;
}
function crashFlash(damage, hull) {
  let el = document.getElementById("crash-flash");
  if (!el) { el = document.createElement("div"); el.id = "crash-flash"; el.className = "crash-flash"; document.body.append(el); }
  el.innerHTML = `<b>IMPACT</b><span>−${damage}% HULL · ${hull}% LEFT</span>`;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
}
// Rocky obstacle with jittered faces; reads as solid debris rather than a smooth ball.
function makeAsteroid(seed) {
  const geo = new THREE.IcosahedronGeometry(2.2, 1), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453, j = 0.78 + (n - Math.floor(n)) * 0.42;
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: "#8f7f70", flatShading: true }));
  const warn = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.1, 32), new THREE.MeshBasicMaterial({ color: "#ff6a4d", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  warn.rotation.x = -Math.PI / 2; warn.position.y = -2.4; m.add(warn);
  return m;
}
const avatars = new Map(),
  ships = [],
  samples = [],
  decor = [],
  models = Array.from({ length: 4 }, () => createExpedition(42));
const me = () => latest?.players.find((p) => p.id === id),
  mission = () => (me() ? latest?.missions[me().team] : null);
const positionFor = (p) => {
  const b = mission()?.phase==='flight'?spaceBaseFor(p.team):baseFor(p.team);
  return { x: p.x + b.x, z: p.z + b.z };
};
function renderProfile() {
  if (!profile) return;
  $("profile-label").textContent =
    `CAREER · ${profile.xp} XP · ${profile.credits} CREDITS · ${profile.cosmetic}`;
  if ($("result-profile"))
    $("result-profile").textContent =
      `CAREER · ${profile.xp} XP · ${profile.credits} earned credits · ${profile.matches} matches`;
  $("cosmetics").innerHTML = profile.unlocks
    .map(
      (c) =>
        `<option ${c === profile.cosmetic ? "selected" : ""}>${esc(c)}</option>`,
    )
    .join("");
}
const materialCache = new Map(),
  boxCache = new Map();
function mat(color, emissive = 0) {
  const key = color + ":" + emissive;
  if (!materialCache.has(key)) {
    const m = new THREE.MeshToonMaterial({
      color,
      emissive: color,
      emissiveIntensity: emissive,
    });
    m.userData.tminusShared = true;
    materialCache.set(key, m);
  }
  return materialCache.get(key);
}
function obj(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(parent, x, y, z, w, h, d, color) {
  const key = [w, h, d].join(",");
  if (!boxCache.has(key)) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.userData.tminusShared = true;
    boxCache.set(key, g);
  }
  return obj(parent, boxCache.get(key), mat(color), x, y, z);
}
function ball(parent, x, y, z, r, color) {
  return obj(parent, new THREE.IcosahedronGeometry(r, 1), mat(color), x, y, z);
}
function ring(parent, x, y, z, r, color) {
  const m = obj(
    parent,
    new THREE.RingGeometry(r - 0.06, r, 52),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    }),
    x,
    y,
    z,
  );
  m.rotation.x = -Math.PI / 2;
  m.castShadow = false;
  return m;
}
function cylinder(parent, x, y, z, r1, r2, h, color, sides = 14) {
  return obj(
    parent,
    new THREE.CylinderGeometry(r1, r2, h, sides),
    mat(color),
    x,
    y,
    z,
  );
}
function makeLabel(text, color) {
  const cvs = document.createElement("canvas");
  cvs.width = 256;
  cvs.height = 72;
  const c = cvs.getContext("2d");
  c.fillStyle = "rgba(8,14,26,.83)";
  c.fillRect(5, 8, 246, 57);
  c.strokeStyle = color;
  c.strokeRect(5, 8, 246, 57);
  c.fillStyle = "#f1f7ff";
  c.font = "600 19px sans-serif";
  c.textAlign = "center";
  c.fillText(text.slice(0, 23), 128, 35);
  c.fillStyle = color;
  c.fillRect(5, 60, 246, 5);
  const texture = new THREE.CanvasTexture(cvs);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.3, 0.65, 1);
  sprite.position.y = 3.0;
  return sprite;
}
function makeAvatar(p) {
  const g = new THREE.Group(),
    body = new THREE.Group(),
    color = COLORS[p.team],
    dark = "#354052",
    bone = "#efe6d6";
  g.add(body);
  const torso = cylinder(body, 0, 1.12, 0, 0.34, 0.38, 0.76, color);
  torso.scale.set(1.05, 1, 0.75);
  box(body, 0, 1.15, 0.25, 0.47, 0.34, 0.14, bone);
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sign * 0.43, 1.38, 0);
    body.add(arm);
    cylinder(arm, 0, -0.22, 0, 0.12, 0.12, 0.48, color);
    ball(arm, 0, -0.5, 0.04, 0.14, dark);
    const leg = new THREE.Group();
    leg.position.set(sign * 0.19, 0.75, 0);
    body.add(leg);
    cylinder(leg, 0, -0.3, 0, 0.13, 0.13, 0.53, color);
    box(leg, 0, -0.62, 0.12, 0.27, 0.2, 0.39, dark);
    (g.userData.armParts ??= []).push(arm);
    (g.userData.legParts ??= []).push(leg);
  }
  if (p.role === 0) {
    // frog navigator
    const head = ball(body, 0, 1.97, 0, 0.44, "#88c37e");
    head.scale.set(1.14, 0.85, 0.9);
    for (const s of [-1, 1]) {
      ball(body, s * 0.24, 2.22, -0.02, 0.19, "#a5d598");
      ball(body, s * 0.24, 2.23, 0.13, 0.095, "#fff8ec");
      ball(body, s * 0.24, 2.23, 0.22, 0.043, dark);
    }
  } else if (p.role === 1) {
    box(body, 0, 1.97, 0, 0.68, 0.53, 0.56, "#b7c9d1");
    box(body, 0, 2, 0.3, 0.51, 0.22, 0.055, "#283a56");
    for (const s of [-1, 1])
      box(body, s * 0.15, 2, 0.335, 0.1, 0.095, 0.025, "#8bfbe0");
    cylinder(body, 0.1, 2.38, 0, 0.025, 0.025, 0.3, "#a8cbd6");
    ball(body, 0.1, 2.58, 0, 0.065, color);
  } else if (p.role === 2) {
    ball(body, 0, 1.97, 0, 0.4, "#f3cf62");
    for (const s of [-1, 1]) {
      ball(body, s * 0.16, 2.05, 0.3, 0.1, "#fff7e5");
      ball(body, s * 0.16, 2.05, 0.4, 0.05, dark);
      const wing = ball(body, s * 0.43, 1.45, -0.25, 0.36, "#cce8ef");
      wing.scale.set(0.6, 1.15, 0.18);
    }
  } else {
    cylinder(body, 0, 1.72, 0, 0.105, 0.13, 0.66, "#efb0ae");
    ball(body, 0, 2.2, 0, 0.25, "#efb0ae");
    for (const s of [-1, 1]) {
      ball(body, s * 0.13, 2.25, 0.2, 0.06, "#fff7e5");
      ball(body, s * 0.13, 2.25, 0.25, 0.03, dark);
    }
    const beak = obj(
      body,
      new THREE.ConeGeometry(0.12, 0.36, 8),
      mat("#f5dcb5"),
      0,
      2.11,
      0.36,
    );
    beak.rotation.x = Math.PI / 2;
  }
  const shade = new THREE.Mesh(
    new THREE.CircleGeometry(0.51, 22),
    new THREE.MeshBasicMaterial({
      color: "#1c1a2d",
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.035;
  g.add(shade);
  const label = makeLabel(p.name, color);
  g.add(label);
  const selection = ring(g, 0, 0.06, 0, 0.64, color);
  selection.visible = p.id === id;
  scene.add(g);
  const patch = ball(g, 0.42, 1.4, 0.1, 0.11, "#b7dac3");
  const avatar = {
    g,
    group: g,
    body,
    label,
    selection,
    patch,
    last: { x: p.x, z: p.z },
    animation: 0,
    role: p.role,
    team: p.team,
    weapon: createHeldWeapon(),
  };
  attachSkin(avatar, p.role).catch(() => {});
  return avatar;
}

function socketAddress() {
  const entered = $("server-url").value.trim();
  const guess =
    (location.protocol === "https:" ? "wss:" : "ws:") +
    "//" +
    location.host +
    "/ws";
  const value = entered || guess;
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("Invalid server URL (use wss://domain/ws)");
  }
  if (!["wss:", "ws:"].includes(u.protocol) || u.pathname !== "/ws")
    throw Error("Server endpoint must end with /ws");
  if (location.protocol === "https:" && u.protocol === "ws:")
    throw Error("Secure pages require a wss:// connection");
  return u.href;
}
function setConnection(status, ok = false) {
  $("connection").textContent = status;
  $("connection").classList.toggle("ok", ok);
}
function tell(message, type = "info") {
  toastText = message;
  toastUntil = performance.now() + 3800;
  const el = $("center-message");
  el.textContent = message;
  el.classList.add("visible");
  if (type === "error") el.style.color = "#ffb2a6";
  else el.style.color = "#d8f9df";
}
function send(data) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function connect({ resume = false } = {}) {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState))
    return;
  manualClose = false;
  serverUrl = socketAddress();
  setConnection("CONNECTING");
  ws = new WebSocket(serverUrl);
  ws.onopen = () => {
    alive = true;
    retry = 0;
    setConnection("SERVER ONLINE", true);
  };
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.kind === "hello") {
      send({
        kind: "join",
        mode: "expedition",
        profileToken: readLocal("tminus-profile-key"),
        room: resume ? room : $("join-room").value.trim().toUpperCase() || "",
        name: $("join-name").value.trim(),
        team: Number($("join-team").value),
        role: Number($("join-role").value),
        token: resume ? token : undefined,
      });
      return;
    }
    if (m.kind === "error") {
      if (!joined) {
        $("join-error").textContent = m.message;
        setConnection("JOIN FAILED");
        ws?.close();
        if (resume) {
          joined = false;
          $("join-overlay").hidden = false;
          $("lobby-overlay").hidden = true;
          $("online-hud").hidden = true;
        }
      } else tell(m.message, "error");
      return;
    }
    if (m.kind === "profile") {
      profile = m.profile;
      if (m.profileToken) writeLocal("tminus-profile-key", m.profileToken);
      renderProfile();
      return;
    }
    if (m.kind === "joined") {
      if (m.mode !== "expedition") {
        $("join-error").textContent =
          "This room uses the legacy arena. Open online.html to join it.";
        manualClose = true;
        ws.close();
        return;
      }
      commandSeq = m.commandSeq ?? -1;
      joined = true;
      id = m.id;
      token = m.token;
      room = m.room;
      retry = 0;
      reconnecting = false;
      try {
        sessionStorage.setItem(
          "tminus-expedition-session",
          JSON.stringify({ room, token, server: serverUrl }),
        );
      } catch {}
      $("join-overlay").hidden = true;
      $("hud-room").textContent = room;
      $("lobby-overlay").hidden = false;
      $("join-room").value = room;
      const u = new URL(location.href);
      u.searchParams.set("room", room);
      history.replaceState(null, "", u.href);
      tell(
        m.resumed ? "Back aboard: session restored" : "Connected to live crew",
      );
      return;
    }
    if (m.kind === "snapshot") {
      const oldKey = networkPhaseKey(latest);
      previous = latest;
      latest = m;
      if (oldKey !== networkPhaseKey(m)) resetInput();
      receivedAt = performance.now();
      const mine = m.players.find((p) => p.id === id);
      if (mine) {
        seq = Math.max(seq, mine.sequence);
        commandSeq = Math.max(commandSeq, mine.commandSeq ?? -1);
      }
      if (mine && !selfDisplay.init) {
        selfDisplay.x = mine.x;
        selfDisplay.z = mine.z;
        selfDisplay.init = true;
      }
      if (m.phase === "lobby") {
        $("lobby-overlay").hidden = false;
        $("online-hud").hidden = true;
        $("results-overlay").hidden = true;
        updateLobby(m);
      } else {
        $("lobby-overlay").hidden = true;
        $("online-hud").hidden = false;
        if (m.phase === "results") showResults(m);
        else $("results-overlay").hidden = true;
      }
      return;
    }
    if (m.kind === "chat") {
      addChat(`${m.name}: ${m.text}`, COLORS[m.team] || "#e6efff");
      return;
    }
    if (m.kind === "action-result") {
      if(m.error&&working)lastTask='';
      if (m.error) tell(m.error, "error");
      else if (m.message !== "Work target acquired")
        tell(m.message || "Confirmed");
      return;
    }
  };
  ws.onclose = () => {
    alive = false;
    setConnection("OFFLINE / RETRYING");
    keys.clear();
    shooting = false;
    if (!manualClose && joined) {
      reconnecting = true;
      const delay = Math.min(10000, 700 * 2 ** Math.min(retry++, 4));
      setTimeout(() => {
        if (reconnecting && !alive) {
          try {
            connect({ resume: true });
          } catch (e) {
            tell(e.message, "error");
          }
        }
      }, delay);
    } else if (!manualClose)
      $("join-error").textContent =
        "Cannot reach Node multiplayer server. Launch npm run dev locally or configure a public wss:// backend.";
  };
  ws.onerror = () => setConnection("NETWORK ERROR");
}
function addChat(message, color = "#c4d2e9") {
  const log = $("chat-log");
  const line = document.createElement("div");
  line.textContent = message;
  line.style.color = color;
  log.append(line);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function updateLobby(snapshot) {
  const players = snapshot.players.filter((p) => p.connected);
  const mine = snapshot.players.find((p) => p.id === id);
  $("lobby-room-code").textContent =
    `ROOM ${snapshot.room} · ${players.length}/16 LIVE`;
  const byTeam = new Map(
    TEAMS.map((_, i) => [i, snapshot.players.filter((p) => p.team === i)]),
  );
  $("lobby-roster").innerHTML = TEAMS.map(
    (name, t) =>
      `<article class="team-card"><h3><i style="background:${COLORS[t]}"></i>${name}</h3>${ROLES.map(
        (role, r) => {
          const p = byTeam.get(t).find((p) => p.role === r);
          return `<div class="roster-line"><b>${esc(p?.name || "OPEN SEAT")}</b><small>${role}${p && !p.connected ? " · RESERVED" : ""}${p?.id === id ? " · YOU" : ""}${p?.id === snapshot.hostId ? " · HOST" : ""}${p?.ready ? " · READY" : ""}</small></div>`;
        },
      ).join("")}</article>`,
  ).join("");
  $("ready-button").textContent = mine?.ready ? "READY ✓" : "READY UP";
  $("start-button").disabled =
    snapshot.hostId !== id ||
    players.length < 2 ||
    new Set(players.map((p) => p.team)).size < 2 ||
    players.some((p) => !p.ready);
  $("start-button").textContent =
    snapshot.hostId === id ? "START REAL MATCH ↗" : "WAITING FOR HOST";
  $("lobby-tip").textContent =
    "Two opposing teams and all players READY required. Host: " +
    (players.find((p) => p.id === snapshot.hostId)?.name || "No host") +
    ". Unoccupied slots remain empty; no bots are inserted.";
}
function showResults(s) {
  if (shownResult) return;
  shownResult = true;
  resetInput();
  document.exitPointerLock?.();
  const teams = [...s.teams].sort(
    (a, b) => b.delivered - a.delivered || b.kills - a.kills || a.team - b.team,
  );
  $("result-title").textContent =
    s.winner === null
      ? "DRAW · SHARED FRONTIER"
      : `${TEAMS[s.winner]} WINS THE RACE`;
  $("result-scores").innerHTML = teams
    .map(
      (t, i) =>
        `<div class="results-team ${s.winner === t.team ? "winner" : ""}"><b>#${i + 1} ${esc(t.name)}</b><span>${t.delivered} delivered</span></div>`,
    )
    .join("");
  $("results-overlay").hidden = false;
}

const sharedHelpers = {
  THREE,
  SPECIALISTS,
  SHIP_SCALE,
  SHIP_Y: 0,
  material: (color) => mat(color),
  mesh: (geo, m, parent, x = 0, y = 0, z = 0) => obj(parent, geo, m, x, y, z),
  sphere: (r, c, parent, x = 0, y = 0, z = 0, detail = 16) =>
    obj(parent, new THREE.SphereGeometry(r, detail, 12), mat(c), x, y, z),
  cylinder: (rt, rb, h, c, parent, x = 0, y = 0, z = 0, n = 16) =>
    cylinder(parent, x, y, z, rt, rb, h, c, n),
  box: (w, h, d, c, parent, x = 0, y = 0, z = 0) =>
    box(parent, x, y, z, w, h, d, c),
  glow: (w, h, d, c, parent, x = 0, y = 0, z = 0) =>
    obj(
      parent,
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshToonMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.5,
      }),
      x,
      y,
      z,
    ),
};
// Flight cabin: a walkable deck the size of the logic interior (x ±6, z ±8.5) with real room dressing.
// Engineer and Raider walk it; Pilot and Gunner sit at the helm and turret consoles at the bow.
function stationLabel(text, color) {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 64;
  const c = cvs.getContext("2d");
  c.fillStyle = "rgba(6,12,24,.92)"; c.fillRect(0, 0, 256, 64);
  c.fillStyle = color; c.fillRect(0, 0, 8, 64);
  c.fillStyle = "#f4f8ff"; c.font = "700 30px sans-serif"; c.textAlign = "center"; c.fillText(text, 134, 43);
  const tex = new THREE.CanvasTexture(cvs);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.castShadow = false;
  return m;
}
function glowBox(parent, x, y, z, w, h, d, color, intensity = 0.9) {
  return obj(parent, new THREE.BoxGeometry(w, h, d), mat(color, intensity), x, y, z);
}
function buildCabin(interior, team) {
  const accent = COLORS[team];
  // Deck, kick plates and a centre walkway stripe.
  box(interior, 0, -0.15, 0, 12, 0.3, 17.4, "#2e3146");
  box(interior, 0, 0.005, 0, 2.2, 0.02, 15.6, "#3c4260");
  for (let z = -7; z <= 7; z += 2) box(interior, 0, 0.012, z, 2.4, 0.02, 0.08, accent);
  // Side walls with window bands (stars outside) and handrails.
  for (const sign of [-1, 1]) {
    box(interior, sign * 6.05, 1.6, 0, 0.18, 3.2, 17.4, "#4c5170");
    glowBox(interior, sign * 5.94, 2.05, 0, 0.04, 0.55, 12, "#0d1b3d", 0.5);
    box(interior, sign * 5.85, 1.05, 0, 0.08, 0.08, 15, "#b9c3d6");
    for (let z = -6; z <= 6; z += 3) box(interior, sign * 5.95, 1.6, z, 0.12, 3.2, 0.25, "#5c6283");
  }
  // Bow and stern bulkheads; bow has the forward canopy.
  box(interior, 0, 1.6, -8.75, 12, 3.2, 0.2, "#4c5170");
  glowBox(interior, 0, 2.0, -8.62, 7, 1.0, 0.04, "#14306a", 0.6);
  box(interior, 0, 1.6, 8.75, 12, 3.2, 0.2, "#4c5170");
  // Ceiling beams and light strips so the room never reads as a floating box.
  box(interior, 0, 3.25, 0, 12, 0.12, 17.4, "#252838");
  for (let z = -7.5; z <= 7.5; z += 2.5) { box(interior, 0, 3.12, z, 12, 0.16, 0.22, "#575d7d"); glowBox(interior, 0, 3.02, z, 3.4, 0.04, 0.12, "#dff4ff", 1.2); }
  const light = new THREE.PointLight("#cfe8ff", 9, 16, 1.6); light.position.set(0, 2.8, 0); interior.add(light);
  const light2 = new THREE.PointLight(accent, 4, 10, 1.6); light2.position.set(0, 2.6, -6.5); interior.add(light2);
  // Engineering stations (server colliders: 2.2 x 1.3 boxes).
  const names = { reactor: "REACTOR", coolant: "COOLANT", scrubber: "LIFE SUPPORT", stores: "STORES" };
  const stationViews = {};
  for (const c of SYSTEM_STATIONS) {
    const st = new THREE.Group(); st.position.set(c.x, 0, c.z); interior.add(st);
    box(st, 0, 0.5, 0, 2.2, 1.0, 1.3, "#5a5f7a");
    box(st, 0, 1.02, 0, 2.3, 0.06, 1.4, "#8a91ad");
    const face = Math.sign(-c.x) || 1;      // screens face the walkway
    const screen = glowBox(st, face * 0.2, 1.45, 0, 0.06, 0.6, 1.1, "#2fd1b8", 0.8);
    screen.rotation.z = face * 0.35;
    const lamp = glowBox(st, -face * 0.85, 1.25, 0.5, 0.18, 0.18, 0.18, "#5dff9a", 1.2);
    const label = stationLabel(names[c.id], accent); label.position.set(0, 2.25, 0); label.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; st.add(label);
    stationViews[c.id] = { st, screen, lamp };
  }
  // Helm (Pilot) and turret (Gunner) consoles at the bow, with seats at the crew spawn points.
  const seats = {};
  for (const [role, x, text] of [[0, -1.8, "HELM"], [2, 1.8, "TURRET"]]) {
    const st = new THREE.Group(); st.position.set(x, 0, -7.3); interior.add(st);
    box(st, 0, 0.55, 0, 2.0, 1.1, 0.9, "#5a5f7a");
    const scr = glowBox(st, 0, 1.35, 0.15, 1.6, 0.55, 0.05, role === 0 ? "#6fb2ff" : "#ff9b6a", 0.9); scr.rotation.x = -0.45;
    const label = stationLabel(text, accent); label.position.set(0, 2.25, 0); st.add(label);
    const seat = new THREE.Group(); seat.position.set(x, 0, -5.5); interior.add(seat);
    box(seat, 0, 0.45, 0, 0.8, 0.12, 0.8, "#2b2f42");
    box(seat, 0, 0.95, 0.38, 0.8, 0.9, 0.12, "#2b2f42");
    box(seat, 0, 0.22, 0, 0.18, 0.44, 0.18, "#8a91ad");
    seats[role] = seat;
  }
  // Airlock hatch on the starboard stern (Raider EVA), cargo racks to port.
  const lock = new THREE.Group(); lock.position.set(5.85, 0, 6.2); interior.add(lock);
  box(lock, 0, 1.25, 0, 0.2, 2.5, 1.6, "#7d86a6");
  glowBox(lock, -0.12, 1.25, 0, 0.04, 2.1, 1.2, "#ffb347", 0.35);
  const lockLabel = stationLabel("AIRLOCK", accent); lockLabel.position.set(-0.2, 2.75, 0); lockLabel.rotation.y = -Math.PI / 2; lock.add(lockLabel);
  for (const z of [5.2, 6.4, 7.6]) { box(interior, -5.1, 0.35, z, 1.2, 0.7, 0.9, "#8b6f6c"); box(interior, -5.1, 0.72, z, 1.25, 0.05, 0.95, accent); }
  interior.userData.stations = stationViews;
  interior.userData.seats = seats;
}
function makeShip(team) {
  const b = baseFor(team),
    g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const pad = cylinder(g, 0, -0.12, 0, 28, 28, 0.24, "#424154", 64);
  const groundFixtures=new THREE.Group();g.add(groundFixtures);
  ring(groundFixtures, 0, 0.015, 0, 27, COLORS[team]);
  const { ship: craft, engineFlames } = createSpacecraft(sharedHelpers, g);
  craft.position.y = 1.476;
  const extraGun = box(craft, 0.38, 2.75, -0.3, 0.18, 0.18, 1.4, "#e5cfa9"),
    reservePod = cylinder(craft, 0, 1.1, 2.3, 0.37, 0.37, 1.8, "#e3944d");
  reservePod.rotation.x = Math.PI / 2;
  const extraRack = box(craft, -1.25, 0.5, 2.5, 0.5, 0.2, 1.0, "#a4b9c4");
  const repairPanels=models[team].panels.map(panel=>{const frame=box(g,0,0,0,1.9,.10,1.8,'#dfaa7e'),plate=box(frame,0,.10,0,1.7,.12,1.6,'#a4b3bf');return {id:panel.id,frame,plate};});
  const parts = models[team].parts.map((part) => {
    const shelf = new THREE.Group(),
      outline = new THREE.Group(),
      carry = new THREE.Group();
    g.add(shelf, outline, carry);
    const pos = shelfPoint(models[team], part);
    shelf.position.set(pos.x, 0.9, pos.z);
    const model = createPartModel(sharedHelpers, models[team], part, shelf);
    model.scale.setScalar(0.3);groundObject(model,.24-.9);
    box(groundFixtures, pos.x, 0.12, pos.z, 1.2, 0.24, 1.2, "#a18a73");
    const f = new THREE.BoxGeometry(part.size[0], 0.03, part.size[2]);
    const marker = new THREE.Mesh(
      f,
      new THREE.MeshBasicMaterial({
        color: COLORS[team],
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      }),
    );
    marker.rotation.y = (part.angle * Math.PI) / 2;
    marker.position.set(part.position[0], 0.07, part.position[2]);
    outline.add(marker);
    // Carried modules travel in a two-hand equipment crate with a fitted miniature, sized to the carry pose.
    const scratch = new THREE.Group();
    const mini = createPartModel(sharedHelpers, models[team], part, scratch);
    mini.removeFromParent();
    carry.add(createEquipmentCrate(COLORS[team], mini, { label: part.name.split(" ")[0] }));
    const bolts = [0, 1, 2].map((i) => {
      const [x, y, z] = boltPosition(part, i);
      return ball(g, x, y, z, 0.17, COLORS[team]);
    });
    return { id: part.id, shelf, outline, carry, bolts };
  });
  const cargo = models[team].cargo.map((c) => {
    const o = createEquipmentCrate("#d6b08a", null, { width: 1.15, height: 0.7, depth: 0.7, label: c.name.split(" ")[0] });
    o.position.set(c.position[0], 0.35, c.position[2]);
    g.add(o);
    ring(groundFixtures, c.position[0], 0.03, c.position[2], 1.1, COLORS[team]);
    return o;
  });
  const checks = CHECK_STATIONS.map((c) => {
    const o = box(g, c.x, 0.8, c.z, 0.9, 1.3, 0.7, "#7d7b91");
    ball(groundFixtures, c.x, 1.55, c.z, 0.15, "#a7dbbf");
    return o;
  });
  const receiver = new THREE.Group();
  receiver.position.set(RECEIVER_POINT.x, 0, RECEIVER_POINT.z);
  g.add(receiver);
  cylinder(receiver, 0, 0.1, 0, 2.5, 2.5, 0.2, "#c4a27f", 20);
  ring(receiver, 0, 0.22, 0, 2.3, COLORS[team]);
  ball(receiver, 0, 1.8, 0, 0.5, COLORS[team]);
  const stow = ring(g, STOW_POINT.x, 0.035, STOW_POINT.z, 1.7, "#c6e8a9");
  const load = ring(g, 0, 0.035, -17, 1.7, "#c6e8a9");
  const interior = new THREE.Group();
  g.add(interior);
  buildCabin(interior, team);
  interior.visible = false;
  ships.push({
    team,
    g,
    craft,
    engineFlames,
    extraGun,
    reservePod,
    extraRack,
    pad,groundFixtures,
    parts,repairPanels,
    cargo,
    checks,
    receiver,
    stow,
    load,
    interior,
  });
}
function initWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#252036");
  scene.fog = new THREE.FogExp2("#252036", 0.003);
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.09, 600);
  camera.position.set(0, 110, 150);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight("#f7e6d6", "#48354d", 2.0));
  const sun = new THREE.DirectionalLight("#ffe7be", 3);
  sun.position.set(-45, 100, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -150,
    right: 150,
    top: 145,
    bottom: -145,
    near: 1,
    far: 280,
  });
  sun.shadow.normalBias = 0.012;
  scene.add(sun);
  combatView=createOnlineCombatView(camera,scene);
  root = new THREE.Group();
  scene.add(root);
  ground = obj(
    root,
    new THREE.PlaneGeometry(390, 370),
    new THREE.MeshToonMaterial({ color: "#77766c" }),
    0,
    -0.02,
    0,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  for (let i = 0; i < 4; i++) makeShip(i);
  for (const r of SURFACE_ROCKS) {
    const rock = ball(root, r.x, r.r * 0.7, r.z, r.r, "#cfb899");
    rock.scale.y = 1.4;
    decor.push(rock);
  }
  // Planet B science flags: planted on a cairn, claimed with a 5 s hold, carried upright in one hand.
  for (const [x, z] of FLAG_SITES) {
    const flag = createFlagModel();
    flag.group.position.set(x, 0, z);
    root.add(flag.group);
    samples.push({ g: flag.group, flag });
  }
  const positions = [];
  for (let i = 0; i < 900; i++) {
    const a = i * 2.399963,
      r = 220;
    positions.push(Math.cos(a) * r, 40 + (i % 130), Math.sin(a) * r);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: "#eee4ff", size: 0.25, fog: false }),
  );
  scene.add(stars);
  marker = new THREE.Group();
  scene.add(marker);
  ring(marker, 0, 0.06, 0, 1.2, "#e8c383");
  const pointer = obj(
    marker,
    new THREE.ConeGeometry(0.25, 0.7, 6),
    new THREE.MeshBasicMaterial({ color: "#ffe0a3" }),
    0,
    3,
    0,
  );
  pointer.rotation.z = Math.PI;
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
}
function objective() {
  const p = me(),
    s = mission();
  if (!p || !s || s.finished) return null;
  const model = models[p.team];
  const oldParts = model.parts,
    oldCargo = model.cargo;
  Object.assign(model, s);
  model.parts = oldParts.map((q, i) => ({ ...q, ...s.parts[i] }));
  model.cargo = oldCargo.map((q, i) => ({ ...q, ...s.cargo[i] }));
  const d = (q) => Math.hypot(p.x - q.x, p.z - q.z);
  if (s.phase === "assembly") {
    const part =
      model.parts.find((q) => q.id === s.carry[p.role]) ||
      model.parts.find((q) => q.owner === p.role && q.stage === "positioned") ||
      model.parts.find((q) => q.owner === p.role && q.stage === "shelf");
    if (!part)
      return {
        title: "Crew assembly in progress",
        detail: "Switch to an open role to help",
        op: null,
      };
    if (part.stage === "shelf") {
      const target = shelfPoint(model, part);
      return {
        ...target,
        title: "Pick up " + part.name,
        detail: `${Math.ceil(d(target))} m · E picks up · ${part.price} credits`,
        op: "pick",
        part: part.id,
      };
    }
    if (part.stage === "carried")
      return {
        x: part.position[0],
        z: part.position[2],
        title: "Mount " + part.name,
        detail: `R rotates ${s.rotation[p.role] * 90}° / ${part.angle * 90}° · E mounts at outline`,
        op: "place",
        part: part.id,
      };
    const bolt = Math.max(
        0,
        part.bolts.findIndex((n) => n < 1),
      ),
      [x, y, z] = boltPosition(part, bolt);
    return {
      x,
      z,
      title: `Fasten ${part.name}`,
      detail: `${Math.round(part.bolts[bolt] * 100)}% · bolt ${bolt + 1}/3 · ${Math.ceil(d({ x, z }))} m · hold E / LMB`,
      op: "work",
      target: { type: "bolt", id: part.id, bolt },
    };
  }
  if (s.phase === "outfit") {
    if (s.carry[p.role]?.startsWith("cargo:"))
      return {
        ...STOW_POINT,
        title: "Secure supply case",
        detail: "E at the aft cargo ring",
        op: "stow",
      };
    const cargo = model.cargo.find(
      (q) => !s.cargo.find((c) => c.id === q.id)?.stowed && q.owner === p.role,
    );
    if (cargo)
      return {
        x: cargo.position[0],
        z: cargo.position[2],
        title: "Carry " + cargo.name,
        detail: `${Math.ceil(d({ x: cargo.position[0], z: cargo.position[2] }))} m · E picks up`,
        op: "cargo",
        cargo: cargo.id,
      };
    if (!s.cargo.every((c) => c.stowed))
      return {
        title: "Secure all four supplies",
        detail: "Crew buttons switch into an open role",
      };
    const check = CHECK_STATIONS.find(
      (c) => c.role === p.role && s.checks[c.id] < 1,
    );
    if (check)
      return {
        ...check,
        title: `Calibrate ${check.id} · ${Math.round(s.checks[check.id] * 100)}%`,
        detail: `Reading ${calibration[check.id]} · wheel tunes · hold E`,
        op: "work",
        target: { type: "check", id: check.id, reading: calibration[check.id] },
      };
    return {
      title: "Crew verification in progress",
      detail: "Pilot: engines 68–78 · Engineer: power 45–65, pressure 95–105",
    };
  }
  if (s.phase === "route")
    return {
      title: p.role === 0 ? "Choose a flight route" : "Pilot chooses the route",
      detail: "Compare fuel reserve and hazard exposure below",
    };
  if (s.phase === "flight") {
    if(p.eva){const panel=s.panels?.filter(q=>q.health<60||q.removed).sort((a,b)=>Math.hypot(p.x-s.shipMotion.x-a.offset[0],p.y+1-1.476-a.offset[1],p.z-s.shipMotion.z-a.offset[2])-Math.hypot(p.x-s.shipMotion.x-b.offset[0],p.y+1-1.476-b.offset[1],p.z-s.shipMotion.z-b.offset[2]))[0];
      if(panel)return {x:s.shipMotion.x+panel.offset[0],y:1.476+panel.offset[1],z:s.shipMotion.z+panel.offset[2],title:panel.removed?'Install '+panel.name:'Remove '+panel.name,detail:`O₂ ${Math.round(p.oxygen)}% · spares ${s.spares} · X at airlock boards`,op:panel.removed?'work':'remove-panel',panel:panel.id,target:{type:'panel',id:panel.id}};
      return {x:s.shipMotion.x+EVA.airlock.x,z:s.shipMotion.z+EVA.airlock.z,y:1.476+EVA.airlock.y,title:'Return to the airlock',detail:`Suit O₂ ${Math.round(p.oxygen)}% · X boards the ship`};}
    const damagedPlates=s.panels?.filter(q=>q.health<60).length||0;
    if(p.role===3&&damagedPlates>0)return {...EVA_DOOR,title:`Raider · ${damagedPlates} hull plate${damagedPlates>1?'s':''} damaged`,detail:`Walk to the AIRLOCK · X starts the spacewalk · ${s.spares} spares`,op:null};
    const wreck=latest.flags.find(f=>f.state==='wreck'&&f.planet==='space');
    if(wreck&&p.role===0){const b=spaceBaseFor(p.team);return {x:wreck.position[0]-b.x,z:wreck.position[2]-b.z,title:'Recover exposed cargo',detail:'Fly within 4.5 m and press E · delivery still required',op:'salvage',sample:wreck.id};}
    if (p.role === 0)
      return {
        title: "Pilot · avoid incoming debris",
        detail:
          "WASD maneuvers the spacecraft · route fuel is reserved for return",
      };
    if (p.role === 2)
      return {
        title: "Gunner · clear the flight corridor",
        detail: "Aim with mouse · LMB fires the dorsal turret",
      };
    // Engineer (and Raider when inside) service whichever system needs it most: faults first, then the worst gauge.
    const need = shipNeeds(s), c = need.station;
    return {
      ...c,
      title: (need.urgent ? "⚠ " : "") + need.title,
      detail: `${Math.ceil(d(c))} m · hold E at the ${STATION_NAMES[c.id]} console · ${need.reason}`,
      op: "work",
      target: { type: "system", id: c.id },
    };
  }
  if (s.phase === "surface") {
    if (p.carry !== null)
      return {
        x: 0,
        z: -17,
        title: "Carry the flag to your ship",
        detail: "Walk into the ship area · it stows automatically · G drops",
        op: "load",
      };
    const b = baseFor(p.team),
      w = positionFor(p),
      available = latest.flags
        .filter(
          (f) =>
            ["site", "ground", "wreck"].includes(f.state) && f.planet === "B",
        )
        .sort(
          (a, b) =>
            Math.hypot(a.position[0] - w.x, a.position[2] - w.z) -
            Math.hypot(b.position[0] - w.x, b.position[2] - w.z),
        );
    const f = available[0];
    if (!f)
      return {
        title: "All flags claimed · return to Planet A",
        detail: "Pilot presses N once every carried flag is stowed",
      };
    return {
      x: f.position[0] - b.x,
      z: f.position[2] - b.z,
      title:
        f.state === "site"
          ? "Claim Science Flag " + (f.id + 1)
          : "Recover dropped flag " + (f.id + 1),
      detail: f.state === "site"
        ? `${Math.round(scanFraction(f) * 100)}% · ${Math.ceil(Math.hypot(w.x - f.position[0], w.z - f.position[2]))} m · hold E for 5 s · any crew`
        : `${Math.ceil(Math.hypot(w.x - f.position[0], w.z - f.position[2]))} m · press E to pick up`,
      op: f.state === "site" ? "work" : "recover",
      sample: f.id,
      target: { type: "scan", id: String(f.id) },
    };
  }
  if (s.phase === "delivery")
    return {
      ...RECEIVER_POINT,
      title: "Deliver science on Planet A",
      detail: `${latest.teams[p.team].cargo} onboard · E delivers · finish mission after unloading`,
      op: "deliver",
    };
  return {
    title: "Crew eliminated",
    detail: "Wait for the other expeditions to finish",
  };
}
const STATION_NAMES = { reactor: "REACTOR", coolant: "COOLANT", scrubber: "LIFE SUPPORT", stores: "STORES" };
const EVA_DOOR = { x: 5, z: 6.2 };
function shipNeeds(s) {
  const st = (id) => SYSTEM_STATIONS.find((c) => c.id === id);
  if (s.fault === "reactor" || s.fault === "power") return { station: st("reactor"), title: "Reactor fault", reason: "power generation is cut", urgent: true };
  if (s.fault === "cooling") return { station: st("coolant"), title: "Coolant fault", reason: `cabin ${Math.round(s.temperature)}° and rising`, urgent: true };
  if (s.fault === "scrubber") return { station: st("scrubber"), title: "CO₂ scrubber fault", reason: `CO₂ ${Math.round(s.co2)} ppm`, urgent: true };
  const options = [
    { station: st("coolant"), score: (s.temperature - 45) / 40, title: "Cool the cabin", reason: `${Math.round(s.temperature)}°` },
    { station: st("scrubber"), score: (s.co2 - 900) / 3000, title: "Scrub CO₂", reason: `${Math.round(s.co2)} ppm` },
    { station: st("reactor"), score: 1 - s.power / Math.max(0.1, s.powerCapacity || 4), title: "Charge the batteries", reason: `${(s.power || 0).toFixed(1)} kWh` },
    { station: st("stores"), score: (70 - (s.crewNutrition ?? 100)) / 70, title: "Feed the crew", reason: `nutrition ${Math.round(s.crewNutrition ?? 100)}%` },
  ].sort((a, b) => b.score - a.score);
  return { ...options[0], urgent: options[0].score > 0.6 };
}
function command(data) {
  send({ kind: "action", commandSeq: ++commandSeq, ...data });
}
function use() {
  const target = objective();
  if (!target?.op) return;
  if (target.op === "work") {
    working = true;
    const signature = JSON.stringify(target.target);
    if (signature !== lastTask) {
      lastTask = signature;
      command({ op: "work", target: target.target });
    }
  } else command(target);
}
function resetInput() {
 ads=false;
  keys.clear();
  shooting = false;
  working = false;
  lastTask = "";
  sendInput();
}
function focusObjective() {
  const o = objective(),
    p = me();
  if (!p || !Number.isFinite(o?.x)) return;
  yaw = Math.atan2(o.x - p.x, -(o.z - p.z));
  pitch = 0.1;
}
function hudEl(id, cls, parent = $("online-hud")) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; el.className = cls; parent.append(el); }
  return el;
}
// Always-visible flag tally once the crew can reach Planet B.
function updateFlagCounter(s, p, m) {
  const el = hudEl("flag-counter", "flag-counter glass");
  const show = ["surface", "flight", "delivery"].includes(m.phase) && (m.phase !== "flight" || m.flightLeg === "return" || s.flags.some((f) => f.owner === p.team));
  el.hidden = !show && m.phase !== "surface";
  if (el.hidden) return;
  const mine = s.flags.filter((f) => f.owner === p.team);
  const carried = mine.filter((f) => f.state === "carried").length, onboard = mine.filter((f) => f.state === "onboard").length, delivered = mine.filter((f) => f.state === "delivered").length;
  const left = s.flags.filter((f) => ["site", "ground", "wreck"].includes(f.state) && f.planet === "B").length;
  const html = `<div class="fc-flag" style="--team:${COLORS[p.team]}"></div><div class="fc-main"><small>SCIENCE FLAGS</small><b>${onboard + delivered}<em>/${s.flags.length}</em></b></div><div class="fc-stats"><span><i>${carried}</i>carried</span><span><i>${onboard}</i>aboard</span><span><i>${delivered}</i>delivered</span><span><i>${left}</i>left on B</span></div>`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.classList.toggle("pulse", stowPulse > 0);
}
// Ship operations board while flying: every role has a visible job and you can see who covers it.
function updateShipOps(s, p, m) {
  const el = hudEl("ship-ops", "ship-ops glass");
  el.hidden = m.phase !== "flight";
  if (el.hidden) return;
  const need = shipNeeds(m), plates = m.panels?.filter((q) => q.health < 60).length || 0, hz = m.hazards?.length || 0;
  const rows = [
    ["Pilot", "HELM", `Dodge debris · hull ${Math.round(m.hull)}%`, m.hull < 50],
    ["Engineer", STATION_NAMES[need.station.id], `${need.title} · ${need.reason}`, need.urgent],
    ["Gunner", "TURRET", hz ? `${hz} obstacle${hz > 1 ? "s" : ""} inbound · shoot them` : "Corridor clear", hz > 1],
    ["Raider", plates ? "AIRLOCK" : STATION_NAMES[need.station.id], plates ? `${plates} plate${plates > 1 ? "s" : ""} to replace on EVA` : "Assist the engineer inside", plates > 0],
  ];
  const html = `<div class="eyebrow">SHIP OPERATIONS · ${m.flightLeg === "return" ? "RETURN" : "OUTBOUND"} ${Math.round((m.flightTime / Math.max(1, m.route?.duration ? (m.flightLeg === "return" ? Math.max(20, m.route.duration * 0.55) : m.route.duration) : 100)) * 100)}%</div>` +
    rows.map(([role, where, task, warn], r) => {
      const q = s.players.find((q) => q.team === p.team && q.role === r);
      return `<div class="op-row ${warn ? "warn" : ""} ${r === p.role ? "me" : ""}"><b>${role}</b><span class="op-where">${where}</span><span class="op-task">${esc(task)}</span><small>${q ? esc(q.name) + (q.id === id ? " · YOU" : "") : "OPEN · F" + (r + 1) + " to take"}</small></div>`;
    }).join("");
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}
const htmlCache = new Map();
function setHTML(id, html) {
  if (htmlCache.get(id) !== html) {
    $(id).innerHTML = html;
    htmlCache.set(id, html);
  }
}
function updateHud(s) {
  const p = me();
  if (!p) return;
  const m = s.missions[p.team],
    o = objective();
  $("phase-title").textContent =
    (m.finished ? "MISSION COMPLETE" : m.phase.toUpperCase()) +
    (m.phase === "flight" ? " / " + m.flightLeg.toUpperCase() : "");
  $("mission-title").textContent = o?.title || "CREW EXPEDITION";
  $("mission-instruction").textContent = o?.detail || "Prepare your crew";
  $("hud-room").textContent = s.room;
  $("phase-time").textContent =
    `${Math.floor(s.phaseLeft / 60)}:${String(s.phaseLeft % 60).padStart(2, "0")}`;
  setHTML(
    "module-progress",
    `<div><span>MODULES SECURED</span><b>${m.parts.filter((p) => p.stage === "secured").length}/12</b></div><div><span>FASTENERS</span><b>${m.parts.reduce((n, p) => n + p.bolts.filter((v) => v >= 1).length, 0)}/36</b></div><div><span>SUPPLIES / CHECKS</span><b>${m.cargo.filter((c) => c.stowed).length}/4 · ${Object.values(m.checks).filter((n) => n >= 1).length}/3</b></div><div><span>FUEL / HULL</span><b>${m.propellant.toFixed(1)} kg / ${Math.round(m.hull)}%</b></div><div><span>POWER / HEAT / CO₂</span><b>${m.power.toFixed(1)} kWh / ${Math.round(m.temperature)}° / ${Math.round(m.co2)}</b></div>`,
  );
  setHTML(
    "team-scores",
    s.teams
      .map(
        (t) =>
          `<div class="score-row"><i class="dot" style="background:${t.color}"></i><span>${esc(t.name)}<small>${s.missions[t.team].phase.toUpperCase()} · ${t.cargo} ONBOARD</small></span><b>${t.delivered}</b></div>`,
      )
      .join(""),
  );
  setHTML(
    "team-roster",
    ROLES.map((role, r) => {
      const q = s.players.find((q) => q.team === p.team && q.role === r);
      return `<button data-role="${r}" ${q && q.id !== id ? "disabled" : ""}><b>${esc(q?.name || "TAKE ROLE")}</b><small>F${r + 1} ${role}${q?.id === id ? " · YOU" : ""}</small></button>`;
    }).join(""),
  );
  document.body.dataset.phase = m.phase;
  updateFlagCounter(s, p, m);
  updateShipOps(s, p, m);
  // The bottom prompt only appears when there is something to do within reach; the top card always holds the goal.
  const reach = Number.isFinite(o?.x) ? Math.hypot((o.x ?? 0) - p.x, (o.z ?? 0) - p.z) : Infinity;
  const prompt = document.querySelector(".interaction");
  if (prompt) prompt.classList.toggle("is-near", !!o?.op && reach <= 6);
  $("action-title").textContent = o?.title || "STANDBY";
  $("action-detail").textContent = o?.detail || "";
  $("player-name").textContent = p.name + " / " + ROLES[p.role];
  $("health-label").textContent = p.revive
    ? `REVIVE ${p.revive}s`
    : `${p.hp} HP`;
  $("health-fill").style.width = p.hp + "%";
  setHTML(
    "stage-track",
    ["assembly", "outfit", "route", "flight", "surface", "delivery"]
      .map(
        (stage) =>
          `<span class="${stage === m.phase ? "active" : ""}">${stage.toUpperCase()}</span>`,
      )
      .join(" › "),
  );
  $("expedition-controls").hidden =
    s.phase === "lobby" || s.phase === "results";
  setHTML(
    "route-options",
    m.phase === "route"
      ? ROUTES.map((route) => {
          const budget = routeBudget(models[p.team], route);
          return `<button data-route="${route.id}" ${p.role !== 0 || !budget.valid ? "disabled" : ""}>${esc(route.name)} · Δv ${route.dv} · ${route.duration}s · ${budget.required.toFixed(1)} kg / ${budget.margin.toFixed(1)} kg margin</button>`;
        }).join("")
      : "",
  );
  setHTML(
    "upgrade-options",
    ["assembly", "outfit", "route"].includes(m.phase)
      ? UPGRADES.map(
          (u) =>
            `<button data-upgrade="${u.id}">${m.upgrades.includes(u.id) ? "✓ " : ""}${esc(u.name)} · ${u.cost}</button>`,
        ).join("")
      : "",
  );
  $("eva-toggle").hidden=!(m.phase==='flight'&&p.role===3);$("eva-toggle").textContent=p.eva?'X · BOARD AIRLOCK':'X · EXIT FOR EVA';
  $("finish-mission").hidden =
    m.phase !== "delivery" || s.teams[p.team].cargo > 0;
  for (const evt of s.events) {
    const key = evt.t + "|" + evt.text;
    if (!lastEvents.has(key)) {
      lastEvents.add(key);
      addChat(evt.text, evt.team !== null ? COLORS[evt.team] : "#c9d6f2");
    }
  }
  if (lastEvents.size > 100) lastEvents = new Set([...lastEvents].slice(-40));
}
const hazardViews = new Map();
function networkPhaseKey(s) {
  const p = s?.players.find((p) => p.id === id),
    m = p ? s.missions[p.team] : null;
  return p && m
    ? p.team + ":" + p.role + ":" + m.phase + ":" + m.flightLeg
    : "";
}
function updateWorld(s, dt, now) {
  const p = me();
  if (!p) return;
  const heldQueue = [];
  tickBursts(dt);
  stowPulse = Math.max(0, stowPulse - dt);
  const own = s.missions[p.team];
  // Take-off and landing cinematics: the ship visibly lifts off or sets down before the scene changes.
  if (cineLastPhase && cineLastPhase !== own.phase && !own.finished) {
    const from = cineLastPhase, to = own.phase;
    if (to === "flight" && from === "surface") startCine("takeoff", "B", "LIFT-OFF FROM PLANET B", `${s.flags.filter((f) => f.state === "onboard" && f.owner === p.team).length} flags aboard · returning to Planet A`);
    else if (to === "flight" && (from === "route" || from === "outfit")) startCine("takeoff", "A", "LAUNCH", "Clearing the pad · outbound to Planet B");
    else if (from === "flight" && to === "surface") startCine("landing", "B", "TOUCHDOWN · PLANET B", "Find the science flags · hold E for 5 s to claim");
    else if (from === "flight" && to === "delivery") startCine("landing", "A", "HOME · PLANET A", "Unload the flags at the receiver");
  }
  cineLastPhase = own.phase;
  if (cine) { cine.t += dt; if (cine.t >= cine.dur) endCine(); }
  let planet =
      own.phase === "surface" ? "B" : own.phase === "flight" ? "space" : "A",
    base = own.phase==='flight'?spaceBaseFor(p.team):baseFor(p.team);
  if (cine) { planet = cine.planet; base = baseFor(p.team); }
  const phaseKey =
    p.team + ":" + p.role + ":" + own.phase + ":" + own.flightLeg;
  if (lastPhase !== phaseKey) {
    lastPhase = phaseKey;
    selfDisplay.init = false;
    camera.position.set(base.x + p.x, 5, base.z + p.z + 9);
  }
  ground.visible = planet !== "space";
  ground.material.color.set(planet === "B" ? "#aa775b" : "#77766c");
  decor.forEach((o) => (o.visible = planet === "B"));
  scene.background.set(planet === "space" ? "#111529" : "#30273e");
  for (const ship of ships) {
    const data = s.missions[ship.team],
      model = models[ship.team];
    const oldParts = model.parts,
      oldCargo = model.cargo;
    Object.assign(model, data);
    model.parts = oldParts.map((part, i) => ({ ...part, ...data.parts[i] }));
    model.cargo = oldCargo.map((part, i) => ({ ...part, ...data.cargo[i] }));
    const theirPlanet =
      data.phase === "surface" ? "B" : data.phase === "flight" ? "space" : "A";
    const location=data.phase==='flight'?spaceBaseFor(ship.team):baseFor(ship.team);ship.g.position.set(location.x,0,location.z);ship.g.visible=theirPlanet===planet;
    const cineOwn = cine && ship.team === p.team;
    if (cineOwn) { const b = baseFor(ship.team); ship.g.position.set(b.x, 0, b.z); ship.g.visible = true; }
    ship.extraGun.visible = data.upgrades.includes("weapons");
    ship.reservePod.visible = data.upgrades.includes("reserve");
    ship.extraRack.visible = data.upgrades.includes("cargo");
    ship.pad.visible = planet !== "space";ship.groundFixtures.visible=planet==='A';
    ship.craft.visible =
      !["flight"].includes(data.phase) ||
      p.eva || p.role === 0 ||
      p.role === 2 ||
      ship.team !== p.team;
    ship.interior.visible =
      planet === "space" && ship.team === p.team && [1, 3].includes(p.role)&&!p.eva;
    ship.craft.position.set(
      data.shipMotion.x || 0,
      1.476,
      data.shipMotion.z || 0,
    );
    // Hull impacts: an obstacle that reaches the ship explodes against it, shakes it and knocks it back.
    if (data.phase === "flight" && ship.lastHull !== undefined && data.hull < ship.lastHull - 2.5) {
      const at = new THREE.Vector3(ship.g.position.x + (data.shipMotion.x || 0), 3, ship.g.position.z + (data.shipMotion.z || 0) - 3);
      burst(at, "#ffb15c", 22, 0.28, 9); burst(at, "#7b6f66", 14, 0.4, 6);
      ship.wobble = 1;
      if (ship.team === p.team) { crashShake = 0.9; crashFlash(Math.round(ship.lastHull - data.hull), Math.round(data.hull)); }
    }
    ship.lastHull = data.phase === "flight" ? data.hull : undefined;
    ship.wobble = Math.max(0, (ship.wobble || 0) - dt * 1.6);
    ship.craft.rotation.z = Math.sin(now / 28) * 0.22 * ship.wobble;
    ship.craft.rotation.x = Math.sin(now / 41) * 0.12 * ship.wobble;
    if (cineOwn) {
      ship.craft.position.set(0, 1.476 + cineAltitude(), 0);
      ship.craft.visible = true; ship.interior.visible = false;
      ship.craft.rotation.z = Math.sin(now / 90) * 0.02;
    }
    for(const item of ship.repairPanels||[]){const panel=data.panels?.find(p=>p.id===item.id);item.frame.visible=data.phase==='flight'&&!!panel;if(panel){item.frame.position.set(data.shipMotion.x+panel.offset[0],1.476+panel.offset[1],data.shipMotion.z+panel.offset[2]);item.plate.visible=!panel.removed;item.plate.material=mat(panel.health<60?'#ce6e6e':'#a4b3bf');}}
    ship.engineFlames.forEach((f) => (f.visible = planet === "space" || (cineOwn && cineAltitude() > 0.05) || (cineOwn && cine.type === "takeoff")));
    ship.pad.visible = ship.pad.visible || cineOwn;
    ship.craft.children.forEach((o) => {
      const part = model.parts.find((part) => part.id === o.userData.partId);
      if (part)
        o.visible =
          data.phase !== "assembly" ||
          ["positioned", "secured"].includes(part.stage);
    });
    for (const v of ship.parts) {
      const part = model.parts.find((q) => q.id === v.id);
      v.shelf.visible = data.phase === "assembly" && part.stage === "shelf";
      v.outline.visible =
        data.phase === "assembly" &&
        part.owner === p.role &&
        ship.team === p.team &&
        ["shelf", "carried"].includes(part.stage);
      v.carry.visible = data.phase === "assembly" && part.stage === "carried";
      const carrier = s.players.find(
        (q) => q.team === ship.team && q.role === part.owner,
      );
      if (carrier && v.carry.visible) heldQueue.push({ object: v.carry, playerId: carrier.id, kind: "two" });
      if (carrier) {
        v.carry.position.set(
          carrier.x + Math.sin(carrier.aim) * 0.8,
          1.1,
          carrier.z - Math.cos(carrier.aim) * 0.8,
        );
        v.carry.rotation.y =
          carrier.aim + (model.rotation[part.owner] * Math.PI) / 2;
      }
      v.bolts.forEach((bolt, i) => {
        bolt.visible = data.phase === "assembly" && part.stage === "positioned";
        bolt.material = mat(part.bolts[i] >= 1 ? "#b8eab0" : COLORS[ship.team]);
      });
    }
    ship.cargo.forEach((o, i) => {
      const cargo = model.cargo[i];
      o.visible = data.phase === "outfit" && !data.cargo[i].stowed;
      const carrier = s.players.find(
        (q) =>
          q.team === ship.team && data.carry[q.role] === "cargo:" + cargo.id,
      );
      if (carrier) {
        o.position.set(
          carrier.x + Math.sin(carrier.aim) * 0.8,
          1.0,
          carrier.z - Math.cos(carrier.aim) * 0.8,
        );
        if (o.visible) heldQueue.push({ object: o, playerId: carrier.id, kind: "two" });
      } else { o.position.set(cargo.position[0], 0.35, cargo.position[2]); o.rotation.set(0, 0, 0); }
    });
    ship.checks.forEach((o) => (o.visible = data.phase === "outfit"));
    ship.stow.visible = data.phase === "outfit";
    ship.load.visible = data.phase === "surface";
    ship.receiver.visible = data.phase === "delivery";
  }
  for (let i = 0; i < samples.length; i++) {
    const f = s.flags[i],
      v = samples[i];
    v.g.visible = false;
    const prevState = v.state;
    v.state = f.state;
    // Auto-stow: a flag that just went carried -> onboard flies into the hatch.
    if (prevState === "carried" && f.state === "onboard" && planet === "B" && v.g.visible !== undefined) {
      const owner = s.missions[f.owner] ? f.owner : p.team;
      const b = baseFor(owner);
      stowFlights.push({ v, from: v.g.position.clone(), to: new THREE.Vector3(b.x, 3.2, b.z - 2), t: 0, team: f.owner });
      if (f.owner === p.team) { stowPulse = 1.2; tell(`FLAG STOWED · ${s.flags.filter((q) => q.state === "onboard" && q.owner === p.team).length} ONBOARD`, "success"); }
    }
    if (stowFlights.some((x) => x.v === v)) { v.g.visible = true; continue; }
    v.flag.setCarried(false);
    v.flag.setProgress(0);
    v.g.scale.setScalar(1);
    if (
      planet === "B" &&
      ["site", "ground", "wreck"].includes(f.state) &&
      f.planet === "B"
    ) {
      v.g.visible = true;
      v.g.position.set(f.position[0], 0, f.position[2]);
      v.g.rotation.set(0, 0, 0);
      v.flag.setColor(f.scanner !== null && f.scanner !== undefined ? COLORS[f.scanner] : f.state === "site" ? "#f2e7c9" : "#ffb36b");
      v.flag.setProgress(scanFraction(f));
    } else if (planet === "B" && f.state === "carried") {
      const carrier = s.players.find(
        (q) => q.team === f.owner && q.role === f.carrier,
      );
      if (carrier) {
        const w = positionFor(carrier);
        v.g.visible = true;
        v.flag.setCarried(true);
        v.flag.setColor(COLORS[f.owner]);
        v.g.scale.setScalar(0.62);
        v.g.position.set(w.x + 0.4, 0.6, w.z);
        heldQueue.push({ object: v.g, playerId: carrier.id, kind: "flag" });
      }
    } else if (
      f.state === "onboard" &&
      shipPlanet(s.missions[f.owner]) === planet && planet !== "space"
    ) {
      // Stowed flags fly from a rack on the ship's flank so the count is visible in the world too.
      const b = baseFor(f.owner),
        list = s.flags.filter(
          (q) => q.state === "onboard" && q.owner === f.owner,
        ),
        index = list.indexOf(f);
      v.g.visible = true;
      v.flag.setCarried(true);
      v.flag.setColor(COLORS[f.owner]);
      v.g.scale.setScalar(0.55);
      v.g.position.set(
        b.x + (index % 2 ? 1 : -1) * 4.2,
        1.2,
        b.z + 3 + Math.floor(index / 2) * 0.9,
      );
    } else if (f.state === "delivered" && planet === "A") {
      const b = baseFor(f.owner);
      v.g.visible = true;
      v.flag.setCarried(false);
      v.flag.setColor(COLORS[f.owner]);
      v.g.position.set(b.x + (f.id % 4) * 1.6 - 2.4, 0, b.z + 40 + Math.floor(f.id / 4) * 1.6);
    }
    if (v.g.visible) v.flag.update(dt);
  }
  for (let i = stowFlights.length - 1; i >= 0; i--) {
    const fl = stowFlights[i];
    fl.t += dt / 0.9;
    const k = Math.min(1, fl.t), arc = Math.sin(k * Math.PI) * 4;
    fl.v.g.position.lerpVectors(fl.from, fl.to, k);
    fl.v.g.position.y += arc;
    fl.v.g.rotation.y += dt * 9;
    fl.v.g.scale.setScalar(0.62 * (1 - k * 0.7));
    fl.v.flag.update(dt, 6);
    if (k >= 1) {
      stowFlights.splice(i, 1);
      burst(fl.to, COLORS[fl.team] || "#ffffff");
    }
  }
  const interpolated = previous
      ? interpolateSnapshots(
          previous,
          s,
          limit((now - receivedAt) / 100, 0.05, 1),
        )
      : s.players,
    current = new Map(interpolated.map((q) => [q.id, q])),
    seen = new Set();
  for (const q of s.players) {
    seen.add(q.id);
    let a = avatars.get(q.id);
    if (a && (a.role !== q.role || a.team !== q.team)) {
      removeAvatar(a);
      avatars.delete(q.id);
      a = null;
    }
    if (!a) {
      a = makeAvatar(q);
      avatars.set(q.id, a);
    }
    const pos = current.get(q.id) || q,
      b = s.missions[q.team].phase==='flight'?spaceBaseFor(q.team):baseFor(q.team);
    a.g.visible =
      q.connected && q.hp > 0 && shipPlanet(s.missions[q.team]) === planet;
    // In space, crew inside a ship are only drawn for crew who are inside that same cabin; otherwise they
    // would poke through the hull. Spacewalkers are always drawn.
    if (planet === "space" && !q.eva) {
      const viewerInside = !cine && [1, 3].includes(p.role) && !p.eva && q.team === p.team;
      if (!viewerInside) a.g.visible = false;
    }
    const moveDist = Math.hypot(
      a.g.position.x - (pos.x + b.x),
      a.g.position.z - (pos.z + b.z),
    );
    const blend = moveDist > 8 ? 1 : 1 - Math.exp(-dt * 15);
    a.g.position.x = THREE.MathUtils.lerp(a.g.position.x, pos.x + b.x, blend);
    a.g.position.z = THREE.MathUtils.lerp(a.g.position.z, pos.z + b.z, blend);
    a.g.position.y = q.y||0;
    if (s.missions[q.team].phase === "flight" && !q.eva && [0, 2].includes(q.role)) {
      // Pilot and Gunner sit at the bow consoles facing forward.
      a.g.position.set(b.x + (q.role === 0 ? -1.8 : 1.8), 0.08, b.z - 5.5);
    }
    const speed = Math.min(
      8,
      Math.hypot(a.g.position.x - a.last.x, a.g.position.z - a.last.z) /
        Math.max(dt, 0.001),
    );
    const mvx = a.g.position.x - a.last.x, mvz = a.g.position.z - a.last.z;
    a.g.rotation.y = s.missions[q.team].phase === "flight" && !q.eva && [0, 2].includes(q.role)
      ? Math.PI
      : smoothFacing(a.g.rotation.y, q.aim + Math.PI, dt, 15);
    const heldKind = s.missions[q.team].carry[q.role]
      ? (String(s.missions[q.team].carry[q.role]).startsWith("cargo:") ? "heavy" : "heavy")
      : q.carry !== null && q.carry !== undefined ? "light" : "none";
    const seated = s.missions[q.team].phase === "flight" && !q.eva && [0, 2].includes(q.role);
    let animState = stateFor(speed, { carrying: heldKind, crouch: q.crouch, interacting: q.working, airborne: !q.eva && (q.y || 0) > .03 });
    if (seated) animState = "seated";
    if (a.lastHeld !== heldKind && heldKind !== "none" && a.skin) a.skin.playOnce("pickup", 0.55);
    a.lastHeld = heldKind;
    a.skin?.setState(animState, speed);
    // Head follows the direction of travel (or the aim pitch when standing still).
    if (a.skin?.setLook) {
      let headYaw = 0;
      if (speed > 0.6) {
        const travel = Math.atan2(mvx, mvz), diff = Math.atan2(Math.sin(travel - a.g.rotation.y), Math.cos(travel - a.g.rotation.y));
        headYaw = Math.abs(diff) < 1.9 ? diff * 0.8 : 0;
      }
      a.skin.setLook(headYaw, seated ? 0 : (q.aimPitch || 0) * 0.6);
    }
    a.skin?.mixer.update(dt);a.skin?.ground?.(dt,{grounded:!q.eva&&(q.y||0)<.03,speed,floorAt:()=>0});
    a.heldKind = heldKind;
    // Surface crews carry their blaster in the right hand in third person (first person uses the view model).
    if (a.weapon) {
      if (a.skin?.socket && a.weapon.group.parent !== a.skin.socket) a.skin.socket.add(a.weapon.group);
      const armed = s.missions[q.team].phase === "surface" && heldKind === "none" && !!a.skin?.socket;
      a.weapon.group.visible = armed;
      if (armed) a.weapon.setSlot(q.loadout?.current || 0);
    }
    a.last.x = a.g.position.x;
    a.last.z = a.g.position.z;
    if (
      q.id === id &&
      (view === "first" || (planet === "space" && [0, 2].includes(p.role)))
    )
      a.g.visible = false;
    a.patch.visible = q.cosmetic !== "Cadet";
    a.patch.material = mat(q.cosmetic === "Vanguard" ? "#e8be73" : "#a5ddbe");
    a.label.visible = q.id !== id && a.g.visible && camera.position.distanceTo(a.g.position) < 45;
    a.selection.visible = q.id === id && view === "third";
  }
  for (const [pid, a] of avatars)
    if (!seen.has(pid)) {
      removeAvatar(a);
      avatars.delete(pid);
    }
  // Carried things sit in the carrier's hands: crates between both palms, flags upright in the right palm.
  for (const h of heldQueue) {
    const a = avatars.get(h.playerId);
    if (!a || !a.g.visible) continue;
    a.g.updateMatrixWorld(true);
    holdPoint(a, h.kind === "flag" ? "one" : "two", tmpHold);
    if (h.kind === "flag") tmpHold.y -= 0.85 * h.object.scale.y;   // grip the pole a third of the way up
    placeAtWorld(h.object, tmpHold, a.g.rotation.y);
  }
  const cabinView = planet === "space" && [1, 3].includes(p.role) && !p.eva;
  const activeHazards = planet === "space" && !cabinView ? own.hazards : [],
    ids = new Set(activeHazards.map((h) => h.id));
  for (const h of activeHazards) {
    let m = hazardViews.get(h.id);
    if (!m) {
      m = makeAsteroid(h.id);
      scene.add(m);
      hazardViews.set(h.id, m);
    }
    m.position.set(base.x + h.x, 3, base.z + h.z);
    m.rotation.y += dt * 0.6;
    m.rotation.x += dt * 0.35;
  }
  for (const [hid, m] of hazardViews)
    if (!ids.has(hid)) {
      if (planet === "space") burst(m.position.clone(), "#c9b49a", 12, 0.3, 7);
      disposeDetachedTree([m]);
      m.removeFromParent();
      hazardViews.delete(hid);
    }
  if (cine) {
    // Orbiting chase camera around the pad while the ship rises or sets down.
    const k = Math.min(1, cine.t / cine.dur), alt = cineAltitude();
    const ang = -0.6 + k * 1.1, dist = 34 + k * 10;
    const target = new THREE.Vector3(base.x, 1.476 + alt * 0.85 + 4, base.z);
    camera.position.set(base.x + Math.sin(ang) * dist, 6 + alt * 0.55, base.z + Math.cos(ang) * dist);
    camera.lookAt(target);
    if (Math.random() < dt * 22 && alt < 18) burst(new THREE.Vector3(base.x + (Math.random() - 0.5) * 8, 0.4, base.z + (Math.random() - 0.5) * 8), planet === "B" ? "#c8946c" : "#a9a69a", 3, 0.35, 5);
    marker.visible = false;
    combatView?.update(s, p, { dt, yaw, pitch, viewMode: "third", ads: false, crouch: false, base, ship: { ...own.shipMotion, y: 1.476 }, objective: null });
    return;
  }
  const a = avatars.get(id);
  if (!a) return;
  const spacePilot = planet === "space" && [0, 2].includes(p.role),
    head = new THREE.Vector3(
      spacePilot ? base.x + own.shipMotion.x : a.g.position.x,
      spacePilot ? 9.5 : a.g.position.y+(crouch?1.2:2.05),
      spacePilot ? base.z + own.shipMotion.z : a.g.position.z,
    );
  const inCabin = planet === "space" && !spacePilot && !p.eva;
  const distance = view === "first" ? 0 : spacePilot ? 27 : inCabin ? 4.8 : 8,
    vertical = Math.sin(pitch) * distance + (inCabin ? 0.4 : 1.0);
  const desired = new THREE.Vector3(
    head.x - Math.sin(yaw) * distance,
    head.y + vertical,
    head.z + Math.cos(yaw) * distance,
  );
  const colliders = expeditionColliders(models[p.team]);
  const localFrom = { x: head.x - base.x, y:head.y, z: head.z - base.z },
    localTo = { x: desired.x - base.x, y:desired.y, z: desired.z - base.z };
  const fraction = spacePilot||p.eva
    ? 1
    : cameraBoomFraction(
        localFrom,
        localTo,
        colliders.boxes,
        colliders.circles,
      );
  desired.lerp(head, 1 - fraction);
  if (inCabin) {
    // Keep the chase camera under the ceiling and inside the bulkheads so the cabin reads as a room.
    desired.y = Math.min(desired.y, 2.95);
    desired.x = Math.max(base.x - 5.6, Math.min(base.x + 5.6, desired.x));
    desired.z = Math.max(base.z - 8.3, Math.min(base.z + 8.3, desired.z));
  }
  camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
  if (view === "first")
    camera.lookAt(
      head.x + Math.sin(yaw) * 20,
      head.y - Math.sin(pitch) * 20,
      head.z - Math.cos(yaw) * 20,
    );
  else camera.lookAt(head);
  if (crashShake > 0) {
    crashShake = Math.max(0, crashShake - dt * 1.8);
    camera.position.x += (Math.random() - 0.5) * crashShake * 0.9;
    camera.position.y += (Math.random() - 0.5) * crashShake * 0.6;
  }
  const obj = objective();combatView?.update(s,p,{dt,yaw,pitch,viewMode:view,ads,crouch,base,ship:{...own.shipMotion,y:1.476},objective:obj});document.querySelector('.crosshair').hidden=own.phase==='surface';
  marker.visible = Number.isFinite(obj?.x) && (planet !== "space"||p.eva);
  if (marker.visible) marker.position.set(base.x + obj.x, obj.y||0, base.z + obj.z);
}
function shipPlanet(s) {
  return s.phase === "surface" ? "B" : s.phase === "flight" ? "space" : "A";
}
function removeAvatar(a) {
  a.skin?.dispose();
  a.g.removeFromParent();
  disposeDetachedTree(
    [a.g],
    (r) => r.userData?.tminusAssetShared || r.userData?.tminusShared,
  );
}
function intent() {
  if (
    isTyping() ||
    !$("join-overlay").hidden ||
    !$("lobby-overlay").hidden ||
    !$("help-overlay").hidden ||
    !$("results-overlay").hidden ||
    document.hidden
  )
    return { x: 0, z: 0 };
  const x = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0),
    z = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0),
    a = x * Math.cos(yaw) + z * Math.sin(yaw),
    b = x * Math.sin(yaw) - z * Math.cos(yaw),
    n = Math.max(1, Math.hypot(a, b));
  return { x: a / n, z: b / n };
}
function sendInput() {
  if (!joined || !alive) return;
  if (working) {
    const o = objective();
    if (o?.op === "work") {
      const signature = JSON.stringify(o.target);
      if (lastTask !== signature) {
        lastTask = signature;
        command({ op: "work", target: o.target });
      }
    }
  }
  const { x, z } = intent();
  send({
    kind: "input",
    v: 1,
    sequence: ++seq,
    strafe: x,
    forward: z,
    buttons:
      (shooting ? 1 : 0) | (keys.has("shift") ? 2 : 0) | (working ? 4 : 0) | (keys.has(" ")?8:0),
    aim: yaw,aimPitch:pitch,vertical:(keys.has(" ")?1:0)-(keys.has("control")?1:0),ads,crouch,
  });
}
let lastRender = 0;
function loop() {
  requestAnimationFrame(loop);
  if (document.hidden) return;
  const dt = Math.min(0.05, clock.getDelta()),
    now = performance.now();
  if (joined && latest) {
    updateWorld(latest, dt, now);
    if (now - lastHud > 250) {
      updateHud(latest);
      lastHud = now;
    }
  }
  if (toastText && now > toastUntil) {
    $("center-message").classList.remove("visible");
    toastText = "";
  }
  if (latest?.phase === "expedition" || now - lastRender > 500) {
    renderer.render(scene, camera);
    lastRender = now;
  }
}
function initInputs() {
  addEventListener("keydown", (e) => {
    if (isTyping()) {
      if (e.key === "Escape") document.activeElement.blur();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "enter" && joined) {
      resetInput();
      $("chat-input").focus();
      e.preventDefault();
      return;
    }
    if (["w", "a", "s", "d", "shift", " ", "control"].includes(k)) {
      keys.add(k);if(k===' ')sendInput();
      e.preventDefault();
    }
    if (e.repeat) return;
    if (k === "e") {
      if(getPreferences().holdToggle&&working){working=false;lastTask='';}else use();
      e.preventDefault();
    }
    if (k === "r") command({ op: mission()?.phase==='surface'?'reload':'rotate' });
    if(['1','2','3'].includes(k)&&mission()?.phase==='surface')command({op:'weapon',slot:Number(k)-1});
    if(k==='c')crouch=!crouch;if(k==='x')command({op:'eva'});if(k==='q'||k==='f')command({op:'ability',slot:k});
    if (k === "g") command({ op: "drop" });
    if (k === "n") command({ op: "return" });
    if (k === "b") focusObjective();
    if (k === "v") view = view === "first" ? "third" : "first";
    if (/^f[1-4]$/.test(k)) {
      e.preventDefault();
      resetInput();
      send({ kind: "seat", team: me()?.team, role: Number(k[1]) - 1 });
    }
    if (k === "escape") { resetInput(); document.exitPointerLock?.(); }
  });
  addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());if(e.key===' ')sendInput();
    if (e.key.toLowerCase() === "e"&&!getPreferences().holdToggle) {
      working = false;
      lastTask = "";
      sendInput();
    }
  });
  addEventListener("blur", resetInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetInput();
  });
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== canvas) resetInput();
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (!joined || latest?.phase !== "expedition") return;
    combatView?.sfx.resume();if(e.button===2)ads=true;if(e.button===1)command({op:mission()?.phase==='surface'?'grenade':'ability',slot:'alt'});
    if (e.button === 0) {
      const s = mission();
      if (s?.phase === "surface" || (s?.phase === "flight" && me()?.role === 2))
        shooting = true;
      else use();
    }
    sendInput();
    try {
      canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {}
  });
  addEventListener("pointerup", (e) => {
    if(e.button===2)ads=false;
    if (e.button === 0) {
      shooting = false;
      working = false;
      lastTask = "";
      sendInput();
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas || e.buttons === 2) {
      yaw = Math.atan2(
        Math.sin(yaw + e.movementX * 0.0028*getPreferences().sensitivity),
        Math.cos(yaw + e.movementX * 0.0028*getPreferences().sensitivity),
      );
      pitch = limit(pitch + e.movementY * 0.002*getPreferences().sensitivity*(getPreferences().invertY?-1:1), -0.9, 1.1);
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const o = objective();
      if (o?.target?.type === "check") {
        const id = o.target.id;
        calibration[id] = limit(
          calibration[id] + (e.deltaY < 0 ? 5 : -5),
          0,
          id === "pressure" ? 120 : 100,
        );
        lastTask = "";
      } else if (mission()?.carry[me()?.role]) command({ op: "rotate" });
    },
    { passive: false },
  );
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    send({ kind: "chat", text: $("chat-input").value.trim() });
    $("chat-input").value = "";
    $("chat-input").blur();
  });
  mountPreferences(document.querySelector('.help-card'));
  mountAccountUI(document.querySelector('.join-card'),{endpoint:socketAddress,getToken:()=>readLocal('tminus-profile-key'),setIdentity:identity=>{writeLocal('tminus-profile-key',identity.profileToken);profile=identity.profile;renderProfile();},onLogout:()=>{try{localStorage.removeItem('tminus-profile-key');}catch{}profile=null;$('profile-label').textContent='GUEST · CONNECT TO PLAY';}});
  $("controls-toggle").onclick = () => {
    $("help-overlay").hidden = false;
    resetInput();
    document.exitPointerLock?.();
  };
  $("help-close").onclick = () => {
    $("help-overlay").hidden = true;
  };
  $("join-button").onclick = () => {
    try {
      $("join-error").textContent = "";
      joined = false;
      room = null;
      token = null;
      shownResult = false;
      connect();
    } catch (e) {
      $("join-error").textContent = e.message;
    }
  };
  $("ready-button").onclick = () =>
    send({ kind: "ready", value: !me()?.ready });
  $("start-button").onclick = () => send({ kind: "start" });
  $("copy-invite").onclick = async () => {
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    if (serverUrl) u.searchParams.set("server", serverUrl);
    try {
      await navigator.clipboard.writeText(u.href);
      tell("Invite copied");
    } catch {
      tell(u.href);
    }
  };
  $("back-lobby").onclick = () => {
    manualClose = true;
    ws?.close();
    try {
      sessionStorage.removeItem("tminus-expedition-session");
    } catch {}
    location.assign("expedition.html");
  };
  $("team-roster").onclick = (e) => {
    const b = e.target.closest("[data-role]");
    if (b) {
      resetInput();
      send({ kind: "seat", team: me()?.team, role: Number(b.dataset.role) });
    }
  };
  $("expedition-controls").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.route) command({ op: "launch", route: b.dataset.route });
    if (b.dataset.upgrade)
      command({
        op: "upgrade",
        upgrade: b.dataset.upgrade,
        enabled: !mission().upgrades.includes(b.dataset.upgrade),
      });
  };
  $("focus-objective").onclick = focusObjective;
  $("eva-toggle").onclick=()=>command({op:'eva'});
  $("finish-mission").onclick = () => command({ op: "finish" });
  $("quality").onchange = () => {
    renderer.shadowMap.enabled = $("quality").value !== "low";
    renderer.setPixelRatio(
      $("quality").value === "low" ? 1 : Math.min(devicePixelRatio, 1.25),
    );
  };
  $("cosmetics").onchange = () =>
    send({ kind: "cosmetic", cosmetic: $("cosmetics").value });
  const params = new URLSearchParams(location.search);
  if (params.get("room"))
    $("join-room").value = params.get("room").toUpperCase().slice(0, 8);
  if (params.get("server")) $("server-url").value = params.get("server");
  let old = null;
  try {
    old = sessionStorage.getItem("tminus-expedition-session");
  } catch {}
  if (
    old &&
    (params.get("resume") === "1" ||
      performance.getEntriesByType?.("navigation")[0]?.type === "reload")
  )
    try {
      const saved = JSON.parse(old);
      room = saved.room;
      token = saved.token;
      $("server-url").value = saved.server;
      connect({ resume: true });
    } catch {}
  setInterval(sendInput, 50);
}
try {
  initWorld();
  initInputs();
  if(new URLSearchParams(location.search).has('dev'))window.__expeditionDebug={avatars,samples,ships,get latest(){return latest;},get view(){return view;},camera};
  if(new URLSearchParams(location.search).has('dev'))window.__expeditionDiagnostics=()=>({render:{...renderer.info.render},memory:{...renderer.info.memory},...estimateSceneMemory(scene),avatars:[...avatars.values()].map(a=>({species:a.skin?.species,legs:a.skin?.grounding.legs.length})),phase:mission()?.phase});
  loop();
} catch (e) {
  $("join-error").textContent = "Game initialization failed: " + e.message;
  console.error(e);
}
