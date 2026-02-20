#!/usr/bin/env bash
set -euo pipefail

# Local helper to create branch and commit demo artifacts
BRANCH=${1:-demo/unify-wire}

git checkout -b "$BRANCH"
git add docker-compose.demo.yml demo/run-demo.sh demo/README.md k8s/demo demo/deploy-k8s.sh scripts/commit-demo.sh
git commit -m "demo: unify MCCSS substrate and Edenfield admin with docker-compose demo, k8s manifests and run scripts"
echo "Committed to branch $BRANCH"
