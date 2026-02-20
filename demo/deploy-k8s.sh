#!/usr/bin/env bash
set -euo pipefail

# Apply demo Kubernetes manifests
DIR="$(cd "$(dirname "$0")/.." && pwd)"
K8S_DIR="$DIR/k8s/demo"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl not found. Install kubectl and ensure kubeconfig points to a cluster." >&2
  exit 2
fi

echo "Applying demo manifests from $K8S_DIR"
kubectl apply -f "$K8S_DIR"

echo "Resources applied. Run 'kubectl get all' to see status. Note: images are expected to be available as 'mccss-substrate:demo' and 'edenfield-admin:demo'."
