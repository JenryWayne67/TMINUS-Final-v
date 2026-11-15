import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameServer } from "../server/online-server.mjs";
import { wsClient } from "./helpers/ws-client.mjs";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test("sixteen expedition WebSockets share detailed mission state and recover rooms plus career after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tminus-persistence-")),
    path = join(directory, "test.sqlite");
  let service = createGameServer({
    port: 0,
    host: "127.0.0.1",
    storePath: path,
  });
  let port = (await service.listen()).port;
  let clients = [];
  t.after(async () => {
    clients.forEach((c) => c.close());
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  let code = null,
    host = null,
    key = null,
    profileId = null;
  for (let team = 0; team < 4; team++)
    for (let role = 0; role < 4; role++) {
      const c = wsClient(port);
      clients.push(c);
      await c.waitFor("hello");
      c.send({
        kind: "join",
        mode: "expedition",
        room: code || "",
        team,
        role,
        name: `human-${team}-${role}`,
      });
      const joined = await c.waitFor("joined");
      code = joined.room;
      if (!host) {
        host = joined;
        const profile = await c.waitFor("profile");
        key = profile.profileToken;
        profileId = profile.profile.id;
      }
      c.send({ kind: "ready", value: true });
    }
  const room = service.rooms.get(code);
  assert.equal(room.occupied, 16);
  await pause(120);
  clients[0].send({ kind: "start" });
  const start = await clients[15].waitFor(
    "snapshot",
    (s) => s.phase === "expedition",
  );
  assert.equal(start.missions[0].parts.length, 12);
  assert.equal(start.flags.length, 12);
  assert.equal(start.players.length, 16);
  clients[0].send({
    kind: "input",
    v: 1,
    sequence: 10,
    strafe: 1,
    forward: 0,
    buttons: 0,
    aim: 0,
    x: 999999,
    credits: 1e9,
  });
  await pause(250);
  const actual = room.players.get(host.id);
  assert.ok(actual.x > -3 && actual.x < 0);
  assert.equal(room.missions[0].credits, 4800);
  clients[0].send({ kind: "action", op: "pick", part: "keel", commandSeq: 0 });
  assert.match(
    (await clients[0].waitFor("action-result", (m) => !!m.error)).error,
    /distance|role|stage/i,
  );
  // An open held input expires on the server even without a browser blur event.
  await pause(600);
  const stopped = actual.x;
  await pause(200);
  assert.equal(actual.x, stopped);
  const place = { x: actual.x, z: actual.z };
  clients.forEach((c) => c.close());
  await pause(100);
  await service.close();
  service = createGameServer({ port: 0, host: "127.0.0.1", storePath: path });
  port = (await service.listen()).port;
  clients = [];
  const c = wsClient(port);
  clients.push(c);
  await c.waitFor("hello");
  c.send({
    kind: "join",
    mode: "expedition",
    room: code,
    token: host.token,
    profileToken: key,
  });
  const resumed = await c.waitFor("joined");
  assert.equal(resumed.id, host.id);
  assert.equal(resumed.resumed, true);
  const snap = await c.waitFor("snapshot", (s) => s.mode === "expedition");
  const p = snap.players.find((p) => p.id === host.id);
  assert.ok(Math.abs(p.x - place.x) < 0.001);
  assert.ok(Math.abs(p.z - place.z) < 0.001);
  const career = await c.waitFor("profile");
  assert.equal(career.profile.id, profileId);
  assert.equal(service.rooms.get(code).occupied, 16);
});

test("matchmaking balances open specialist seats and does not merge legacy arena with expedition rooms", async (t) => {
  const service = createGameServer({ port: 0, host: "127.0.0.1" }),
    port = (await service.listen()).port,
    clients = [];
  t.after(async () => {
    clients.forEach((c) => c.close());
    await service.close();
  });
  let code = null;
  for (let i = 0; i < 5; i++) {
    const c = wsClient(port);
    clients.push(c);
    await c.waitFor("hello");
    c.send({ kind: "matchmake", name: "match-" + i, role: 0 });
    const joined = await c.waitFor("joined");
    if (!code) code = joined.room;
    assert.equal(joined.room, code);
  }
  const room = service.rooms.get(code),
    counts = [0, 1, 2, 3].map(
      (t) => room.participants.filter((p) => p.team === t).length,
    );
  assert.deepEqual(counts.sort(), [1, 1, 1, 2]);
  assert.equal(
    new Set(room.participants.map((p) => p.team + ":" + p.role)).size,
    5,
  );
});
