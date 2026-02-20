Demo: unified MCCSS substrate + Edenfield admin

Quick start

- Ensure Docker and Docker Compose v2 are installed.
- From the repository root, run:
This folder contains a small demo wrapper to run the MCCSS substrate (backend) and the Edenfield admin UI together via Docker Compose.

Prerequisites
- Docker & Docker Compose v2

Quick start (recommended)

```bash
# from repo root
cd demo
chmod +x run-demo.sh
ADMIN_API_TOKEN=demo-token ./run-demo.sh
```

What this does
- Builds `mccss-substrate:demo` and `edenfield-admin:demo` from the workspace
- Starts the backend on port 3000 and the admin UI on port 8000 (admin API on 9321)

Token generation

Generate an admin API token and JWTs with:

```bash
chmod +x ../scripts/generate-tokens.sh
../scripts/generate-tokens.sh
```

Use the printed `ADMIN_API_TOKEN` to start the demo, e.g.:

```bash
ADMIN_API_TOKEN=<token-from-script> ./run-demo.sh
```

Notes
- The demo compose mounts the source directories into the containers for fast iteration; remove the `volumes` entries in `docker-compose.demo.yml` for production-style builds.
- To build images locally without the helper, run `../scripts/build-images.sh`.
- For Kubernetes deployment, see `../k8s/demo/` and `../demo/deploy-k8s.sh`.

Token generation

- You can generate demo tokens with `scripts/generate-tokens.sh`. It will print an `ADMIN_API_TOKEN` and HMAC JWTs for `admin` and `user` roles (signed with `JWT_SECRET`, default `dev-secret`). Example:

```
./scripts/generate-tokens.sh
```

- Use the printed `ADMIN_API_TOKEN` when running the demo, e.g.:

```
ADMIN_API_TOKEN=<token-from-script> ./run-demo.sh
```
