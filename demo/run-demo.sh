#!/usr/bin/env bash
set -euo pipefail

# Quick demo runner for the unified MCCSS + Edenfield stack
# Usage:
#   ADMIN_API_TOKEN=secret ./demo/run-demo.sh

COMPOSE_FILE="../docker-compose.demo.yml"
cd "$(dirname "$0")"

# Load env file if present
if [ -f .env.demo ]; then
  export $(grep -v '^#' .env.demo | xargs)
fi

if [ -z "${ADMIN_API_TOKEN-}" ]; then
  echo "Please set ADMIN_API_TOKEN environment variable, e.g. ADMIN_API_TOKEN=demo-token, or run ../scripts/generate-tokens.sh" >&2
  exit 1
fi

echo "Bringing up demo services (this may take a few minutes)..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "Services started. Showing container status:"
docker compose -f "$COMPOSE_FILE" ps

echo "Tailing substrate logs (CTRL-C to exit)..."
docker compose -f "$COMPOSE_FILE" logs -f substrate
