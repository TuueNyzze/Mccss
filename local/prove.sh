#!/usr/bin/env bash
set -euo pipefail

# Simple proof script to verify local servers are up
# Usage: from repo root: bash local/prove.sh

echo "Checking substrate health (http://localhost:3000/health)"
if curl -sSf http://localhost:3000/health | jq . >/dev/null 2>&1; then
  echo "substrate health: ok"
else
  echo "substrate health: failed" >&2
  exit 2
fi

echo "Checking edenfield UI index (http://localhost:8000/)"
if curl -sSf http://localhost:8000/ | grep -qi '<!doctype\|<html' >/dev/null 2>&1; then
  echo "edenfield UI: reachable"
else
  echo "edenfield UI: not reachable" >&2
  exit 3
fi

echo "Checking metrics endpoint (http://localhost:3000/metrics)"
if curl -sSf http://localhost:3000/metrics >/dev/null 2>&1; then
  echo "metrics: ok"
else
  echo "metrics: failed" >&2
  exit 4
fi

echo "Proof successful: backend + admin reachable"
