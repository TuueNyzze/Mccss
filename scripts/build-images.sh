#!/usr/bin/env bash
set -euo pipefail

echo "Building local demo images (tags: mccss-substrate:demo, edenfield-admin:demo)"

docker build -t mccss-substrate:demo -f MCCSS--main/Dockerfile MCCSS--main
docker build -t edenfield-admin:demo -f MCCSS--main/Edenfield-main/Dockerfile MCCSS--main/Edenfield-main

echo "Tagging images for local Helm/k8s usage (optional)"
docker tag mccss-substrate:demo mccss-substrate:latest || true
docker tag edenfield-admin:demo edenfield-admin:latest || true

echo "Built images. You can run them with docker compose or push to a registry." 
