#!/usr/bin/env bash
# Starts the pinned Glance image with a config and fails if Glance exits or never serves.
# Usage: test/glance-smoke.sh [config-file]   (default: test/fixtures/valid/sample.yml)
# Optional: GLANCE_SMOKE_ENV_FILE (docker --env-file) and GLANCE_SMOKE_SECRETS_DIR (mounted at /run/secrets) for configs
# with placeholders. Defaults: the sample model's dummy env and secrets.
source "$(dirname "$0")/lib.sh"
guard_docker_host

config="${1:-$REPO_ROOT/test/fixtures/valid/sample.yml}"
port="${GLANCE_SMOKE_PORT:-18080}"
settle="${GLANCE_SMOKE_SETTLE:-5}"

work="$(mktemp -d)"
name="$TEST_PREFIX-smoke"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
docker rm -f "$name" >/dev/null 2>&1 || true

mkdir -p "$work/cfg"; cp "$config" "$work/cfg/glance.yml"
log "starting $GLANCE_IMAGE with $(basename "$config")"
env_file="${GLANCE_SMOKE_ENV_FILE:-$REPO_ROOT/test/fixtures/model/v2/sample.env}"
secrets="${GLANCE_SMOKE_SECRETS_DIR:-$REPO_ROOT/test/fixtures/model/v2/secrets}"
glance_start smoke "$port" -v "$work/cfg:/app/config:ro" --env-file "$env_file" -v "$secrets:/run/secrets:ro" >/dev/null

served=0
for ((i = 0; i < 60; i++)); do
  container_running "$name" || break
  if curl -fsS -o /dev/null "http://127.0.0.1:$port/"; then served=1; break; fi
  sleep 0.5
done

# Keep watching briefly: a config error can surface after the listener is up.
[[ $served -eq 1 ]] && sleep "$settle"

if ! container_running "$name"; then
  code="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
  docker logs "$name" >&2 || true
  fail "Glance exited (code $code)"
fi
[[ $served -eq 1 ]] || { docker logs "$name" >&2; fail "Glance did not serve HTTP 200 within 30s"; }
log "ok: Glance is running and serving http://127.0.0.1:$port/"
