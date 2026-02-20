#!/usr/bin/env bash
set -euo pipefail

usage(){
  cat <<EOF
Usage: ./scripts/run-e2e-keep.sh [--no-commit] [--no-build]

This script runs an end-to-end demo and leaves containers running.
Steps performed:
  - (optional) commit demo artifacts locally
  - generate tokens (writes demo/.env.demo)
  - build images (unless --no-build)
  - start Docker Compose and wait for health

Run from repository root.
EOF
}

NO_COMMIT=0
NO_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-commit) NO_COMMIT=1; shift;;
    --no-build) NO_BUILD=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown option: $1"; usage; exit 2;;
  esac
done

REPO_ROOT="$(pwd)"
DEMO_COMPOSE="$REPO_ROOT/docker-compose.demo.yml"

if [ "$NO_COMMIT" -eq 0 ] && [ -x ./scripts/commit-demo.sh ]; then
  echo "Running local commit helper..."
  ./scripts/commit-demo.sh demo/unify-wire || echo "commit helper failed (continuing)"
fi

echo "Generating tokens (demo/.env.demo)..."
chmod +x ./scripts/generate-tokens.sh ./scripts/generate-jwt.js || true
./scripts/generate-tokens.sh

if [ "$NO_BUILD" -eq 0 ]; then
  echo "Building images..."
  chmod +x ./scripts/build-images.sh || true
  ./scripts/build-images.sh
else
  echo "Skipping build step (--no-build)"
fi

echo "Starting Docker Compose (leaving containers running)..."
docker compose -f "$DEMO_COMPOSE" up -d --build

echo "Waiting for services to become healthy (timeout ~2m)..."
WAIT_RETRIES=30
for i in $(seq 1 $WAIT_RETRIES); do
  if curl -sSf http://localhost:3000/health >/dev/null 2>&1 && curl -sSf http://localhost:8000/ >/dev/null 2>&1; then
    echo "Services healthy"
    break
  fi
  echo "Waiting... ($i/$WAIT_RETRIES)"
  sleep 2
done

if [ $i -ge $WAIT_RETRIES ]; then
  echo "Services did not become healthy in time" >&2
  docker compose -f "$DEMO_COMPOSE" ps
  docker compose -f "$DEMO_COMPOSE" logs --no-color --tail=200
  exit 3
fi

echo
echo "Demo is running. Useful commands:"
echo "  docker compose -f $DEMO_COMPOSE ps"
echo "  docker compose -f $DEMO_COMPOSE logs -f substrate"
echo "  docker compose -f $DEMO_COMPOSE logs -f edenfield-admin"
echo "To stop and remove containers: docker compose -f $DEMO_COMPOSE down"

echo
echo "Demo env file: demo/.env.demo"
echo "Use the ADMIN_API_TOKEN from that file when interacting with the admin API."

exit 0
