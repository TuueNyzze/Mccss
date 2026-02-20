#!/usr/bin/env bash
set -euo pipefail

echo "Building local demo images (tags: mccss-substrate:demo, edenfield-admin:demo)"

docker build -t mccss-substrate:demo -f MCCSS--main/Dockerfile MCCSS--main
docker build -t edenfield-admin:demo -f MCCSS--main/Edenfield-main/Dockerfile MCCSS--main/Edenfield-main

echo "Built images. You can run them with docker compose or push to a registry." 
