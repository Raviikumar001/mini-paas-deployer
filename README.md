# Brimble Deployment Pipeline

A self-contained deployment platform: paste a Git URL, get a running container behind Caddy. One page, one API, one `docker compose up`.

## Quick start

```bash
git clone <this-repo>
cd brimble
docker compose up --build
```

Open **http://localhost**, paste a public Git URL, click Deploy.

### Which URL to open

- Open `http://localhost`.
- Do **not** open port `5173` directly.
- `5173` is the frontend container's internal Vite server; Caddy is the public ingress on port `80` and routes both UI and API traffic.
- This project is documented for local Docker Compose usage; it is not presented here as an EC2-hosted deployment.

> **Prerequisites:** Docker with BuildKit support (Docker Desktop or Engine ≥ 23). No other accounts or tools required.

### Testing with the sample app

The `sample-app/` directory is a minimal Node HTTP server that reads `process.env.PORT`. To use it:

1. Push `sample-app/` to a new public GitHub repo.
2. Paste that URL into the UI.

Or use any public Node.js/Go/Python repo that reads `PORT` from the environment — Railpack auto-detects the stack.

---

## Architecture

```
Browser
  └── Caddy :80
        ├── /api/*       → backend:3001       (Hono API)
  ├── <subdomain>.localhost → dep-<id>:PORT (patched live via Caddy admin API)
        └── /*           → frontend:5173      (Vite dev server)

Backend (Hono + TypeScript + SQLite)
  ├── CRUD  POST/GET /api/deployments
  ├── SSE   GET /api/deployments/:id/logs
  └── Pipeline: git clone → railpack build → docker run → caddy patch

BuildKit  (moby/buildkit, TCP :1234)
  └── Railpack sends build instructions here

Deployed containers
  └── Joined to brimble_net — Caddy resolves them by container name
```

### How a deployment flows

```
POST /api/deployments { gitUrl }
  ↓ 202 + { id }          ← client opens SSE immediately

  git clone --depth=1 <url>
  railpack info → detect PORT (fallback: 3000)
  railpack build --name brimble-<id>:latest --cache-key <repo-name>
  docker run -d --name dep-<id> --network brimble_net --env PORT=<port>
  TCP probe dep-<id>:<port>  ← wait until app accepts connections
  POST caddy:2019/config/…/routes  ← add host route for <subdomain>.localhost
  status → running, url → http://<subdomain>.localhost
```

Build output streams to the UI in real time over SSE. When the pipeline ends (success or failure), `{ type: "done" }` is sent and the connection closes cleanly.

---

## Key design decisions

**Hono over Express**  
Hono has native `streamSSE` support, ships a tiny footprint, and runs on Web Standards. No middleware gymnastics for streaming.

**SQLite (better-sqlite3) over Postgres**  
Synchronous API maps cleanly onto the pipeline model — no async plumbing for simple DB writes. `WAL` mode gives concurrent reads without locking. One fewer compose service to manage.

**SSE over WebSocket**  
Log streaming is one-directional (server → client). SSE is simpler, works natively in browsers without a library, and survives HTTP/1.1 proxies including Caddy.

**Caddy JSON config (not Caddyfile)**  
The JSON admin API lets us insert and delete routes at runtime without a reload. Each deployment gets a route with an `@id` tag so deletion is a single `DELETE /id/dep-<id>` call.

**`docker-container://buildkit` for BuildKit**  
Railpack uses the Docker socket to exec into the named `buildkit` container and connect to its unix socket — no TLS certificates required. The TCP `tcp://` scheme is buildkitd's default gRPC listener which requires mTLS in recent versions; `docker-container://` avoids that entirely and is Railpack's own recommended approach.

**`--cache-key <repo-name>` on every build**  
Railpack/BuildKit keyed caches are per-repo by default through this flag. A second deploy of the same repo reuses cached layers with no extra infrastructure.

**Code-based TanStack Router (no Vite plugin)**  
One route (`/`). File-based routing with generated `routeTree.gen.ts` adds a build step and generated file churn for zero benefit on a single-page app. Code-based setup is 20 lines.

**Optimistic UI updates**  
`useCreateDeployment` prepends the new row before the server responds. `useDeleteDeployment` removes the row before confirmation. Combined with a 3-second refetch interval for status polling, the UI feels immediate even on slower builds.

**`waitForContainer` TCP probe before Caddy routing**  
Without this, Caddy is configured to route to a container that hasn't finished bootstrapping, and the first real request returns 502. The probe polls `:PORT` every 400ms up to 30s before handing off to Caddy.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `/data/db.sqlite` | SQLite file path |
| `CADDY_ADMIN` | `http://caddy:2019` | Caddy admin API base URL |
| `DOCKER_NETWORK` | `brimble_net` | Network deployed containers join |
| `BUILDKIT_HOST` | `docker-container://buildkit` | BuildKit daemon address |
| `PORT` | `3001` | Backend port |

All have sensible defaults — no `.env` file needed to run.

---

## Implemented in this repository

- One-page frontend built with Vite + TanStack Router + TanStack Query.
- Deployment creation from Git URL (`POST /api/deployments`).
- Deployment listing, detail fetch, delete, and redeploy endpoints.
- Deployment status lifecycle persisted in SQLite: `pending`, `building`, `deploying`, `running`, `redeploying`, `failed`, `stopped`.
- Real-time log streaming to the UI over SSE (`GET /api/deployments/:id/logs`) with replay of persisted logs.
- Railpack-based image build flow (no handwritten app Dockerfiles required for deployed apps).
- Container runtime orchestration via Docker (`run`, stop/remove, readiness wait).
- Dynamic Caddy ingress updates through Caddy Admin API for deployed app host routes.
- Build cache reuse via Railpack cache keying.
- End-to-end local startup with a single `docker compose up --build`.
