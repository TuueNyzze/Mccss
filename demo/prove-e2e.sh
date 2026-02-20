#!/usr/bin/env bash
set -euo pipefail

# End-to-end demo proof script (Docker Compose)
# - Generates tokens (demo/.env.demo)
# - Builds images
# - Brings up compose
# - Waits for health endpoints
# - Calls authenticated endpoint to create a task
# - Tears down compose

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_COMPOSE="$ROOT/docker-compose.demo.yml"

echo "Generating tokens..."
bash ../scripts/generate-tokens.sh

echo "Building images..."
bash ../scripts/build-images.sh

echo "Starting docker compose..."
docker compose -f "$DEMO_COMPOSE" up -d --build

WAIT_RETRIES=30
for i in $(seq 1 $WAIT_RETRIES); do
  if curl -sSf http://localhost:3000/health >/dev/null 2>&1 && curl -sSf http://localhost:8000/ >/dev/null 2>&1; then
    echo "Services healthy"
    break
  fi
  echo "Waiting for services... ($i/$WAIT_RETRIES)"
  sleep 2
done

if [ $i -eq $WAIT_RETRIES ]; then
  echo "Services did not become healthy in time" >&2
  docker compose -f "$DEMO_COMPOSE" logs --no-color
  exit 2
fi


echo "Reading JWT and ADMIN_API_TOKEN from demo/.env.demo"
set -o allexport
source demo/.env.demo
set +o allexport

echo "Creating a sample task via protected API (requires admin JWT)"
ADMIN_JWT=$(node ../scripts/generate-jwt.js admin "$JWT_SECRET")

RESPONSE=$(curl -sS -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"id":"demo-task","intervalMs":1000000}') || true

echo "API response: $RESPONSE"

echo "Tearing down compose"
docker compose -f "$DEMO_COMPOSE" down

echo "E2E demo proof finished"
