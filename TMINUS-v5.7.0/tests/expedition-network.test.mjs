import test from "node:test";
import assert from "node:assert/strict";
import { ExpeditionMatch } from "../server/expedition-match.mjs";
import { ProgressionStore } from "../server/progression-store.mjs";
import {
  shelfPoint,
  STOW_POINT,
  RECEIVER_POINT,
  CHECK_STATIONS,
  baseFor,
} from "../dist/expedition-network.js";
import { boltPosition } from "../dist/build-guide.js";
import { conservation } from "../dist/science-match.js";
import { findPath } from "../dist/crew-navigation.js";
import { blocked, movePlanar, recoverPlanar } from "../dist/motion-physics.js";
import { hullBoxes, partBoxes, HULL, DOOR } from "../dist/hull-collision.js";
const step = (m, n = 3) => {
  for (let i = 0; i < n; i++) m.tick();
};
const players = (m) => [...m.players.values()];
const at = (p, q) => {
  p.x = q.x;
  p.z = q.z;
};
function action(m, p, data) {
  step(m, 3);
  p.commandSeq ??= -1;
  return m.action(p.id, { commandSeq: p.commandSeq + 1, ...data });
}
function work(m, p, target, seconds = 2.5) {
  assert.ok(action(m, p, { op: "work", target }).ok);
  for (let i = 0; i < seconds * 20; i++) {
    p.input = { strafe: 0, forward: 0, buttons: 4 };
    p.lastInputAt = m.time;
    m.tick();
  }
  p.input.buttons = 0;
}
function build(m, team) {
  const s = m.missions[team];
  for (const part of s.parts) {
    const p = players(m).find((p) => p.team === team && p.role === part.owner);
    at(p, shelfPoint(s, part));
    assert.ok(
      action(m, p, { op: "pick", part: part.id }).ok,
      part.id + " pick",
    );
    while (s.rotation[p.role] !== part.angle)
      assert.ok(action(m, p, { op: "rotate" }).ok);
    const c = m.colliders(p);
    at(
      p,
      recoverPlanar(
        part.position[0],
        part.position[2],
        c.boxes,
        c.circles,
        0.6,
      ),
    );
    const placed = action(m, p, { op: "place" });
    assert.ok(
      placed.ok,
      part.id +
        " place " +
        JSON.stringify({
          placed,
          x: p.x,
          z: p.z,
          position: part.position,
          rotation: s.rotation[p.role],
          angle: part.angle,
          carry: s.carry[p.role],
        }),
    );
    for (let bolt = 0; bolt < 3; bolt++) {
      const [x, , z] = boltPosition(part, bolt);
      at(p, { x, z });
      work(m, p, { type: "bolt", id: part.id, bolt }, 0.8);
    }
    assert.equal(part.stage, "secured", part.id);
  }
  assert.equal(s.phase, "outfit");
  for (const cargo of s.cargo) {
    const p = players(m).find((p) => p.team === team && p.role === cargo.owner);
    at(p, { x: cargo.position[0], z: cargo.position[2] });
    assert.ok(action(m, p, { op: "cargo", cargo: cargo.id }).ok);
    at(p, STOW_POINT);
    assert.ok(action(m, p, { op: "stow" }).ok);
  }
  for (const c of CHECK_STATIONS) {
    const p = players(m).find((p) => p.team === team && p.role === c.role);
    at(p, c);
    work(m, p, {
      type: "check",
      id: c.id,
      reading: { engine: 73, power: 55, pressure: 101.3 }[c.id],
    });
  }
  assert.equal(s.phase, "route");
}
function room16(options = {}) {
  const m = new ExpeditionMatch(options);
  for (let team = 0; team < 4; team++)
    for (let role = 0; role < 4; role++) {
      const p = m.join({ team, role, name: `crew-${team}-${role}` }).player;
      m.ready(p.id, true);
    }
  assert.ok(m.start(players(m)[0].id).ok);
  return m;
}

test("16 specialist seats complete shared construction, supplies, checks, travel, science, return and delivery", () => {
  const m = room16();
  for (let team = 0; team < 4; team++) build(m, team);
  for (let team = 0; team < 4; team++) {
    const p = players(m).find((p) => p.team === team && p.role === 0);
    assert.ok(action(m, p, { op: "launch", route: "sheltered" }).ok);
  }
  step(m, 2100);
  assert.ok(m.missions.every((s) => s.phase === "surface"));
  for (let team = 0; team < 4; team++) {
    const p = players(m).find((p) => p.team === team && p.role === 3),
      engineer = players(m).find((p) => p.team === team && p.role === 1),
      f = m.science.flags[team],
      b = baseFor(team);
    at(p, { x: f.position[0] - b.x, z: f.position[2] - b.z + 2 });
    at(engineer, { x: p.x + 1, z: p.z });
    p.aim = 0;
    work(m, p, { type: "scan", id: String(f.id) }, 4);
    assert.equal(f.state, "carried");
    assert.equal(p.carry, f.id);
    at(p, { x: 0, z: -17 });
    assert.ok(action(m, p, { op: "load" }).ok);
    assert.equal(m.science.teams[team].delivered, 0);
    const pilot = players(m).find((p) => p.team === team && p.role === 0);
    assert.ok(action(m, pilot, { op: "return" }).ok);
  }
  step(m, 1200);
  assert.ok(m.missions.every((s) => s.phase === "delivery"));
  for (let team = 0; team < 4; team++) {
    const p = players(m).find((p) => p.team === team && p.role === 3);
    at(p, RECEIVER_POINT);
    assert.ok(action(m, p, { op: "deliver" }).ok);
    assert.ok(action(m, p, { op: "finish" }).ok);
  }
  m.tick();
  assert.equal(m.phase, "results");
  assert.equal(m.winner, null);
  assert.ok(m.science.teams.every((t) => t.delivered === 1));
  assert.ok(conservation(m.science));
  assert.ok(
    JSON.stringify(m.snapshot()).length < 65536,
    "snapshot stays inside the transport budget",
  );
});

test("remote/replayed construction commands, impossible roles, fake scores and stale held work do not progress", () => {
  const m = room16(),
    p = players(m)[0],
    part = m.missions[0].parts[0];
  assert.ok(
    action(m, p, { op: "pick", part: part.id }).error,
    "rack proximity enforced",
  );
  at(p, shelfPoint(m.missions[0], part));
  assert.ok(action(m, p, { op: "pick", part: part.id }).ok);
  assert.ok(
    m.action(p.id, { commandSeq: p.commandSeq, op: "rotate" }).error,
    "replay rejected",
  );
  const other = m.missions[0].parts.find((q) => q.owner === 1);
  at(p, shelfPoint(m.missions[0], other));
  assert.ok(action(m, p, { op: "pick", part: other.id }).error);
  part.stage = "positioned";
  m.missions[0].carry[p.role] = null;
  const [x, , z] = boltPosition(part, 0);
  at(p, { x, z });
  assert.ok(
    action(m, p, { op: "work", target: { type: "bolt", id: part.id, bolt: 0 } })
      .ok,
  );
  p.input.buttons = 4;
  p.lastInputAt = m.time - 1;
  step(m, 30);
  assert.equal(part.bolts[0], 0, "stale held button stops");
  const packet = {
    kind: "input",
    v: 1,
    sequence: 1,
    strafe: 0,
    forward: 0,
    buttons: 0,
    aim: 0,
    score: 999,
    delivered: 999,
    x: 1e9,
  };
  assert.ok(m.receiveInput(p.id, packet));
  assert.equal(p.score, 0);
  assert.equal(m.science.teams[0].delivered, 0);
});

test("disconnect and server recovery retain role, position, held paid parts, progress and replay counters", () => {
  const m = room16(),
    p = players(m)[0],
    part = m.missions[0].parts[0];
  at(p, shelfPoint(m.missions[0], part));
  action(m, p, { op: "pick", part: part.id });
  const old = { x: p.x, z: p.z, commandSeq: p.commandSeq };
  m.leave(p.id);
  const restored = ExpeditionMatch.restore(
      JSON.parse(JSON.stringify(m.exportState())),
    ),
    r = restored.join({ token: p.token }).player;
  assert.equal(r.id, p.id);
  assert.equal(r.x, old.x);
  assert.equal(r.z, old.z);
  assert.equal(r.commandSeq, old.commandSeq);
  assert.equal(restored.missions[0].carry[0], part.id);
  assert.equal(restored.missions[0].parts[0].stage, "carried");
  assert.equal(restored.occupied, 16);
});

test("career payouts survive retries and cosmetic equip enforces earned unlocks", () => {
  const store = new ProgressionStore(),
    m = room16(),
    identity = store.identity(),
    p = players(m)[0];
  p.profileId = identity.profile.id;
  p.contribution = 12;
  m.science.teams[0].delivered = 2;
  store.settle(m);
  const first = store.get(p.profileId);
  store.settle(m);
  assert.deepEqual(store.get(p.profileId), first);
  assert.equal(first.matches, 1);
  assert.equal(first.xp, 142);
  assert.equal(store.equip(p.profileId, "Vanguard"), false);
  assert.equal(store.identity(identity.token).profile.id, p.profileId);
  store.save(m);
  assert.equal(store.recover()[0].matchId, m.matchId);
  store.close();
});

test("fuselage and pods are solid while empty ground under elevated wings remains walkable", () => {
  const boxes = hullBoxes();
  assert.equal(blocked(12, 0, boxes), false);
  assert.equal(blocked(-12, 0, boxes), false);
  assert.ok(blocked(0, 0, boxes));
  assert.ok(blocked(4.3, 6.5, boxes));
  const path = movePlanar(14, -12, 0, 30, boxes);
  assert.ok(path.z > 17, "no invisible rectangle at wing edge");
  assert.ok(
    !movePlanar(DOOR.x + 3, DOOR.z, -2.5, 0, boxes).hit,
    "visible side-door path is open",
  );
});

test("AI navigation routes every crew job around installed spacecraft using actual collision", () => {
  const boxes = hullBoxes(),
    start = { x: -20, z: 20 },
    end = { x: 12, z: -8 };
  const path = findPath(start, end, boxes, []);
  assert.ok(path.length > 0);
  let from = start;
  for (const to of path) {
    const move = movePlanar(
      from.x,
      from.z,
      to.x - from.x,
      to.z - from.z,
      boxes,
      [],
      0.55,
    );
    assert.equal(move.hit, false, JSON.stringify({ from, to }));
    from = to;
  }
  assert.ok(Math.hypot(from.x - end.x, from.z - end.z) < 0.2);
});

test("a fixed-timestep fastener completes at its exact duration and snapshots never round incomplete work up", () => {
  const m = room16(),
    p = players(m)[0],
    part = m.missions[0].parts[0];
  part.stage = "positioned";
  for (let b = 0; b < 3; b++) {
    const [x, , z] = boltPosition(part, b);
    at(p, { x, z });
    work(m, p, { type: "bolt", id: part.id, bolt: b }, 0.7);
    assert.equal(part.bolts[b], 1);
  }
  assert.equal(part.stage, "secured");
  part.stage = "positioned";
  part.bolts[2] = 0.999999;
  assert.equal(m.snapshot().missions[0].parts[0].bolts[2], 0.999);
});

test("a selected work target resumes after stale input clears the held button", () => {
  const m = room16(),
    p = players(m)[0],
    part = m.missions[0].parts[0];
  part.stage = "positioned";
  const [x, , z] = boltPosition(part, 0);
  at(p, { x, z });
  action(m, p, { op: "work", target: { type: "bolt", id: part.id, bolt: 0 } });
  p.input.buttons = 4;
  p.lastInputAt = m.time - 1;
  m.tick();
  assert.equal(part.bolts[0], 0);
  assert.ok(
    m.receiveInput(p.id, {
      kind: "input",
      v: 1,
      sequence: 1,
      strafe: 0,
      forward: 0,
      buttons: 4,
      aim: 0,
    }),
  );
  m.tick();
  assert.ok(
    part.bolts[0] > 0,
    "a slow render frame does not permanently lose the selected tool",
  );
});

test("recovered samples are reflected in the replicated carrier and can immediately be stowed", () => {
  const m = room16(),
    p = players(m).find((p) => p.team === 0 && p.role === 3),
    s = m.missions[0],
    f = m.science.flags[0],
    b = baseFor(0);
  s.phase = "surface";
  m.science.teams[0].planet = "B";
  f.state = "ground";
  at(p, { x: f.position[0] - b.x, z: f.position[2] - b.z });
  assert.ok(action(m, p, { op: "recover", sample: f.id }).ok);
  assert.equal(p.carry, f.id);
  assert.equal(m.snapshot().players.find((q) => q.id === p.id).carry, f.id);
  at(p, { x: 0, z: -17 });
  assert.ok(action(m, p, { op: "load" }).ok);
  assert.equal(f.state, "onboard");
  assert.equal(m.science.teams[0].delivered, 0);
});
