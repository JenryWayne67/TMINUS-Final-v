# T-MINUS v5.7.0

Completes the remaining implementation work from the v5.6.0 candidate while retaining the original missions, characters, spacecraft, offline modes and arena.

- Shared acceleration, braking and edge-triggered jumping for offline crew and online operators. Height-aware hull collision includes visible feet, legs and belly; crouching can pass below elevated structures. Camera obstruction respects collider height. Role changes and focus loss clear movement safely.
- Rack models rest on their stands, supply cases rest on terrain, rival pads and crew use matching ground levels, exterior plates follow their ship surfaces, and all service fasteners are reachable on physical hull faces. Terrain flattening covers all four launch pads.
- Imported character rigs now receive stance foot placement, including their independently animated foot controls. Existing carry, jump and tool clips provide work feedback. Per-instance skeleton textures are released on resets and role changes without disposing shared model assets.
- Online surface combat uses the original three weapons, reloads, reserves, spread, falloff, shields, health and grenades. Server-confirmed shots, hits, explosions and the original weapon HUD render in the client. Flight turrets hit debris and rival spacecraft; crew abilities affect movement, protection and scanning.
- Raider EVA has suit inertia, hull collision, oxygen, an airlock, safety tether and exterior plate repair with spare accounting. Wreck cargo can be salvaged and only scores through home delivery.
- Persistent audio/accessibility settings include independent levels, text size, contrast, reduced motion, team symbols, sensitivity, inverted look, camera motion and toggle-to-work. Campaign controls preserve focus while telemetry updates.
- Durable username/password accounts, cross-browser sign-in, session revocation and one-use recovery keys preserve existing guest careers. Passwords use salted scrypt; stored session and recovery tokens are hashed.
- Stable worker-affine room routing, shared profile RPC, multiple room processes, supervised worker restart, private-worker authentication, native TLS/WSS and reverse-proxy/cluster configurations are supplied. Snapshot compression substantially reduces traffic. The pinned transport dependency is ws 8.23.0; the production dependency audit passed with no reported vulnerabilities.
- Extended browser, campaign, recovery, physics, account, TLS and full sixteen-client mission tests are included. Source, Node deployment, static client and QA evidence packages are supplied with checksums.

Verification and its limits are documented in QA_REPORT.md. Sixteen automated clients completed a normal-timing match; sixteen-human WAN sessions, physical GPU performance, Safari itself, device coverage and public-domain hosting remain field acceptance work. Those results cannot be substituted with automated clients or software rendering.
