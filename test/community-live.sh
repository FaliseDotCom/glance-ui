#!/usr/bin/env bash
# ADR-0030: every community widget set up through the editor's UI, the way a user would, in a throwaway all-in-one
# container: no Docker socket, a stand-in server for every service the widgets talk to, Playwright driving the editor
# (test/community-live/check.spec.ts). Run it when moving the community-widgets pin or changing how widgets are added.
# Not part of scripts/test.sh: it takes about 15 minutes, and widgets that call public services need the internet.
# Usage: GLANCE_EDITOR_IMAGE=<image> test/community-live.sh [comma-separated widget folders]
# The report stays in $CW_OUT (default: a new temp folder): summary.txt, one JSON per variant, the stand-in's log.
source "$(dirname "$0")/lib.sh"
guard_docker_host
image="${GLANCE_EDITOR_IMAGE:?set GLANCE_EDITOR_IMAGE to the editor image to test}"
only="${1:-}"

eport=18089
gport=18091
net="$TEST_PREFIX-cw"
editor="$TEST_PREFIX-cw-editor"
stand_in="$TEST_PREFIX-cw-stand-in"
out="${CW_OUT:-$(mktemp -d)}"
data="$(mktemp -d)"
node_image="$(sed -n 's/^ARG NODE_IMAGE=//p' "$REPO_ROOT/Dockerfile")"
# shellcheck disable=SC2329 # called by the trap
cleanup() {
  docker rm -f "$editor" "$stand_in" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  # The container gives the data folder to 99:100; remove it as root through the image.
  docker run --rm -v "$data:/w" --entrypoint sh "$image" -c 'rm -rf /w/*' >/dev/null 2>&1 || true
  rm -rf "$data"
}
trap cleanup EXIT
cleanup_test_containers
mkdir -p "$out/stand-in" "$data"
: > "$out/summary.txt"

docker network create --label "$TEST_LABEL" "$net" >/dev/null
docker run -d --name "$stand_in" --label "$TEST_LABEL" --network "$net" --network-alias cw-stand-in --user "$(id -u):$(id -g)" \
  -v "$REPO_ROOT/test/community-live/stand-in.mjs:/stand-in.mjs:ro" -v "$out/stand-in:/log" "$node_image" node /stand-in.mjs >/dev/null
docker run -d --name "$editor" --label "$TEST_LABEL" --network "$net" \
  -p "127.0.0.1:$eport:3000" -p "127.0.0.1:$gport:8080" -v "$data:/data" "$image" >/dev/null

base="http://127.0.0.1:$eport"
for _ in $(seq 1 60); do curl -fsS -o /dev/null "$base/healthz" 2>/dev/null && break; sleep 0.5; done
curl -fsS -X POST -H "Origin: $base" -H "Content-Type: application/json" --data '{"pageName":"Home","layout":"one-full"}' "$base/api/start-empty" >/dev/null
curl -fsS -X POST -H "Origin: $base" -H "Content-Type: application/json" --data '{}' "$base/api/save" >/dev/null
wait_for_text "http://127.0.0.1:$gport/" "<title>Home" 30 || fail "Glance didn't start"

status=0
CW_EDITOR="$base" CW_GLANCE="http://127.0.0.1:$gport" CW_STAND_IN="cw-stand-in:8000" CW_OUT="$out" CW_ONLY="$only" \
  npx playwright test -c test/community-live/playwright.config.ts || status=$?
docker logs "$editor" > "$out/container.log" 2>&1 || true
log "report: $out/summary.txt ($(grep -c . "$out/summary.txt") variants)"
exit "$status"
