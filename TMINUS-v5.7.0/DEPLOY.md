# T-MINUS v5.7.0 deployment

Use Node.js 24 LTS (minimum 22.13). Online play requires the Node server; static hosting alone serves offline modes and the browser client.

```sh
npm ci --omit=dev --omit=optional
HOST=0.0.0.0 PORT=8095 DATA_DIR=./data npm start
```

`/` preserves offline practice, campaigns and Mission Control. `/expedition.html` is the shared expedition; `/online.html` is the retained arena. `/api/health` reports the version, room counts and persistence state. Configure a persistent writable data disk. Back up the full directory with the service stopped, or use a SQLite-aware backup. Do not ship the database, WAL files, account secrets or recovery downloads to static hosting.

## HTTPS and WebSockets

For a public service, terminate HTTPS with a reverse proxy that supports WebSocket upgrades on `/ws`. The client automatically uses WSS on an HTTPS page. The supplied Caddyfile forwards to `gateway:8095`. Caddy's public mode requires your own domain, DNS, reachable ports 80/443 and hosting account; this release does not provision them.

Alternatively set both `TLS_CERT` and `TLS_KEY` to PEM file paths for native HTTPS/WSS. Certificate verification remains enabled. A private CA must be trusted through `NODE_EXTRA_CA_CERTS` on gateway/worker processes that call it. For native TLS with local workers, the certificate must cover `localhost` because their profile RPC uses that name; `PROFILE_SERVICE_URL` can override it.

Same-origin browser connections are accepted by default. When the static client is on another origin, set `ALLOWED_ORIGINS=https://your-client.example` (comma-separated exact origins) and choose `wss://your-server.example/ws` in the client. Account requests use the same selected server. Use HTTPS for public account credentials.

## Docker

```sh
docker compose up --build
```

The image installs the pinned `ws` dependency and runs as the unprivileged `node` user. The data volume persists across container replacement. In an environment with a private HTTPS package proxy, supply its CA without storing it in the image:

```sh
docker build --secret id=npm_ca,src=/path/to/trusted-ca-bundle.pem -t tminus:5.7.0 .
```

Local build and startup were tested. Deploying on a public provider is a separate operator action.

## Multiple room workers

```sh
WORKERS=4 DATA_DIR=./data npm run start:cluster
```

The gateway owns durable accounts and progression; each worker owns a separate room database. The first two room-code characters select a stable worker ID. New rooms choose a healthy least-loaded worker. Matchmaking searches workers' open rooms. Public snapshots use negotiated WebSocket compression; private worker transport avoids double compression. A room stays on one authoritative worker.

The local supervisor restarts a crashed worker using the same ID and database. Clients reconnect through the gateway with the same room code and seat credentials. Recent rooms (checkpoints less than two minutes old) recover after restart. Rooms checkpoint every five seconds; match start and orderly shutdown also save. An abrupt process/host failure can roll back up to the last checkpoint. Disconnected seats are reserved for sixty seconds. Restored processes pause downtime, then continue the recovered simulation. This is checkpoint recovery, not live migration or zero-loss failover.

For separate hosts, use stable worker IDs, private reachable addresses, persistent per-worker disks and the same random `CLUSTER_KEY` (at least 32 characters). Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Keep it outside source control.

- Gateway: `CLUSTER_WORKERS='[{"id":"00","url":"http://worker-a:8096"},{"id":"01","url":"http://worker-b:8096"}]' npm run start:cluster`.
- Worker A: `WORKER_ID=00 PORT=8096 PROFILE_SERVICE_URL=http://gateway:8095 node server/cluster-worker.mjs`.
- Worker B: the same command with `WORKER_ID=01` and its own data directory.

Workers authenticate internal requests with the cluster key and reject direct untrusted WebSocket connections. Restrict worker and profile-coordinator ports to your private network. Multiple gateways can use the same worker map and a common `PROFILE_SERVICE_URL`; only the coordinator owns the profiles database. Do not share one SQLite room file between worker processes.

`compose.cluster.yaml` supplies a two-worker private network, coordinator and separate data volumes. Run it with `docker compose -f compose.cluster.yaml up --build`. Add `--profile public` and `PUBLIC_HOST=your-domain.example` to enable Caddy. Its optional public configuration has not been deployed to a real domain in this task. Existing rooms must keep their worker ID and durable storage during scaling; drain a worker before permanently removing it.

## Static client

Upload the contents of `dist/` to a static host. Connect network play to the Node service as described above. All models, textures, sounds and browser dependencies are included. No account database belongs in this package.
