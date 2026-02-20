# Mccss

[![E2E Demo](https://github.com/TuueNyzze/Mccss/actions/workflows/e2e-demo.yml/badge.svg)](https://github.com/TuueNyzze/Mccss/actions/workflows/e2e-demo.yml)

Unified demo for the MCCSS substrate (backend) and the Edenfield admin/frontend (UI).

Prerequisites
- Docker & Docker Compose v2 (for container demo)
- Node.js 18+ (for local, non-Docker run)
- `kubectl` and a Kubernetes cluster (optional)
- Optional: `jq` for pretty JSON in `local/prove.sh`

Quick start — Docker Compose

1. Build images locally:

```bash
chmod +x scripts/build-images.sh
./scripts/build-images.sh
```

2. Start the demo:

```bash
cd demo
chmod +x run-demo.sh
ADMIN_API_TOKEN=demo-token ./run-demo.sh
```

Or run the full flow (commit helper, build, compose up):

```bash
chmod +x run-all.sh scripts/commit-demo.sh
bash run-all.sh
```

Quick start — local Node (no Docker)

```bash
chmod +x local/run-local.sh local/prove.sh
bash local/run-local.sh
# in another terminal
bash local/prove.sh
```

Token generation

Generate an `ADMIN_API_TOKEN` and HMAC JWTs for `admin` and `user` roles:

```bash
chmod +x scripts/generate-tokens.sh scripts/generate-jwt.js
./scripts/generate-tokens.sh
```

Use the printed `ADMIN_API_TOKEN` when running the demo, for example:

```bash
ADMIN_API_TOKEN=<token-from-script> ./run-demo.sh
```

Kubernetes / Helm

- Demo k8s manifests: `k8s/demo/`
- Helm chart: `helm/demo/`
- Apply demo manifests:

```bash
./demo/deploy-k8s.sh
# optionally apply ingress
kubectl apply -f k8s/ingress-demo.yaml
```

To update the admin-token secret in-cluster:

```bash
kubectl create secret generic demo-admin-token --from-literal=token=<ADMIN_API_TOKEN> --dry-run=client -o yaml | kubectl apply -f -
```

CI / Images

- GitHub Actions workflow to build & push demo images: `.github/workflows/build-and-push-images.yml`
- Workflow pushes to GHCR; update workflow or values.yaml with your registry if needed.

Notes

- Environment variables used by demo scripts:
	- `JWT_SECRET` — default `dev-secret` (set this for real tests)
	- `ADMIN_API_TOKEN` — required by the Edenfield admin image/service
- Make scripts executable before running them (`chmod +x`).

If anything in these instructions doesn't work on your machine, tell me which step failed and I'll provide fixes or adjustments.