# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo is a **demo/deployment wrapper** that unifies two Node.js applications and runs them together via Docker Compose, Kubernetes/Helm, or plain `node`:

- **MCCSS substrate** — the backend (`MCCSS--main/`): an Express API (task engine, JWT/JWKS auth, governance/audit, Vault secret hydration, a mobile/AI patch-drafting API).
- **Edenfield admin/frontend** — the UI (`MCCSS--main/Edenfield-main/`): a PWA-style admin app (identity, sync, conflict resolution, permissions) with its own Express admin server.

Everything at the repo root (`demo/`, `local/`, `scripts/`, `helm/demo/`, `k8s/demo/`, `docker-compose.demo.yml`, `Makefile`, `run-all.sh`) is orchestration glue this repo adds on top of those two vendored apps to run/build/deploy them together and prove an end-to-end flow.

## Repository layout — read this before editing

The two applications were imported by extracting uploaded zip archives, and the archives themselves are still committed. Layout is **not flat**:

```
MCCSS--main.zip                     # committed archive of MCCSS--main/ (do not edit)
MCCSS--main/                        # the substrate app — server.js is the real backend entrypoint
├── server.js                       # substrate Express app (imports Edenfield-main/config.js!)
├── core/                           # substrate core modules (ai.js, vault.js, mobile-api.js, + forked copies of Edenfield's core)
├── bin/                            # backup.js, rotate-lease-secret.js
├── Edenfield-main.zip              # committed archive of Edenfield-main/ (do not edit)
└── Edenfield-main/                 # the admin/frontend app, nested one level inside the substrate
    ├── server.js                   # a near-duplicate of ../server.js (own build/serve entrypoint)
    ├── bin/admin-server.js         # actual admin API/UI entrypoint used by demos
    └── core/                       # Edenfield's own core modules
```

Consequences for making changes:
- **`MCCSS--main/core/*.js` and `MCCSS--main/Edenfield-main/core/*.js` are separate, partially-diverged forks**, not symlinks (`conflict.js`, `sync.js`, and `task-engine.js` are currently identical; `audit.js`, `events.js`, `governance.js`, `identity.js`, `router.js`, `state.js` are not). When fixing a bug in shared logic, check both copies and decide deliberately whether the fix belongs in one or both — don't assume editing one updates the other.
- The substrate's `server.js` imports config from `./Edenfield-main/config.js`, so the two apps are not independently deployable as committed — the substrate Docker build always copies the whole `MCCSS--main` tree including `Edenfield-main/`.
- Do not edit `MCCSS--main.zip` or `MCCSS--main/Edenfield-main.zip`; they're stale snapshots left over from the import and aren't rebuilt from source.
- Root-level `demo/`, `docker-compose.demo.yml`, `helm/demo/`, `k8s/demo/`, `scripts/` are the orchestration layer; `MCCSS--main/docker-compose.yml`, `MCCSS--main/helm/`, `MCCSS--main/k8s/` are an older/alternate set scoped to the substrate alone. Prefer the root-level demo variants unless a task specifically targets the substrate-only ones.

## Architecture

### Substrate (`MCCSS--main/server.js`)
Express app exposing:
- `GET /health`, `GET /metrics` (Prometheus via `prom-client`)
- `POST/GET /api/v1/tasks` — protected by JWT auth (`core/middleware/auth.js`), backed by `core/task-engine.js` (`Engine.schedule`/`Engine.list`)
- `/mobile/*` — mounted from `core/mobile-api.js`: a chat/patch-drafting API designed for AI-assisted changes. It writes drafts to `.ai_requests/`, and `/mobile/apply` can write arbitrary files into the working tree (and optionally `git commit`) when `ALLOW_APPLY=1` or a matching `X-Apply-Secret` header is supplied — this is a real filesystem/git-write path, treat it as security-sensitive.
- Governance middleware audits every request (`core/governance.js`); `core/vault.js` does best-effort secret hydration from HashiCorp Vault (`VAULT_ADDR`/`VAULT_TOKEN`) at boot, failing open.

Auth (`core/middleware/auth.js`): verifies a Bearer JWT either against `JWT_SECRET` (default `dev-secret`) or, when `JWKS_URI` is set, against a JWKS endpoint (RS256/384/512). Setting `NO_AUTH=1` bypasses auth entirely (used for local/dev only). The resolved role is written into `PermissionContext.current.role`.

### Edenfield admin/frontend (`MCCSS--main/Edenfield-main/`)
A layered app (see `Edenfield-main/ARCHITECTURE.md` for the original design doc) with these layers, each a thin module under `core/`:
- **Identity** (`identity.js`) → **State/Events** (`state.js`, `events.js`) → **Permissions** (`permissions/roles.js`, `capabilities.js`, `guards.js`, `enforce.js`, `context.js` — role→capability RBAC, e.g. `system`/`user`/`organism`/`guest`) → **Data** (`data/document-store.js`, `data/table-store.js`, `data/import.js`/`export.js`) → **Sync/Conflict** (`sync.js`, `sync-queue.js`, `sync-worker.js`, `sync-log.js`, `conflict.js`) → **Network** (`network.js`, `sync-api.js`).
- `bin/admin-server.js` is the actual admin HTTP server (token-protected via `ADMIN_API_TOKEN`, optional OIDC via `OIDC_JWKS_URI`, optional TLS/mTLS via `ADMIN_TLS_KEY`/`ADMIN_TLS_CERT`/`ADMIN_MTLS`).
- `bin/watch-build.js` is a dev-time file watcher/build trigger (`BUILD_*` env vars).

### Request flow
`User/API action → router/permission guard → state update → sync queue → sync worker → sync-api (network) → remote sync`, with conflict resolution applied on merge. Permission checks happen at queue, network, and storage boundaries, not just at the HTTP edge.

## Development workflows

There is no root-level `package.json`; only `MCCSS--main/Edenfield-main/package.json` defines npm scripts, and that's where `npm` commands must be run from. `MCCSS--main/` itself has a stray empty `package-lock.json` and no `package.json` — its dependencies (express, helmet, etc.) are resolved via `Edenfield-main`'s `node_modules`.

**Install / lint / test (from `MCCSS--main/Edenfield-main/`):**
```bash
cd MCCSS--main/Edenfield-main
npm ci
npm run lint            # eslint .
npm test                # jest --detectOpenHandles --runInBand (tests/*.spec.js, tests/*.test.js)
npm run test:unit       # node ./scripts/run-unit-tests.js — plain-node assertions, no jest needed
npm run seed:data       # node ./scripts/seed_synthetic.js
```
Run a single Jest test file: `npx jest tests/leases.spec.js`. Run a single test by name: `npx jest -t "test name"`.

**Full unified demo (from repo root), via Makefile:**
```bash
make check          # verify docker/node/jq/kubectl are present
make gen-tokens      # scripts/generate-tokens.sh → prints ADMIN_API_TOKEN + admin/user JWTs, writes demo/.env.demo
make build-images    # scripts/build-images.sh → builds mccss-substrate:demo and edenfield-admin:demo
make demo-up         # cd demo && ./run-demo.sh (needs ADMIN_API_TOKEN)
make demo-down       # docker compose -f docker-compose.demo.yml down
make e2e-keep        # scripts/run-e2e-keep.sh — full e2e run, leaves containers up for inspection
make run-local       # local/run-local.sh — runs both apps with plain `node`, no Docker
```
Substrate listens on `:3000`, Edenfield admin UI on `:8000` (admin API on `:9321`). After starting, `bash local/prove.sh` (or `demo/prove-e2e.sh`) hits `/health` and `/` to sanity-check both are up.

Generate a single JWT ad hoc: `node scripts/generate-jwt.js <role> <secret> [expiresIn]` (role is embedded in the payload; default secret is `$JWT_SECRET` or `dev-secret`).

## Key conventions

- **ESLint** (`Edenfield-main/.eslintrc.json`): 2-space indent, double quotes, semicolons required, `eqeqeq`, `no-var`/`prefer-const`, 1tbs braces — this is the style to match anywhere under `Edenfield-main/`.
- **ESM everywhere**: both apps use `"type": "module"` — use `import`/`export`, not `require`.
- Config/env values are read directly via `process.env.*` at point of use (no centralized config object beyond `Edenfield-main/config.js`); when adding a new tunable, follow that pattern and document the var in `.env.example`.
- Notable env vars: `JWT_SECRET`, `JWKS_URI`, `NO_AUTH`, `ADMIN_API_TOKEN`, `ADMIN_PORT`, `OIDC_JWKS_URI`, `ADMIN_TLS_KEY`/`ADMIN_TLS_CERT`/`ADMIN_MTLS`, `VAULT_ADDR`/`VAULT_TOKEN`/`VAULT_PATH`, `RATE_LIMIT`, `SYNC_INTERVAL_MS`, `AUDIT_RETENTION_CHECK_MS`, `LEASE_SIGNING_SECRET`/`LEASE_SECRET_PATH`, `ALLOW_APPLY`/`APPLY_SECRET`/`GIT_APPLY_COMMIT` (mobile `/mobile/apply` write-gate), `OPENAI_API_KEY` (enables `core/ai.js`).
- CI (`.github/workflows/e2e-demo.yml` at repo root) drives the whole stack through Docker Compose and exercises the authenticated `/api/v1/tasks` endpoint plus the `/mobile/patch` → `/mobile/apply` flow as its smoke test — treat that workflow as the closest thing to an integration test spec for cross-app changes. `.github/workflows/build-and-push-images.yml` builds/pushes both images to GHCR on pushes to `main`/`demo/*`. `MCCSS--main/.github/workflows/ci.yml` and `Edenfield-main/.github/workflows/*.yml` are narrower per-app CI (lint/unit tests only).
