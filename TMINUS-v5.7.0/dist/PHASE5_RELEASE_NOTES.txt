# T-MINUS v5.5.0 — Phase 5: LIVE Multiplayer Vertical Slice

This is the first actual networked mode. It runs a real WebSocket server and renders real remote players in the browser. Phase 4 offline mode and the two campaign missions remain intact. **This is an online multiplayer vertical slice, not a finished full-fidelity port of every offline mechanic.**

## Implemented

- **Real players:** Four teams, four unique specialist seats each (up to sixteen total). The server does not inject bots. Human-controlled players appear simultaneously in the same room.
- **Real rooms:** Six-character invite codes, ready-gated host-start lobby, role/team selection, text chat and reconnection using a 60-second seat reservation and per-session token.
- **Server authority:** Node.js v22 WebSocket server at `/ws`, fixed 20Hz simulation, server-owned position, damage, team/role occupancy, phase time, objective states and scores. The browser sends intent packets only. Snapshots broadcast at 10Hz. Invalid/replayed movement packets are rejected and action/fire rates are limited.
- **Gameplay loop:** BUILD (3 fasteners × 4 role-specific ship modules per team) → FLIGHT (repair checks) → PLANET B (twelve finite shared samples; carry to ship; max four onboard per team; team-vs-team gunfire, knockouts and drops) → RETURN → DELIVERY (press E per cargo at own beacon) → RESULTS. Only successfully delivered cargo scores. Gunner gets faster, stronger shots. The correct specialist earns bonus build contribution score.
- **Integrated UI and visuals:** New `online.html`, `online.js`, `online.css`, shared visual and sim coordinates, stylized Three.js ships and animated crew, team scoreboard, real-player role roster, action prompts, camera and chat; main menu link to online mode.
- **No npm WebSocket package:** small RFC6455 transport with mandatory masking, 64KiB frame limit, rate limiting, text validation, ping/pong and explicit origin allowlist. TLS should terminate at a production reverse proxy or PaaS.
- **Deployment:** `npm install && npm run dev` serves both original game and the WebSocket backend locally. `npm start` runs on the host-supplied `$PORT`. `render.yaml` is an example of a persistent Node hosting configuration. A Netlify **static** site hosts only the frontend; connect its online mode to a separately deployed `wss://` backend using the Server Endpoint field or `?server=wss://host/ws` in invite links.

## Deliberate limitations

- The online mode uses a compact new synchronous arena rather than the entire complex offline rocket, FPV interior, assembly-physics, and orbital simulation. Those systems remain in offline mode; porting each one needs additional state replication and validation.
- Single in-memory server process: no durable accounts, database, authoritative anti-cheat beyond validation, replay storage, distributed room coordination, fleet networking or global matchmaking. Rooms and scores disappear when the Node process restarts.
- Reconnection recovers a reserved seat on the same live server, not the running match after a server restart. The client resynchronizes from snapshots rather than performing full input replay/reconciliation.
- Live server requires always-on Node hosting. Netlify Drop alone cannot host the WebSocket game server.
- Collision is coarse (arena bounds, four central rocks and ship obstacles) rather than full character physics. Online visuals and gameplay still need real-world device, internet, latency, and browser testing.

## Verify locally

```bash
npm install
npm run dev
# open http://localhost:8095/online.html in two separate tabs or browsers
# choose opposite teams, create a room in tab 1, paste its code into tab 2
# host starts; build, fight, collect, stow, return, deliver and check results
npm run test:multiplayer
npm run test:release
npm test
```

Do not claim this client is multiplayer if it is uploaded to static hosting without a running backend. HTTP `/api/health` returns actual service status.
