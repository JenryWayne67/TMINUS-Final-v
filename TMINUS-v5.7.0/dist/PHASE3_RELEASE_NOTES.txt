# T-MINUS / APOGEX v5.3.0 — Phase 3 Gameplay Evolution

**Build provenance:** Based on the supplied v5.2.0 source archive. Keeps its Phase 1 grounding, shadows and Phase 2 movement/collision/camera improvements. Fully static Three.js native ES-module deployment. **No live site was changed.**

## New gameplay

1. **Playable interactive construction:** Default lobby option is `HANDS-ON + CREW`. Manually carry the three modules assigned to your specialist, turn them in quarter-turn increments, position them over a holographic footprint and hold LMB on all three fasteners. Existing bots work on other specialists' modules; change roles with 1–4 outside FPS mode to take over their jobs. Interactive guidance (B to face next objective) is surfaced in the build HUD. Pickups, mounted parts and bolts trigger the existing game animations, sparks and sounds. If you prefer the previous mode, choose `FAST ASSEMBLY` in the lobby or click `LET MACHINES FINISH THE BUILD` in the gameplay construction panel. Autonomous bot builders that cannot finish a component activate a remote service-arm fallback after 10 s with no progress, preventing match softlocks.
2. **Fair procurement:** The automatic 15-second builder now purchases each component at its existing price, rather than silently installing everything without spending credits. Both modes pay the same module costs. Player-awarded manual-build contracts explicitly exclude bot and machine activity.
3. **Eight real in-match contracts:** Hands on Deck, Spacecraft Assembled, Systems Green, Clear the Pad, First Discovery, Defensive Action, Safe Return and Science Home. Progress is computed using the real engine state, existing physical flags, actual flight state and verified combat hits. The journal toggles with J or the in-HUD button; completed contracts give short on-screen feedback. All XP and credits are paid only at the debrief; mission winner is still determined solely by physically delivered flags, not contract XP.
4. **Persistent career:** Debrief writes match rewards and contract bonuses to the existing `apogex-progress` browser-local profile. Career level, rank titles, cumulative matches and cosmetic commendations are displayed. Single-debrief reward guard prevents accidental duplicate payouts within one match. Persistent data is local to the browser; clearing browser storage resets it. There is no backend and the browser data is not anti-cheat-secure.
5. **Combat response:** Verified player hits trigger a compact hit confirmation. Kills receive a distinct response. Striking scenery or cover does not award combat-hit contracts. No gameplay simulation is paused by hits, preserving deterministic timing for future network work.
6. **Quality-of-life:** The expanded mission/assembly side panel is scrollable and retains its scroll position across HUD refreshes. Mission journal begins collapsed. Controls help and version labels updated.

## Controls: competitive mode

- **WASD** move; **Shift** sprint; **mouse** aim; **V** first-/third-person view.
- **E** pick up / mount / stow; **R** or mouse wheel rotate carried construction modules; **LMB hold** to fasten 3 bolts per module; **B** face the next build task.
- **1–4** switch specialists during ground construction/flight; **J** toggle the mission contract journal; **T** telemetry; **Esc** pause.
- On Planet B, FPS-mode **1–3** selects guns, **F1–F4** switches specialists; **E hold** scans as Raider and E loads at ship; **N** initiates return when safe.
- For the original quick route, choose **FAST ASSEMBLY** in the lobby.

## Testing completed

- Added independent Node unit coverage for build selection, manual-vs-bot credit, auto procurement, bot stall recovery, mission contracts, payout math, profile sanitization, and progression between build/system phases.
- Existing deterministic game logic and asset tests run under `node --test` (see QA notes for environment-dependent UI tests).
- Native ES-module syntax and local HTTP/static asset checks performed before packaging.

## Not yet shipped (important)

- No real networked 4v4v4v4 sessions, account login, server authority, persistent cloud leaderboard, online economy or payments.
- No new campaign chapter, no production character IK, no new art assets, no naval pathfinding/navmesh.
- The single-player campaign remains as in v5.2.0. These contract/economy updates are for competitive offline practice only.
- GPU-capable real Safari/Chromium playthrough is required, including character grounding, manual UI placement, camera during wielding, small screens and collision edge cases.

## Local and static deployment

```
npm install
npm run dev
```

Open `http://localhost:8095`. For Netlify Drop, extract `TMINUS-Phase3-v5.3.0-NETLIFY.zip` and upload the extracted folder (index.html at its root). For Git deployment, build command `npm run build`, publish `dist`. No runtime backend or API keys required.
