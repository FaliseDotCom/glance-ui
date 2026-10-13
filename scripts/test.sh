#!/usr/bin/env bash
# Entry point for "run the tests", locally and in CI.
# Node checks first (fast), then the Docker-based Glance harness.
set -euo pipefail
cd "$(dirname "$0")/.."

# Pinned shellcheck via Docker so local runs and CI behave the same.
SHELLCHECK_IMAGE="koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d"
echo "== typecheck";                npm run --silent typecheck
echo "== dependency licenses";      npm run --silent licenses > /dev/null
echo "== unit + Glance tests";      npx vitest run
echo "== shellcheck"
docker run --rm --network none -v "$PWD:/mnt:ro" -w /mnt "$SHELLCHECK_IMAGE" -x scripts/*.sh test/*.sh dev/*.sh

echo "== fixture validation";      test/validate-fixtures.sh
echo "== upstream example";        test/upstream-example.sh
echo "== Glance CLI behaviour";    test/glance-cli.sh
echo "== hot-reload behaviour";    test/glance-reload.sh
echo "== docker-containers";       test/glance-docker.sh
