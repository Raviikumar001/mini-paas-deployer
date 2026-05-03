# Brimble Take-Home — Deployment Pipeline


## What We're Building

A mini-PaaS in a box:
- User pastes a Git URL in the UI
- Backend clones it, runs **Railpack** to build a container image
- Runs the container on a shared Docker network
- **Caddy** (single ingress) gets a new route patched via its admin API
- Build/deploy logs stream live to the UI over **SSE**
- Everything starts with `docker compose up`

**What gets deployed through our pipeline:** any app Railpack can detect — Node backends, Vite frontends (Railpack serves static builds with Caddy internally), Go servers, etc.

**Brimble deploy (separate requirement):** deploy the take-home frontend (or a hello-world) on brimble.com and submit honest written feedback. This is scored independently (5%) and must not be skipped.

---

## Verified Package Versions (April 2026)

| Package | Version | Notes |
|---|---|---|
| `hono` | `^4.12.14` | backend framework |
| `@hono/node-server` | `^1.x` | Node adapter for Hono |
| `better-sqlite3` | `^12.9.0` | SQLite, sync API |
| `@types/better-sqlite3` | latest | |
| `nanoid` | `^5.x` | deployment IDs |
| `vite` | `^8.0.9` | Vite 8 ships Rolldown (Rust bundler), major change from v5 |
| `@tanstack/react-router` | `^1.168.7` | stable React Router |
| `@tanstack/react-query` | `^5.99.2` | |
| `@vitejs/plugin-react` | `^4.x` | |
| `react` + `react-dom` | `^19.x` | |
| `typescript` | `^5.x` | |
| `tsx` | `^4.x` | TS runner (no build step for backend dev) |
| **Node Docker base** | `node:22-bookworm-slim` | Node 20 hits EOL April 2026 — use 22 LTS |
| **Caddy Docker** | `caddy:2.11` | latest stable |
| **BuildKit Docker** | `moby/buildkit:latest` | required by Railpack |
| **Railpack binary** | `0.22.2` | installed via install.sh in backend Dockerfile |

---

## Architecture

```
Browser
  └── Caddy :80                         single ingress
        ├── /api/*       → backend:3001
        ├── /p/:id/*     → dep-<id>:<port>   (patched live via Caddy admin API)
        └── /*           → frontend:5173

Backend  (Hono + TypeScript + SQLite)
  ├── CRUD routes for deployments
  ├── SSE log stream  GET /api/deployments/:id/logs
  ├── Pipeline runner  (git clone → railpack → docker run → caddy patch)
  └── Mounts /var/run/docker.sock  (runs docker/railpack against host daemon)

BuildKit service  (moby/buildkit, privileged)
  └── Required by Railpack — started as compose service

Deployed Containers
  └── --network brimble_net so Caddy can reach them by container name
```

---

## Directory Layout

```
brimble/
├── docker-compose.yml
├── caddy/
│   └── config.json              Caddy JSON config — patchable via admin API at :2019
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             Hono app + server entrypoint
│       ├── db/
│       │   └── schema.ts        SQLite init + query helpers (better-sqlite3)
│       ├── routes/
│       │   ├── deployments.ts   POST / GET /api/deployments
│       │   └── logs.ts          SSE  GET /api/deployments/:id/logs
│       └── services/
│           ├── pipeline.ts      orchestrator: clone → build → run → route
│           ├── builder.ts       git clone + railpack build (child_process, log emit)
│           ├── runner.ts        docker run / stop / rm helpers
│           └── caddy.ts         Caddy admin API — insert/delete route by @id
├── frontend/
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── router.tsx           TanStack Router — single "/" route
│       └── routes/
│           └── index.tsx        the one page
└── sample-app/
    ├── package.json
    └── index.js                 simple Node HTTP server — used to demo a deploy
```

---

## Database Schema

```sql
CREATE TABLE deployments (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  source_url     TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  image_tag      TEXT,
  container_id   TEXT,
  container_name TEXT,
  app_port       INTEGER DEFAULT 3000,
  url            TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
-- status: pending | building | deploying | running | failed | stopped

CREATE TABLE log_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id  TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  stream         TEXT NOT NULL DEFAULT 'system',   -- stdout | stderr | system
  message        TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
```

---

## API Surface

```
POST   /api/deployments              { gitUrl: string }  →  { id, status, createdAt }
GET    /api/deployments              []Deployment
GET    /api/deployments/:id          Deployment
DELETE /api/deployments/:id          stop + remove container (bonus)

GET    /api/deployments/:id/logs     SSE — text/event-stream
  data: { type:"log",    stream:"stdout"|"stderr"|"system", message, ts }
  data: { type:"status", status: "building"|"deploying"|"running"|"failed" }
  data: { type:"done" }
```

On SSE connect: flush all persisted log_lines first (scroll-back), then subscribe EventEmitter for live lines.

---

## Pipeline Steps

```
POST /api/deployments
  → insert row  status=pending
  → 202 + { id }
  → pipeline.run(id, gitUrl)  [fire-and-forget async]

pipeline.run():
  1. git clone <url> /tmp/build-<id>           emit system logs
     status → building

  2. parse detected port from `railpack analyze`
     default 3000 if undetectable

  3. railpack build /tmp/build-<id>
        --name brimble-<id>:latest
     stream stdout/stderr → EventEmitter + persist to log_lines

  4. on build failure → status=failed, done

  5. docker rm -f dep-<id>  (safe on redeploy)
     docker run -d
       --name dep-<id>
       --network brimble_net
       brimble-<id>:latest
     status → deploying

  6. PATCH Caddy admin API
     POST /config/apps/http/servers/srv0/routes/0
     { @id:"dep-<id>", match:[/p/<id>/*], handle:[strip prefix + reverse_proxy dep-<id>:<port>] }

  7. status → running
     url = /p/<id>

  8. rm -rf /tmp/build-<id>
     emit { type:"done" }
```

---

## Caddy Config Strategy

Start with a static JSON config. New deployment routes are **inserted at index 0** so they always win before the frontend catch-all.

```json
{
  "admin": { "listen": "0.0.0.0:2019" },
  "apps": {
    "http": {
      "servers": {
        "srv0": {
          "listen": [":80"],
          "routes": [
            {
              "@id": "api",
              "match": [{ "path": ["/api/*"] }],
              "handle": [{ "handler": "reverse_proxy", "upstreams": [{ "dial": "backend:3001" }] }]
            },
            {
              "@id": "frontend",
              "handle": [{ "handler": "reverse_proxy", "upstreams": [{ "dial": "frontend:5173" }] }]
            }
          ]
        }
      }
    }
  }
}
```

When deploying, backend calls:
```
POST http://caddy:2019/config/apps/http/servers/srv0/routes/0
{ "@id":"dep-<id>",
  "match":[{"path":["/p/<id>/*", "/p/<id>"]}],
  "handle":[
    {"handler":"rewrite","strip_path_prefix":"/p/<id>"},
    {"handler":"reverse_proxy","upstreams":[{"dial":"dep-<id>:<port>"}]}
  ]
}
```

On stop/delete: `DELETE http://caddy:2019/id/dep-<id>`

---

## Railpack Notes

- Railpack needs a **BuildKit daemon** — add `moby/buildkit` as a privileged compose service
- Backend sets `BUILDKIT_HOST=docker-container://buildkit`
- Railpack binary installed in backend Dockerfile via `curl -fsSL https://railpack.com/install.sh | sh`
- For Vite/static frontends: Railpack auto-detects and **uses Caddy internally** in the built container to serve the `dist/` folder — no manual Dockerfile needed
- Port detection: `railpack analyze <path>` → parse JSON output for `deploy.startCommand` or `PORT` env

---

## Docker Compose Sketch

```yaml
networks:
  brimble_net:
    driver: bridge

services:
  caddy:
    image: caddy:2.11
    ports: ["80:80", "2019:2019"]
    volumes: ["./caddy/config.json:/config/caddy.json:ro"]
    command: caddy run --config /config/caddy.json
    networks: [brimble_net]
    restart: unless-stopped

  buildkit:
    image: moby/buildkit:latest
    privileged: true
    networks: [brimble_net]
    restart: unless-stopped

  backend:
    build: ./backend
    networks: [brimble_net]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
    environment:
      - DATABASE_PATH=/data/db.sqlite
      - CADDY_ADMIN=http://caddy:2019
      - DOCKER_NETWORK=brimble_net
      - BUILDKIT_HOST=docker-container://buildkit
    depends_on: [caddy, buildkit]
    restart: unless-stopped

  frontend:
    build: ./frontend
    networks: [brimble_net]
    restart: unless-stopped
```

---

## Frontend — One Page Layout

```
┌──────────────────────────────────────────────┐
│  Brimble Deployments                         │
├──────────────────────────────────────────────┤
│  Git URL [_______________________] [Deploy]  │
├──────────────────────────────────────────────┤
│  ● my-app      building   brimble-abc:latest │
│    ▼ Logs                                    │
│    [system] Cloning repo...                  │
│    [stdout] Step 1/5: FROM node:22...        │
├──────────────────────────────────────────────┤
│  ● hello-world  running   /p/xyz  [open ↗]  │
└──────────────────────────────────────────────┘
```

- TanStack Query polls `GET /api/deployments` every 3s
- SSE per expanded log panel — connects on expand, disconnects on collapse
- Status badge colours: grey(pending) → yellow(building) → blue(deploying) → green(running) → red(failed)

---

## Known Risks

| Risk | Mitigation |
|---|---|
| Railpack can't detect port | Default to 3000; parse `railpack analyze` JSON |
| Docker socket permissions | Run backend as root in Dockerfile (note this in README) |
| Caddy route ordering race | Serialize Caddy API calls with an async mutex |
| BuildKit container name collision | Named `buildkit` in compose — deterministic |
| Deployed containers not on brimble_net | Pass `--network brimble_net` explicitly in `docker run` |
| Large repos / slow builds | Out of scope; log a "building..." line so SSE stays alive |

---

## Build Phases (Core First)

| # | Phase | Status |
|---|---|---|
| 1 | Repo init: docker-compose + caddy config + network skeleton | [x] |
| 2 | Backend: Hono server + SQLite schema + CRUD routes | [x] |
| 3 | Pipeline: git clone + railpack build (with log streaming) | [x] |
| 4 | Pipeline: docker run + Caddy admin API patch | [x] |
| 5 | SSE endpoint (EventEmitter → client, flush history on connect) | [x] |
| 6 | Frontend: form + deployment list + SSE log panel | [x] |
| 7 | Sample app + smoke test `docker compose up` end-to-end | [x] |
| 8 | Bonus: redeploy endpoint | [ ] |
| 9 | README + Loom recording | [x] |
| 10 | Deploy on brimble.com + write feedback | [ ] |

---

## Commit Checkpoints

Suggested commits as we finish each phase:

1. `chore: project scaffold — compose, caddy config, backend/frontend structure`
2. `feat: backend api — deployments crud and sqlite schema`
3. `feat: pipeline — git clone and railpack build with log streaming`
4. `feat: pipeline — docker run and caddy dynamic routing`
5. `feat: sse log streaming endpoint`
6. `feat: frontend — deployment form, status list, live log panel`
7. `feat: sample-app and end-to-end smoke test`
8. `feat: redeploy endpoint` *(bonus)*
9. `docs: readme with architecture, decisions, and setup`

---

## Out of Scope

- Auth / multi-tenancy
- Kubernetes
- Pretty UI / design system
- Exhaustive test coverage
- Production hardening (TLS, secrets management)
