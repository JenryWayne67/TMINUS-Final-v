// Real Chromium/WebGL controls against a live authoritative server.
// Phase fixtures shorten setup; they are explicitly not a normal-duration full match.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createGameServer } from "../server/online-server.mjs";
import {
  shelfPoint,
  baseFor,
  RECEIVER_POINT,
} from "../dist/expedition-network.js";
import { boltPosition } from "../dist/build-guide.js";
const output = process.env.QA_OUTPUT || "work/qa";
await mkdir(output, { recursive: true });
const service = createGameServer({ port: 0, host: "127.0.0.1" }),
  port = (await service.listen()).port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [],
  checks = [];
let page, other;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 8000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw Error("Timed out: " + label);
    await wait(50);
  }
  checks.push(label);
  console.log("PASS", label);
}
async function key(k, ms = 0) {
  await page.keyboard.down(k);
  if (ms) await wait(ms);
  await page.keyboard.up(k);
  await wait(220);
}
async function shot(name) {
  await page.screenshot({ path: output + "/" + name + ".png", timeout: 60000 });
}
try {
  const a = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    b = await browser.newContext({ viewport: { width: 960, height: 700 } });
  page = await a.newPage();
  other = await b.newPage();
  for (const [i, p] of [page, other].entries()) {
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    await p.goto(`http://127.0.0.1:${port}/expedition.html`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await p.locator("#join-name").fill(i ? "BROWSER-RIVAL" : "BROWSER-PILOT");
    await p.locator("#join-team").selectOption(String(i));
  }
  await page.bringToFront();
  await page.locator("#join-button").click();
  await until(
    () => service.rooms.size === 1,
    "browser creates expedition room",
  );
  const room = [...service.rooms.values()][0];
  await other.locator("#join-room").fill(room.code);
  await other.locator("#join-button").click();
  await until(
    () => room.participants.length === 2,
    "two real browser clients share a room",
  );
  await page.locator("#ready-button").click();
  await other.locator("#ready-button").click();
  await page.bringToFront();
  await page.locator("#start-button").click();
  await until(() => room.phase === "expedition", "ready check and host start");
  let player = room.participants.find((p) => p.name === "BROWSER-PILOT");
  const m = room.missions[0];
  await wait(500);
  const z = player.z;
  await key("w", 550);
  await until(
    () => player.z < z - 1,
    "real WASD moves authoritative character",
  );
  const time = room.time;
  await other.bringToFront();
  await wait(650);
  const stopped = player.z;
  await wait(250);
  assert.equal(player.z, stopped);
  assert.ok(room.time > time);
  checks.push("focus loss stops movement while match keeps running");
  await page.bringToFront();
  await key("F2");
  await until(() => player.role === 1, "open specialist seat can be selected");
  await key("F1");
  await until(() => player.role === 0, "role can switch back");
  const part = m.parts[0],
    rack = shelfPoint(m, part);
  player.x = rack.x;
  player.z = rack.z;
  await wait(400);
  await key("e");
  await until(
    () => part.stage === "carried",
    "E picks up a real shared spacecraft part",
  );
  await key("r");
  assert.equal(m.rotation[0], 1);
  for (let i = 0; i < 3; i++) await key("r");
  assert.equal(m.rotation[0], 0);
  checks.push("rotation is synchronized and enforced");
  player.x = -4.5;
  player.z = part.position[2];
  await wait(400);
  await key("e");
  await until(
    () => part.stage === "positioned",
    "E snaps aligned module into place",
  );
  const [x, , bz] = boltPosition(part, 0);
  player.x = x;
  player.z = bz;
  await wait(400);
  await page.keyboard.down("e");
  await until(
    () => part.stage === "secured",
    "held work completes three server-timed fasteners",
    15000,
  );
  await page.keyboard.up("e");
  await shot("01-network-construction");
  // Fixture: already-completed remaining assembly/supplies/checks, using the same model state.
  for (const p of m.parts) {
    p.stage = "secured";
    p.bolts = [1, 1, 1];
    p.purchased = true;
  }
  m.cargo.forEach((c) => (c.stowed = true));
  m.checks = { engine: 1, power: 1, pressure: 1 };
  m.phase = "route";
  room.stage(0);
  await wait(450);
  await page.locator('[data-route="sheltered"]').click({ force: true });
  await until(
    () => m.phase === "flight",
    "Pilot launches through a real route button",
  );
  assert.ok(m.propellant < 80);
  await shot("02-network-flight");
  await key("F2");
  await until(() => player.role === 1, "Engineer role handoff in flight");
  m.fault = "reactor";
  player.x = -2.3;
  player.z = -4.2;
  await wait(400);
  await page.keyboard.down("e");
  await until(
    () => m.fault === null,
    "Engineer console repairs an authoritative fault",
    15000,
  );
  await page.keyboard.up("e");
  await shot("03-engineering-interior");
  await key("F3");
  await until(() => player.role === 2, "Gunner handoff in flight");
  m.hazards = [{ id: 999999, x: m.shipMotion.x, z: -25, hp: 80 }];
  await wait(300);
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await wait(800);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await until(
    () => !m.hazards.some((h) => h.id === 999999),
    "Gunner fire destroys flight debris",
  );
  // Fixture: fast forward the server-owned travel timer, rather than bypassing the transition.
  m.flightTime = m.route.duration - 0.05;
  await until(
    () => m.phase === "surface",
    "flight reaches Planet B through the mission transition",
  );
  await key("F4");
  await until(() => player.role === 3, "Raider handoff on Planet B");
  const flag = room.science.flags[0],
    base = baseFor(0);
  player.x = flag.position[0] - base.x;
  player.z = flag.position[2] - base.z + 2;
  await wait(400);
  await key("b");
  await page.keyboard.down("e");
  await until(
    () => flag.state === "carried",
    "real hold scans, stabilizes and extracts science",
    20000,
  );
  await page.keyboard.up("e");
  await wait(220);
  await key("g");
  await until(() => flag.state === "ground", "G drops sample at the player");
  await key("e");
  await until(() => flag.state === "carried", "E recovers a dropped sample");
  player.x = 0;
  player.z = -17;
  await wait(400);
  await key("e");
  await until(
    () => flag.state === "onboard",
    "sample can be stowed at the spacecraft",
  );
  assert.equal(room.science.teams[0].delivered, 0);
  checks.push("onboard science is not scored");
  await shot("04-planet-b-cargo");
  await key("F1");
  await until(() => player.role === 0, "Pilot can take the return role");
  await key("n");
  await until(
    () => m.phase === "flight" && m.flightLeg === "return",
    "N commits return with reserved fuel",
  );
  m.flightTime = m.route.duration * 0.55 - 0.05;
  await until(() => m.phase === "delivery", "return reaches Planet A");
  await key("F4");
  await until(() => player.role === 3, "delivery role handoff");
  player.x = RECEIVER_POINT.x;
  player.z = RECEIVER_POINT.z;
  await wait(400);
  await key("e");
  await until(
    () => room.science.teams[0].delivered === 1,
    "only receiving-station delivery awards a score",
  );
  await page.keyboard.press("Escape");await page.evaluate(()=>document.exitPointerLock?.());await page.locator("#finish-mission").click({force:true});
  await until(() => m.finished, "crew can finish after delivering cargo");
  room.missions[1].finished = true;
  await until(
    () => room.phase === "results",
    "authoritative results and debrief",
  );
  await shot("05-network-debrief");
  const priorId = player.id;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await until(
    () => room.players.get(priorId)?.connected,
    "reload reconnects the reserved session",
  );
  const mobile = await browser.newPage({
    viewport: { width: 430, height: 932 },
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(`http://127.0.0.1:${port}/expedition.html`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.ok(
    await mobile.evaluate(() => document.body.scrollWidth <= innerWidth),
  );
  await mobile.screenshot({
    path: output + "/06-mobile-menu.png",
    timeout: 120000,
  });
  checks.push("mobile menu fits without horizontal overflow");
  await mobile.close();
  // Original offline mode still renders the actual imported characters and ship.
  await page.goto(`http://127.0.0.1:${port}/?dev`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator('[data-screen="select"]').click();
  await page.locator('[data-action="start"]').click();
  await key("Enter");
  await page.waitForFunction(
    () => window.tminus?.crewExperience.state.phase === "assembly",
  );
  await shot("07-offline-construction");
  // Browser regression: keep all work physical, speed up simulation only (real WebGL scene remains loaded).
  const handoffs = await page.evaluate(() => {
    const ce = window.tminus.crewExperience;
    let switched = 0;
    for (let i = 0; i < 800; i++) {
      if (i % 160 === 0) {
        ce.selectRole((ce.state.selected + 1) % 4);
        switched++;
      }
      ce.update(0.05);
    }
    return {
      switched,
      parts: ce.state.parts.map((p) => [p.id, p.stage, p.bolts]),
      auto: ce.state.autoBuild.enabled,
    };
  });
  assert.equal(handoffs.switched, 5);
  assert.equal(handoffs.auto, false);
  assert.ok(handoffs.parts.some((p) => p[1] === "secured"));
  checks.push(
    "real browser AI continues physical work through five role handoffs without auto-build",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    output + "/browser-results.json",
    JSON.stringify(
      {
        browser: "Chromium",
        rendering: "actual WebGL, software GPU",
        method:
          "phase fixtures and travel-timer fast-forward; real browser input for interactions",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("BROWSER PASS", checks.length);
} catch (e) {
  console.log(
    "SERVER STATE",
    JSON.stringify(
      [...service.rooms.values()].map((r) => ({
        flags: r.science.flags.map((f) => ({
          id: f.id,
          state: f.state,
          stage: f.stage,
          progress: f.progress,
          scanner: f.scanner,
        })),
        parts: r.missions[0].parts.map((p) => ({
          id: p.id,
          stage: p.stage,
          bolts: p.bolts,
        })),
        players: [...r.players.values()].map((p) => ({
          role: p.role,
          x: p.x,
          z: p.z,
          task: p.task,
          input: p.input,
          seq: p.commandSeq,
          aim: p.aim,
        })),
      })),
    ),
  );
  if (page)
    try {
      await shot("failure");
      await writeFile(output + "/failure.txt", e.stack);
    } catch {}
  throw e;
} finally {
  await browser.close();
  await service.close();
}
