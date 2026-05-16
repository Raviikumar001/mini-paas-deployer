# Encore-Aligned Improvement Checklist

This checklist focuses the project on the values Encore emphasizes publicly: developer experience, golden paths, production-like environments, preview deployments, secure infrastructure automation, and observability.

## 1. Secure Deployment Entrypoints

- [x] Add GitHub webhook signature verification with `GITHUB_WEBHOOK_SECRET`.
- [x] Document webhook secret setup in `README.md` and `.env.example`.
- [x] Add request-size limits for webhook and deployment creation payloads.
- [x] Validate supported Git hosts and URL schemes more strictly.

Why it matters for Encore: platform automation should be easy to use, but not casually open to untrusted callers.

## 2. Safer Secrets And Environment Variables

- [x] Split plain environment variables from secret variables in the API.
- [x] Mask secrets in the UI by default and avoid returning secret values from list endpoints.
- [x] Preserve secrets across redeploys without exposing them in deployment JSON.
- [x] Add tests for secret update and redeploy behavior.

Why it matters for Encore: teams need self-service infrastructure with guardrails, not just convenience.

## 3. Persistent Add-On Infrastructure

- [ ] Add named Docker volumes for PostgreSQL sidecars.
- [ ] Add named Docker volumes for Redis sidecars when persistence is requested.
- [ ] Define deletion semantics: remove app only, or remove app plus data.
- [ ] Show add-on health and connection status in the deployment row.

Why it matters for Encore: add-ons should feel like real infrastructure resources, not disposable demo containers.

## 4. Deployment Event Timeline

- [ ] Add a `deployment_events` table with event type, message, metadata, and timestamp.
- [ ] Record lifecycle milestones such as clone, build, healthcheck, route swap, runtime start, failure, and delete.
- [ ] Render a compact timeline in the expanded deployment view.
- [ ] Use events to make failure debugging clearer than raw logs alone.

Why it matters for Encore: good platforms explain what happened and why, especially when something fails.

## 5. Production-Like Preview Workflows

- [ ] Add GitHub pull request webhook handling with deterministic preview deployment naming.
- [ ] Add automatic cleanup for closed or merged pull request previews.
- [ ] Surface source branch, commit SHA, and commit message in the UI.
- [ ] Add a manual "promote" or "redeploy from latest commit" workflow.

Why it matters for Encore: preview environments are most valuable when they are automatic, traceable, and low-friction.

## 6. Observability And Architecture Awareness

- [ ] Add deployment health history and uptime checks.
- [ ] Add build duration, deploy duration, and last failure summaries.
- [ ] Detect basic app profile: framework, language, port, start command, attached resources.
- [ ] Render a small topology view: public URL -> app container -> Postgres/Redis.

Why it matters for Encore: developer platforms should reduce cognitive load by making systems visible.

## 7. Local Developer Experience

- [ ] Add a single verified local setup path and troubleshoot guide.
- [x] Fix `.env.example` network naming drift.
- [x] Retry Caddy static route registration during Docker Compose startup.
- [ ] Add smoke tests for Docker Compose boot and health endpoint routing.
- [ ] Add sample webhook commands for signed and unsigned local development.

Why it matters for Encore: the first-run experience is part of the product, not an afterthought.
