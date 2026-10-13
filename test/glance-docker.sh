#!/usr/bin/env bash
# Docker-containers widget behaviour (design D-23, ADR-0005): which wins when a glance.hide label and the
# `containers` map disagree. The ONLY harness script that mounts the Docker socket (read-only). Glance only lists
# containers. The throwaway containers it creates carry the test label and are removed afterwards.
source "$(dirname "$0")/lib.sh"
guard_docker_host

port="${GLANCE_DOCKER_PORT:-18083}"
work="$(mktemp -d)"
trap 'cleanup_test_containers; rm -rf "$work"' EXIT
cleanup_test_containers
failures=0
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }

throwaway() { docker run -d --name "$TEST_PREFIX-$1" --label "$TEST_LABEL" "${@:2}" --entrypoint /bin/sleep "$GLANCE_IMAGE" 600 >/dev/null; }
throwaway label-hidden-map-shows --label glance.hide=true
throwaway map-hides
throwaway label-hidden-only --label glance.hide=true --label glance.name=GE_LABEL_ONLY
throwaway plain --label glance.name=GE_PLAIN

cat > "$work/glance.yml" <<YAML
pages:
  - name: P
    slug: p
    columns:
      - size: full
        widgets:
          - type: docker-containers
            containers:
              $TEST_PREFIX-label-hidden-map-shows:
                name: GE_MAP_SHOWS
                hide: false
              $TEST_PREFIX-map-hides:
                name: GE_MAP_HIDES
                hide: true
YAML
glance_start docker "$port" -v "$work:/app/config:ro" -v /var/run/docker.sock:/var/run/docker.sock:ro >/dev/null
url="http://127.0.0.1:$port/api/pages/p/content/"
wait_for_text "$url" "GE_PLAIN" 30 || { docker logs "$TEST_PREFIX-docker" >&2; fail "widget did not list containers"; }
page="$(curl -fsS "$url")"
has()   { grep -qF -- "$1" <<<"$page"; }
lacks() { ! has "$1"; }
desc="map hide:false beats label glance.hide=true (map wins)";  check has GE_MAP_SHOWS
desc="map hide:true hides a container without labels";         check lacks GE_MAP_HIDES
desc="label glance.hide=true hides when the map is silent";     check lacks GE_LABEL_ONLY
desc="unlabelled container with glance.name is shown";          check has GE_PLAIN

[[ $failures -eq 0 ]] || fail "$failures docker check(s) failed"
log "all docker checks passed"
