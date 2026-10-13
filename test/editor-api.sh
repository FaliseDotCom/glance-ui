#!/usr/bin/env bash
# End-to-end API test of the editor IMAGE (Phase 3): the real container writes a mounted config dir that a test Glance
# watches. Needs the image: set GLANCE_EDITOR_IMAGE (CI builds it; locally: scripts/build-editor-image.sh glance-editor:test).
source "$(dirname "$0")/lib.sh"
guard_docker_host
image="${GLANCE_EDITOR_IMAGE:?set GLANCE_EDITOR_IMAGE to the editor image to test}"

port=18084
net="$TEST_PREFIX-net"
work="$(mktemp -d)"
trap 'cleanup_test_containers; docker network rm "$net" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
cleanup_test_containers
mkdir -p "$work/config" "$work/data"
cp "$REPO_ROOT/test/fixtures/import/commented.yml" "$work/config/glance.yml"
docker network create --label "$TEST_LABEL" "$net" >/dev/null

docker run -d --name "$TEST_PREFIX-apiglance" --label "$TEST_LABEL" --network "$net" \
  -e DASHBOARD_NAME=D -e ROUTER_HOST=r.invalid -e GREETING=hi -e RSS_LIMIT=3 \
  -v "$work/config:/app/config" "$GLANCE_IMAGE" >/dev/null
docker run -d --name "$TEST_PREFIX-editor" --label "$TEST_LABEL" --network "$net" --user "$(id -u):$(id -g)" \
  -p "127.0.0.1:$port:3000" -e GLANCE_URL="http://$TEST_PREFIX-apiglance:8080/" \
  -v "$work/config:/glance-config" -v "$work/data:/data" "$image" >/dev/null

base="http://127.0.0.1:$port"
origin=(-H "Origin: $base" -H "Content-Type: application/json")
for _ in $(seq 1 40); do curl -fsS -o /dev/null "$base/healthz" 2>/dev/null && break; sleep 0.5; done
failures=0
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
py() { python3 -c "$1"; }

desc="first run reported";                               check bash -c "curl -fsS $base/api/state | grep -q '\"firstRun\":true'"
desc="POST without Origin is refused (ADR-0004)";        check test "$(code -X POST -H 'Content-Type: application/json' --data '{}' "$base/api/import")" = 403
desc="POST from another origin is refused";              check test "$(code -X POST -H 'Origin: http://evil.example' -H 'Content-Type: application/json' --data '{}' "$base/api/import")" = 403
desc="same-origin POST that isn't JSON is refused";      check test "$(code -X POST -H "Origin: $base" --data 'x=1' "$base/api/import")" = 403
desc="import";                                           check bash -c "curl -fsS -X POST -H 'Origin: $base' -H 'Content-Type: application/json' --data '{}' $base/api/import | grep -q '\"ok\":true'"

curl -fsS "$base/api/state" | py 'import json,sys; s=json.load(sys.stdin); d=s["draft"]; d["pages"][0]["name"]="Renamed by API"; print(json.dumps(d))' > "$work/draft.json"
desc="PUT draft";                                        check bash -c "curl -fsS -X PUT -H 'Origin: $base' -H 'Content-Type: application/json' --data @$work/draft.json $base/api/draft | grep -q '\"ok\":true'"
sleep 1.1 # the reload stamp has 1 s resolution
save="$(curl -fsS -X POST "${origin[@]}" --data '{}' "$base/api/save")"
desc="save → saved, version 1";                          check bash -c "grep -q '\"status\":\"saved\",\"version\":1' <<<'$save'"
desc="reload confirmed by the watched Glance (D-29)";    check bash -c "grep -q '\"reload\":\"reloaded\"' <<<'$save'"
desc="file edited in place, comments kept";              check bash -c "grep -q '  - name: Renamed by API # shown first' '$work/config/glance.yml' && grep -q '# weather below' '$work/config/glance.yml'"
desc=".prev kept next to it";                            check test -f "$work/config/glance.yml.prev"
desc="versions 0 and 1 listed";                          check bash -c "curl -fsS $base/api/versions | python3 -c 'import json,sys; v=json.load(sys.stdin); sys.exit(0 if [x[\"number\"] for x in v]==[1,0] else 1)'"
before="$(sha256sum "$work/config/glance.yml")"
desc="restore 0 → draft shows changes";                  check bash -c "curl -fsS -X POST -H 'Origin: $base' -H 'Content-Type: application/json' --data '{}' $base/api/versions/0/restore | grep -q '\"kind\":\"renamed\"'"
desc="restore never writes the file (D-31)";             check test "$(sha256sum "$work/config/glance.yml")" = "$before"
desc="data written under the mounted /data";             check test -f "$work/data/editor.sqlite"

[[ $failures -eq 0 ]] || { docker logs "$TEST_PREFIX-editor" >&2; fail "$failures API check(s) failed"; }
log "all API checks passed"
