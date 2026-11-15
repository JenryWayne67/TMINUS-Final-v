# One multiplayer mode, online and offline with bots

Goal: the offline mode ("Competitive / offline practice", `dist/crew-experience.js`) and online
multiplayer (`expedition.html` + `dist/expedition-online.js`) become **one game**. Offline runs the exact same
match rules in the browser, with bots in every empty seat and on the rival teams. Every scene is shared:
parts shop → build → supplies/checks → route → stack-and-launch → flight cabin → Planet B flags → return
lift-off → delivery → results. Every screen and stage gets a BACK control.

## Done (this commit)

- **Step 1: shared simulation.** The authoritative match code moved from `server/` into `dist/sim/`
  (`match.js`, `expedition-match.js`, `expedition-operations.js`, `random.js`). `node:crypto` is replaced by a
  Web Crypto shim (`dist/sim/random.js`), so the same files load in Node and in the browser.
  `server/*.mjs` now only re-export `dist/sim/*`. All 283 unit tests pass unchanged.

## Remaining steps

### Step 2: local transport (in-page server)
Create `dist/sim/local-server.js` exporting `createLocalSocket()`: an object with the `WebSocket` surface
the client uses (`readyState`, `send(json)`, `onopen`, `onmessage`, `onclose`, `close()`).
- On open, emit `{kind:'hello'}` like `server/online-server.mjs` does.
- Mirror the message handlers from `server/online-server.mjs` (`receive()` at lines ~63–80):
  `join` (create one `ExpeditionMatch`, `room.join`, reply `joined`), `input` → `room.receiveInput`,
  `ready`, `start`, `action` (reply `action-result`), `seat` → `room.chooseSeat`, `chat`.
  Profiles are skipped offline: reply `{kind:'profile', profile:{xp:0,credits:0,cosmetic:'Cadet',unlocks:['Cadet'],matches:0}}`.
- Tick loop: copy the fixed-step loop from `online-server.mjs` (~line 109): `room.tick(1/SIMULATION_HZ)`,
  broadcast `room.snapshot()` every 2 ticks. Use `performance.now()` instead of `process.hrtime`.
  Do not drop to 0 Hz when the tab is in the background; cap catch-up at 0.3 s.
- Deliver messages with `queueMicrotask`/`setTimeout(0)` so ordering matches a real socket.

### Step 3: client switch
In `dist/expedition-online.js` `connect()` (~line 363): if `?offline` is in the URL (or the new OFFLINE
button is pressed), use `createLocalSocket()` instead of `new WebSocket(serverUrl)`. Nothing else in
the client changes, so all multiplayer scenes work offline automatically.
On join, add bot players to every empty seat (all 4 teams) via `room.join({name, team, role})`, mark
them `bot:true`, ready them, then start.

### Step 4: bot brains (`dist/sim/bots.js`)
Each tick, for every bot player, build an input packet + actions the same way a human client does
(reuse `objective()` logic from `expedition-online.js`; move it to a shared `dist/objectives.js`).
- **Assembly:** walk to `SHOP_POINT`, `buy`, walk to `shelfPoint`, `pick`, walk to outline, `place`,
  hold work on each bolt.
- **Outfit:** carry each supply case to `STOW_POINT`, `stow`; hold work at check stations with the
  correct reading (engine 73, power 55, pressure 101).
- **Route:** the bot pilot picks the valid route with the biggest fuel margin.
- **Flight:** pilot strafes away from the nearest hazard's x. Gunner aims at the nearest hazard and fires.
  Engineer goes to `shipNeeds(m).station` and holds work. Raider services stations, or takes an EVA when plates
  are damaged.
- **Surface:** walk to the nearest `site` flag, face it, hold work 5 s, walk back into the ship radius
  (auto-stow). The pilot sends `return` when no flag is carried and stowed ≥ 3 or none are left.
- **Delivery:** `deliver` at `RECEIVER_POINT`, then `finish`.
Path following: steer toward the target and add a small sideways offset when `moved` stays ≈ 0 (stuck).
Port useful helpers from `crew-experience.js` `updateAI()` and `findPath` (`dist/crew-navigation.js`).

### Step 5: one entry point
- Main menu: replace "COMPETITIVE / OFFLINE PRACTICE" with **PLAY OFFLINE (BOTS)** → `expedition.html?offline`.
- The online lobby keeps "CONNECT TO MATCH". Add "FILL EMPTY SEATS WITH BOTS" for the host (server: same
  `bots.js` running inside `online-server.mjs` for rooms with that flag).
- Keep `crew-experience.js` reachable for one release behind `?legacy`, then delete it.

### Step 6: BACK buttons everywhere
- `expedition.html` header: a `◂ BACK` button. In join/lobby it returns to `index.html`. During a match it asks
  "Leave the match?" and then closes the socket (offline: stops the local loop) and returns to the lobby/menu.
- Campaign (`campaign-ui.js`): BACK on briefing → mission select, design → briefing, build bay → design
  (the cinematic skip already exists), in-ship → pause menu "Save & mission select".
- Esc on every overlay closes it (already true for help and pause).

### Step 7: verify
- `npm test` (283+), plus a new `tests/offline-bots.test.mjs`: one human seat + 15 bots must complete
  assembly → delivery inside the window without stalling (tick the match headless, assert the phases).
- Browser: `expedition.html?offline`. Play each stage once and check the shop, launch sequence, cabin, flags,
  return lift-off, delivery and the results screen.

## Notes for whoever continues
- The browser pane throttles timers, so the server can mark input stale. Test bots headless first.
- `GLTFLoader` strips `.` from bone names (`Middle1.R` → `Middle1R`). Kenney blasters point their muzzle down −Z.
- QA trick used so far: an in-process `createGameServer` on port 8097 plus fixed fixture endpoints
  (`/rival`, `/phase`, `/tp`) on port 8098 for jumping between phases.
