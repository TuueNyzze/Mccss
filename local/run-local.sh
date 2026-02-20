#!/usr/bin/env bash
set -euo pipefail

# Quick local runner for MCCSS substrate + Edenfield admin WITHOUT Docker
# Usage: from repo root: bash local/run-local.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBSTRATE_CMD=(node "$ROOT/MCCSS--main/server.js")
EDEN_CMD=(node "$ROOT/MCCSS--main/Edenfield-main/bin/admin-server.js")

echo "Starting substrate (backend)"
"${SUBSTRATE_CMD[@]}" &
SUB_PID=$!
echo "substrate pid=$SUB_PID"

echo "Starting edenfield admin UI"
"${EDEN_CMD[@]}" &
EDEN_PID=$!
echo "edenfield pid=$EDEN_PID"

cleanup() {
  echo "Shutting down..."
  kill "$SUB_PID" 2>/dev/null || true
  kill "$EDEN_PID" 2>/dev/null || true
  wait || true
}

trap cleanup EXIT INT TERM

echo "Waiting for services to become healthy..."
for i in {1..30}; do
  if curl -sSf http://localhost:3000/health >/dev/null 2>&1 && curl -sSf http://localhost:8000/ >/dev/null 2>&1; then
    echo "Both services responding"
    break
  fi
  sleep 1
done

echo "Tailing logs (press Ctrl-C to stop and kill both servers)"
wait
