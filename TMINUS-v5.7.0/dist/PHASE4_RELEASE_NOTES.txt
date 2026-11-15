# T-MINUS / APOGEX v5.4.0 — Phase 4: Production Engineering

**Scope:** A concrete production-engineering iteration over Phase 3 v5.3.0. All existing campaign and competitive offline modes remain. No online multiplayer service has been connected.

## Changes delivered

1. **Deterministic adaptive render resolution** (`performance-core.js`): Automatic quality starts at DPR cap 1.5. A sliding window must record two persistently slow sample windows before reducing resolution; four fast windows are required before recovering detail. Invalid and background-tab frame times are excluded. Manual High, Balanced, and Performance modes override autoscaling. The default competition settings mode is Auto.
2. **Fast static terrain** (`world.js`): 125 rocky details and 28 distant spires are now four Three.js InstancedMesh batches, replacing 153 independent material/geometry draw submissions. Original random placement, dimensions and colors are retained. Actual improvement depends on GPU and scene.
3. **Explicit render pipeline** (`crew-experience.js`, `game.js`): replaced mutation of `renderer.render` with `experience.renderWorld(scene, camera)`. Keeps temporary ship-interior positioning and visibility changes scoped to each rendering call. Inset rendering restores viewport and actor visibility even on exceptions.
4. **Resource lifecycle** (`resource-lifecycle.js`, `crew-world.js`, `asset-loader.js`, `characters.js`): match resets dispose transient geometry and material allocations while retaining shared material and geometry caches and template-derived rig resources. The old actor animation mixers are stopped and late async rig-load completions detach from disposed worlds.
5. **Focus and WebGL resilience**: held gameplay inputs clear on tab blur/visibility change and competitive gameplay pauses. WebGL device-loss displays a recovery message and reloads on restoration instead of silently continuing.
6. **Usability and diagnostics**: improved smaller-window HUD readability, keyboard focus visibility, reduced-motion behavior. `?perf=1` enables an optional local FPS / draw-call / triangle / GPU allocation diagnostic overlay; a read-only `window.tminus.performance` reports the latest statistics.
7. **Versioned networking foundation** (`multiplayer-foundation.js`): unit-tested wire input validation, four-team slot occupancy, monotonic input sequence handling, authoritative fixed-step movement sample, and snapshot interpolation. **Foundation only: no WebSocket backend, room discovery, remote-player rendering, matchmaking, persistent identity, or real multiplayer are deployed.**

## Test and acceptance policy

Run `npm test` (linkedom-based UI tests require development dependencies), `npm run test:release`, `npm run build`, and check `PHASE4_QA_PLAYTEST.md`. The source-level tests are not a substitute for on-device GPU playtesting, memory profiling, real multiplayer load tests, or a Netlify smoke test.

## Operating boundaries

This is a native ES-module web game. The source ZIP is editable and runs with `npm install` and `npm run dev`; the NETLIFY ZIP is a self-contained static web site, not a live deployment. The two existing single-player campaign missions and the original 1-player-plus-15-bots competition remain. This release does not add store payments, subscriptions, backend saves, or live network sessions.
