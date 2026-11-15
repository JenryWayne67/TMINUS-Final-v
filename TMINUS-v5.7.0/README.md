# T-MINUS / APOGEX v5.7.0

A complete editable browser game with the original offline crew competition, two solo campaigns, Mission Control, the retained arena, and a shared authoritative four-team expedition.

Requires Node.js 24 LTS (minimum 22.13).

```sh
npm ci
npm start
```

Open `http://localhost:8095`. The first-run Windows and Unix launchers install the pinned production dependency automatically. `dist/` contains native browser modules and all original runtime assets; `server/` contains the authoritative simulation, account service, room persistence and gateway. No bundler or hosted asset account is needed.

Online expedition: `/expedition.html`. Up to sixteen players choose four roles on four teams. At least two opposing teams and every player ready are required. Construct all twelve modules, load four supplies, perform three engineering checks, choose a route, operate the ship, extract contested samples, return and deliver them. Cargo aboard does not score until delivered on Planet A.

WASD moves, Shift sprints, Space jumps, V changes camera, F1–F4 select an open role. E interacts or holds a tool, R rotates carried parts. On Planet B, 1–3 select weapons, R reloads, middle mouse throws a grenade and C crouches. In flight the Raider presses X for EVA; Space/Ctrl controls height, E services exterior plates and X boards at the airlock. Q / middle mouse / F activate crew abilities. The field manual and offline menu show the full controls.

The lobby account panel saves a career across browsers. Download its one-use recovery key. Password recovery rotates the key and revokes old sessions. Guest progress remains available without registration. Keep the server's `data/` directory private and persistent.

```sh
npm run start:cluster           # local gateway + two supervised workers
WORKERS=4 npm run start:cluster
npm test                       # model, DOM, assets, accounts, TLS, sockets and recovery
npm run test:integration        # offline runtime with mocked renderer
npm run test:browser            # actual Chromium gameplay and reported barrier regression
npm run test:features           # browser weapons, EVA, accounts and accessibility
npm run test:campaign-browser   # both actual campaign scenes with disclosed fixtures
npm run test:full-match         # ~6 min, sixteen automated clients, normal mission timings
npm run build                  # regenerate the versioned native-module entry
npm run package:release        # four ZIPs + SHA-256 manifest; Python 3 standard library
```

Development tests and packaging scripts are included in the source package; the Node deployment package contains runtime files. Browser tests require Playwright and a browser installation. Chromium defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` to override. `BROWSER=webkit` or `BROWSER=firefox` selects another engine for the feature test when its Playwright browser and system libraries are installed. These scripts never silently count an unavailable engine as passed.

See DEPLOY.md for Docker, WSS and multi-host workers, RELEASE_NOTES.md for the changes, and QA_REPORT.md for measured evidence and field-test limits. Historical PHASE* documents describe earlier releases; current acceptance is in REQUIREMENTS_STATUS.md.
