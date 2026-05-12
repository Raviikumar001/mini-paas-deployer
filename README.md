# nobuild Deployment Pipeline

A single-page PaaS: paste a public Git URL and get a live, auto‑subdomained web app — then click to redeploy, tail logs, or tear it down. Runs locally with one command on `*.localhost`, or on any server with `*.your-domain.com`.

## Quick start

```bash
git clone git@github.com:owner/repo.git
cd nobuild
docker compose up --build
```

Open **http://localhost**, paste a public Git URL, click Deploy.

### Which URL to open

- Open `http://localhost`.
- Do **not** open port `5173` directly.
- `5173` is the frontend container's internal Vite server; Caddy is the public ingress on port `80` and routes both UI and API traffic.

> **Prerequisites:** Docker with BuildKit support (Docker Desktop or Engine ≥ 23). No other accounts or tools required.

### Testing with the sample app

The `sample-app/` directory is a minimal Node HTTP server that reads `process.env.PORT`. To use it:

1. Push `sample-app/` to a new public GitHub repo.
2. Paste that URL into the UI.

Or use any public Node.js/Go/Python repo that reads `PORT` from the environment — Railpack auto-detects the stack.

---

## Features

- **One-page frontend** built with Vite + TanStack Router + TanStack Query
- **Git-based deployments** — paste a URL, backend clones, builds, and runs it
- **Deployment lifecycle** — `pending` → `building` → `deploying` → `running`, with `failed`, `stopped`, and `redeploying` states tracked in SQLite
- **Live log streaming** to the browser over SSE, with scroll-back of persisted logs
- **Zero-downtime redeploys** — old container keeps serving while the new image builds; Caddy upstream is atomically swapped once the new container is healthy
- **Startup reconciliation** — if the backend restarts, live containers are re-registered in Caddy and stale statuses are cleaned up
- **Build cache reuse** via Railpack cache keying
- **Environment variables** — pass runtime and build-time env vars (e.g. `NEXT_PUBLIC_*`, `VITE_*`) via the UI
- **Branch-based / preview deployments** — deploy any branch (not just `main`). Non-main branches get their own subdomain like `feature-auth-my-app-a4f0.localhost`
- **PostgreSQL & Redis sidecars** — attach Postgres and/or Redis containers to any deployment with one click. `DATABASE_URL` and `REDIS_URL` are injected automatically
- **GitHub webhook** — `POST /api/webhook/github` triggers redeploys on push events, or creates new preview deployments for unseen branches

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
  └── Joined to nobuild_net — Caddy resolves them by container name
```

### How a deployment flows

```
POST /api/deployments { gitUrl, branch?, addons? }
  ↓ 202 + { id }          ← client opens SSE immediately

  [start PostgreSQL / Redis sidecars if requested]
  git clone --depth=1 --branch <branch> <url>
  ┌─ railpack info → detect PORT (fallback: 3000)  ─┐  run in parallel:
  └─ railpack build --name nobuild-<id>:latest      ─┘  both only read srcPath
  docker run -d --name dep-<id> --network nobuild_net --env PORT=<port> --env DATABASE_URL=... --env REDIS_URL=...
  TCP probe dep-<id>:<port>  ← poll every 400ms, up to 60s
  POST caddy:2019/config/…/routes  ← add @id-tagged host route for <subdomain>.localhost
  status → running, url → http://<branch-><name-slug>-<4char-id>.localhost
```

`<name-slug>` is a URL-safe lowercased version of the deployment name (e.g. `my-app-a4f0.localhost`). The `@id` tag (`dep-<deploymentId>`) is used internally so deletion and upstream patching need only a single Caddy API call.

Build output streams to the UI in real time over SSE. When the pipeline ends (success or failure), `{ type: "done" }` is sent and the connection closes cleanly.

### How a zero-downtime redeploy flows

```
PATCH /api/deployments/:id/redeploy
  ↓ old container keeps serving traffic

  git clone --depth=1 <url>        (fresh src, separate tmp dir)
  ┌─ detect PORT  ─┐
  └─ build image  ─┘  (parallel — reuses BuildKit layer cache)
  docker run -d --name dep-<id>-<ts>  ← new container, unique timestamped name
  TCP probe new container             ← waits until healthy
  PATCH caddy /id/dep-<id>/handle/0/upstreams/0/dial  ← atomic upstream swap
  docker stop + rm old container      ← only after traffic is on new
  status → running
```

If the build or probe fails, the old container is left untouched and the deployment is marked `failed` — users never see a gap in service.

### GitHub webhook

```
POST /api/webhook/github
  ↓ parse push or pull_request payload
  ↓ extract repo URL + branch
  ↓ existing deployment for repo#branch ?
     yes → trigger redeploy (zero-downtime)
     no  → create new deployment
```

Test locally with curl:

```bash
curl -X POST http://localhost/api/webhook/github \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "refs/heads/staging",
    "repository": { "clone_url": "https://github.com/user/repo", "name": "repo" },
    "head_commit": { "id": "abc123", "message": "wip" }
  }'
```

For production-like webhook testing, set `GITHUB_WEBHOOK_SECRET` to the same value configured in GitHub. When this variable is present, the backend requires a valid `X-Hub-Signature-256` HMAC signature. When it is absent, unsigned webhooks are accepted for local development.

---

## Why these choices

**Hono over Express**  
Hono has native `streamSSE` support, ships a tiny footprint, and runs on Web Standards. No middleware gymnastics for streaming.

**SQLite (better-sqlite3) over Postgres**  
Synchronous API maps cleanly onto the pipeline model — no async plumbing for simple DB writes. `WAL` mode gives concurrent reads without locking. One fewer compose service to manage.

**SSE over WebSocket**  
Log streaming is one-directional (server → client). SSE is simpler, works natively in browsers without a library, and survives HTTP/1.1 proxies including Caddy.

**Caddy JSON config (not Caddyfile)**  
The JSON admin API lets me insert and delete routes at runtime without a reload. Each deployment gets a route with an `@id` tag so deletion is a single `DELETE /id/dep-<id>` call.

**`docker-container://buildkit` for BuildKit**  
Railpack uses the Docker socket to exec into the named `buildkit` container and connect to its unix socket — no TLS certificates required. The TCP `tcp://` scheme is buildkitd's default gRPC listener which requires mTLS in recent versions; `docker-container://` avoids that entirely and is Railpack's own recommended approach.

**`--cache-key <repo-name>` on every build**  
Railpack/BuildKit keyed caches are per-repo by default through this flag. A second deploy of the same repo reuses cached layers with no extra infrastructure.

**Code-based TanStack Router (no Vite plugin)**  
One route (`/`). File-based routing with generated `routeTree.gen.ts` adds a build step and generated file churn for zero benefit on a single-page app. Code-based setup is 20 lines.

**Optimistic UI updates**  
`useCreateDeployment` prepends the new row before the server responds. `useDeleteDeployment` removes the row before confirmation. Combined with a 3-second refetch interval for status polling, the UI feels immediate even on slower builds.

**`waitForContainer` TCP probe before Caddy routing**  
Without this, Caddy is configured to route to a container that hasn't finished bootstrapping, and the first real request returns 502. The probe polls `:PORT` every 400ms up to 60s before handing off to Caddy. The limit is 60s (not the more common 30s) because Next.js apps can take 40–50s to cold-start on a constrained build machine.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `/data/db.sqlite` | SQLite file path |
| `CADDY_ADMIN` | `http://caddy:2019` | Caddy admin API base URL |
| `DOCKER_NETWORK` | `nobuild_net` | Network deployed containers join |
| `BUILDKIT_HOST` | `docker-container://buildkit` | BuildKit daemon address |
| `PORT` | `3001` | Backend port |
| `GITHUB_WEBHOOK_SECRET` | unset | Optional GitHub webhook secret. When set, `POST /api/webhook/github` requires a valid `X-Hub-Signature-256` signature |

All have sensible defaults — no `.env` file needed to run.

---

## Known limitations / future work

- Only shows build logs right now, not deploy/runtime logs
- Polling the deployment list every 3 seconds works but is a bit noisy — eventually want SSE-driven invalidation instead
- CORS is wide open (`cors()` on `/api/*`) — should be origin-restricted for non-local use
- Deployment URLs hardcode `.localhost` — need an env-driven base domain for real hosting
- No build cancellation or queueing yet — overlapping heavy builds on a small machine can get rough
- The frontend is served by Vite's dev server in the container; for real production use it should be a static build served by Caddy
- No project upload (zip/tar) support yet — Git URL only
- PostgreSQL & Redis sidecars start fresh on every redeploy — no persistent volume for data yet
- Webhook endpoint has no signature verification — anyone can POST to it

---

## Cleanup note

Deployed containers (`dep-*`) are created by the pipeline, not by Docker Compose. If you want to fully tear down including those:

```bash
docker ps -a --filter "name=dep-" --format "{{.Names}}" | xargs -r docker rm -f
docker compose down
```
