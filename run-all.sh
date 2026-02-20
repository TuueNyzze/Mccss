#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: bash run-all.sh [--no-commit] [--skip-build] [--skip-docker] [--k8s]

Options:
  --no-commit    Skip the local git commit step
  --skip-build   Skip building local Docker images
  --skip-docker  Skip starting Docker Compose services
  --k8s          Apply k8s demo manifests after images are available

This script is intended to be run from the repository root.
EOF
}

NO_COMMIT=0
SKIP_BUILD=0
SKIP_DOCKER=0
DO_K8S=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-commit) NO_COMMIT=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-docker) SKIP_DOCKER=1; shift ;;
    --k8s) DO_K8S=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

if [ "$NO_COMMIT" -eq 0 ]; then
  if [ -x ./scripts/commit-demo.sh ]; then
    echo "Running commit helper..."
    ./scripts/commit-demo.sh demo/unify-wire
  else
    echo "Commit helper missing or not executable; skipping commit step."
  fi
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  if [ -x ./scripts/build-images.sh ]; then
    echo "Building images locally..."
    ./scripts/build-images.sh
  else
    echo "Build helper missing; attempting direct docker build..."
    docker build -t mccss-substrate:demo -f MCCSS--main/Dockerfile MCCSS--main || true
    docker build -t edenfield-admin:demo -f MCCSS--main/Edenfield-main/Dockerfile MCCSS--main/Edenfield-main || true
  fi
fi

if [ "$SKIP_DOCKER" -eq 0 ]; then
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Starting services with docker compose..."
    docker compose -f docker-compose.demo.yml up -d --build
    docker compose -f docker-compose.demo.yml ps
  else
    echo "Docker or Docker Compose not available; skipping docker run."
  fi
fi

if [ "$DO_K8S" -eq 1 ]; then
  if command -v kubectl >/dev/null 2>&1; then
    echo "Applying k8s demo manifests..."
    ./demo/deploy-k8s.sh
  else
    echo "kubectl not found; skipping k8s deploy."
  fi
fi

echo "All done. Check logs or 'docker compose -f docker-compose.demo.yml logs -f' to follow services."
