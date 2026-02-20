#!/usr/bin/env bash
set -euo pipefail

missing=()
for cmd in git docker jq node docker-compose kubectl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done

if [ ${#missing[@]} -ne 0 ]; then
  echo "Missing prerequisites: ${missing[*]}" >&2
  echo
  echo "Install the required tools or run only the subsets you need (e.g. Node-only local run)."
  exit 2
fi

echo "All prerequisites available: git docker node jq kubectl"
