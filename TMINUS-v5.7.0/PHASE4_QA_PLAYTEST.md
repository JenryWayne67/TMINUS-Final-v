# Phase 4 release gate — operator checklist

Use a real browser with hardware-accelerated WebGL. Source-level and HTTP tests cannot verify every graphical behavior.

### Smoke test

- [ ] `npm run build` creates `dist/t-minus-v5.4.0.js`, and browser network tab shows no 404s or uncaught exceptions.
- [ ] Load menu, offline lobby, construction, Go/No-Go, launch, in-flight, planet B, return, debrief.
- [ ] Play both solo campaign missions through complete debrief (including pause/resume).
- [ ] Competitive settings switch Auto -> Low -> High -> Auto, and graphics remain functional with no lost models or shadows.

### Controls and UI

- [ ] Hold W while moving, switch browser tabs, return: player should be paused and not keep walking or firing.
- [ ] Escape, Tab/cursor mode, reload, jump, camera rotate, mouse wheel, role switch all behave reliably.
- [ ] Test Safari and Chromium at 1920x1080, 1366x768, 1024x768, and narrower windows. Make sure flight HUD never obscures objectives.
- [ ] At OS reduced-motion setting, prominent menu/UI animations are reduced.

### Performance

- [ ] Start game with `?perf=1`. Record FPS, draw calls, triangles, geometry and textures after loading.
- [ ] Repeat three match restarts. Check GPU resources do not grow indefinitely between identical in-game scenes.
- [ ] In Auto mode, deliberately stress GPU and check resolution reduces only after sustained frame drops; returns when performance recovers.
- [ ] Verify that instanced terrain remains visible in daylight and that rock collision is unchanged.

### Faults & release

- [ ] Test shader compile, WebGL context loss/recovery if device can simulate it, reduced WebGL capability, and audio permission failure.
- [ ] Confirm that the lobby says OFFLINE (1 HUMAN + 15 BOTS). `multiplayer-foundation.js` is not a multiplayer implementation.
- [ ] Deploy the static ZIP to a staging site first; check every imported JavaScript module and every model/audio URL.
