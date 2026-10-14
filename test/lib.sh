# shellcheck shell=bash
# Shared helpers for the test harness. Source this file; do not execute it.
#
# Safety rules (see docs/testing.md):
#   - Every container this harness creates is named "glance-editor-test-*" and labelled
#     "glance-editor-test=1". Cleanup only ever touches containers carrying that label.
#   - Ports are bound to 127.0.0.1 only, in the 18xxx range.
#   - No Docker socket is mounted, except read-only by test/glance-docker.sh and test/docker-proxy.sh, and nothing
#     reads or writes the live dashboard's config.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../glance.version
source "$REPO_ROOT/glance.version"
# shellcheck source=../docker-proxy.version
source "$REPO_ROOT/docker-proxy.version"

TEST_LABEL="glance-editor-test=1"
TEST_PREFIX="glance-editor-test"

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
fail() { log "FAIL: $*"; exit 1; }

# Refuse to run against a remote Docker daemon unless explicitly allowed, so the harness
# can never be pointed at the live Glance host by an inherited DOCKER_HOST.
guard_docker_host() {
  if [[ -n "${DOCKER_HOST:-}" && "${GLANCE_EDITOR_TEST_ALLOW_DOCKER_HOST:-}" != "1" ]]; then
    fail "DOCKER_HOST is set ($DOCKER_HOST). Unset it, or set GLANCE_EDITOR_TEST_ALLOW_DOCKER_HOST=1 if it is a disposable daemon."
  fi
}

# Remove only containers created by this harness.
cleanup_test_containers() {
  local ids
  ids="$(docker ps -aq --filter "label=$TEST_LABEL")"
  if [[ -n "$ids" ]]; then
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null
  fi
}

# Run a one-off Glance CLI command against a config directory mounted at /app/config.
# Usage: glance_cli <config-dir> <command> [extra docker run args...]
glance_cli() {
  local dir="$1" cmd="$2"; shift 2
  docker run --rm --label "$TEST_LABEL" --network none \
    -v "$dir:/app/config:ro" "$@" "$GLANCE_IMAGE" "$cmd"
}

# Start a Glance server in the background.
# Usage: glance_start <name-suffix> <host-port> <mount-args...>
glance_start() {
  local name="$TEST_PREFIX-$1" port="$2"; shift 2
  docker run -d --name "$name" --label "$TEST_LABEL" \
    -p "127.0.0.1:$port:8080" "$@" "$GLANCE_IMAGE" >/dev/null
  echo "$name"
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" == "true" ]]
}

# Wait until the page at the URL contains the given text, or time out.
# Usage: wait_for_text <url> <text> [timeout-seconds]
wait_for_text() {
  local url="$1" text="$2" timeout="${3:-20}" i
  for ((i = 0; i < timeout * 2; i++)); do
    if curl -fsS "$url" 2>/dev/null | grep -qF -- "$text"; then return 0; fi
    sleep 0.5
  done
  return 1
}

# Prepare the environment the placeholder fixture needs: env vars, a Docker secret file
# and a file referenced via readFileFromEnv. Prints docker run args, one per line.
placeholder_run_args() {
  local support="$REPO_ROOT/test/fixtures/support"
  printf '%s\n' \
    -e "GLANCE_EDITOR_TEST_TITLE=Placeholder Fixture" \
    -e "GLANCE_EDITOR_TEST_URL=https://example.invalid" \
    -e "GLANCE_EDITOR_TEST_TOKEN_FILE=/run/test/token" \
    -v "$support/secret-test_secret:/run/secrets/test_secret:ro" \
    -v "$support/token:/run/test/token:ro"
}

# The docker run arguments that set the proxy's environment (docker-proxy.version).
docker_proxy_env_args() {
  local kv
  for kv in $DOCKER_PROXY_ENV; do printf '%s\n' -e "$kv"; done
}
