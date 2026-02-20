SHELL := /bin/bash

.PHONY: help build-images demo-up demo-down gen-tokens e2e-keep run-local check

help:
	@echo "Makefile targets:"
	@echo "  make check         - verify prerequisites (docker, node, jq)"
	@echo "  make gen-tokens    - generate demo/.env.demo with tokens"
	@echo "  make build-images  - build local docker images"
	@echo "  make demo-up       - start demo via docker compose (needs demo/.env.demo)"
	@echo "  make demo-down     - stop demo compose"
	@echo "  make e2e-keep      - run e2e and keep containers running"
	@echo "  make run-local     - run local Node servers (no Docker)"

check:
	@./scripts/check-prereqs.sh

gen-tokens:
	@chmod +x scripts/generate-tokens.sh
	@./scripts/generate-tokens.sh

build-images:
	@chmod +x scripts/build-images.sh
	@./scripts/build-images.sh

demo-up:
	@cd demo && chmod +x run-demo.sh && ./run-demo.sh

demo-down:
	@docker compose -f docker-compose.demo.yml down || true

e2e-keep:
	@chmod +x scripts/run-e2e-keep.sh
	@./scripts/run-e2e-keep.sh

run-local:
	@chmod +x local/run-local.sh
	@bash local/run-local.sh
