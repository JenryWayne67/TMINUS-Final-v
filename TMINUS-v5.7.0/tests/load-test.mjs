// Repeatable transport/latency probe. Simulated clients, not a claim about human concurrency.
import { performance } from "node:perf_hooks";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createGameServer } from "../server/online-server.mjs";
import { wsClient } from "./helpers/ws-client.mjs";
const count = Number(process.env.LOAD_ROOMS || 2),
  seconds = Number(process.env.LOAD_SECONDS || 3),
  latency = Number(process.env.LOAD_LATENCY_MS || 150);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 8 ||
  seconds < 1 ||
  seconds > 60 ||
  latency < 0 ||
  latency > 500
)
  throw Error("Invalid load parameters");
const service = createGameServer({ port: 0, host: "127.0.0.1" }),
  port = (await service.listen()).port,
  clients = [],
  rooms = [];
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
let timer;
const start = performance.now();
try {
  for (let r = 0; r < count; r++) {
    let code;
    for (let i = 0; i < 16; i++) {
      const c = wsClient(port, { deliveryDelayMs: latency / 2 });
      clients.push(c);
      await c.waitFor("hello");
      c.send({
        kind: "join",
        mode: "expedition",
        room: code || "",
        team: i >> 2,
        role: i % 4,
        name: `load-${r}-${i}`,
      });
      const j = await c.waitFor("joined");
      code = j.room;
      c.send({ kind: "ready", value: true });
    }
    rooms.push(service.rooms.get(code));
    await new Promise((r) => setTimeout(r, 60));
    clients[r * 16].send({ kind: "start" });
    await clients[r * 16].waitFor("snapshot", (s) => s.phase === "expedition");
  }
  const sent = performance.now();
  setTimeout(
    () => clients[0].send({ kind: "chat", text: "latency-probe" }),
    latency / 2,
  );
  await clients[0].waitFor("chat", (m) => m.text === "latency-probe");
  const measuredRoundTripMs = +(performance.now() - sent).toFixed(2);
  let sequence = 0;
  timer = setInterval(() => {
    const packet = {
      kind: "input",
      v: 1,
      sequence: ++sequence,
      strafe: Math.sin(sequence * 0.05),
      forward: Math.cos(sequence * 0.05),
      buttons: 0,
      aim: 0,
    };
    for (const c of clients)
      setTimeout(() => {
        if (!c.closed) c.send(packet);
      }, latency / 2);
  }, 50);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  clearInterval(timer);
  await new Promise((r) => setTimeout(r, latency + 100));
  if (rooms.some((r) => r.occupied !== 16 || r.phase !== "expedition"))
    throw Error("Room lost clients or match state");
  console.log(
    JSON.stringify(
      {
        clients: clients.length,
        rooms: count,
        seconds,
        simulatedRoundTripMs: latency,
        measuredRoundTripMs,
        inputHz: 20,
        eventLoopP95Ms: +(delay.percentile(95) / 1e6).toFixed(2),
        eventLoopMaxMs: +(delay.max / 1e6).toFixed(2),
        snapshotBytes: rooms.map((r) =>
          Buffer.byteLength(JSON.stringify(r.snapshot())),
        ),
        ticks: rooms.map((r) => r.tickNumber),
        elapsedSeconds: +((performance.now() - start) / 1000).toFixed(2),
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(timer);
  delay.disable();
  clients.forEach((c) => c.close());
  await service.close();
}
