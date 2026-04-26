# Brimble Deployment Pipeline

A self-contained deployment platform: paste a Git URL, get a running container behind Caddy. One page, one API, one `docker compose up`.

## Quick start

```bash
git clone <this-repo>
cd brimble
docker compose up --build
```

Open **http://localhost**, paste a public Git URL, click Deploy.

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
        ├── /p/:id/*     → dep-<id>:PORT      (patched live via Caddy admin API)
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
  POST caddy:2019/config/…/routes/0  ← insert route before frontend catch-all
  status → running, url → /p/<id>
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

**TCP BuildKit instead of `docker-container://`**  
`docker-container://buildkit` works by shelling out `docker exec` for every build request — that's three moving parts (Docker socket → Docker daemon → buildkit exec). With `tcp://buildkit:1234`, the backend connects to BuildKit directly over the compose network. One hop, no Docker socket needed for the build path.

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
| `BUILDKIT_HOST` | `tcp://buildkit:1234` | BuildKit daemon address |
| `PORT` | `3001` | Backend port |

All have sensible defaults — no `.env` file needed to run.

---

## What I'd do with more time

- **Zero-downtime redeploys**: spin up the new container first, health-check it, then swap the Caddy upstream weight from old to new, then kill the old one. Caddy's load-balancer supports this without a restart.
- **Postgres + migrations**: SQLite is fine for one process but breaks with horizontal scaling. `drizzle-orm` migrations would replace the raw `initDb()` exec.
- **File upload (zip) deploys**: the API shape is already designed for it — the pipeline just needs a "receive zip → extract → build" path alongside the git clone path.
- **Build cancellation**: kill the `railpack` process on DELETE of a building deployment; propagate `SIGTERM` down the process group.
- **Structured BuildKit progress**: Railpack outputs BuildKit progress protocol text. Parsing it would give richer log segments (step names, timing, layer IDs) rather than raw lines.
- **Container resource limits**: `docker run --memory 512m --cpus 1` to prevent a single build from starving everything else.

## What I'd rip out

- The `setMaxListeners(200)` call on the EventEmitter — proper connection tracking with a `Map<string, Set<listener>>` would be cleaner and not hide potential leaks.
- The 3-second polling interval on the deployment list — if I push status changes over SSE and invalidate the query there (we do), the poll is purely a safety net. I'd either lean fully into the SSE path or drop it to 10s.
- The Vite dev server in the frontend container — swap for a multi-stage Dockerfile that builds to `dist/` and serves via Caddy. Dev server in production is fine for a take-home but wrong for real use.

---

## Rough time spent

~8 hours across planning, implementation, and debugging.

---

## Brimble deploy

**Deployed URL:** *(link here)*

**Feedback:**  
*(write-up here — to be filled after deploying on brimble.com)*
