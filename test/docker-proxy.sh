#!/usr/bin/env bash
# The read-only Docker socket proxy (ADR-0005, plan v2 Phase 8): the pinned image with the editor's settings
# (docker-proxy.version) lists containers, and refuses every write (a POST through the proxy is refused) and every API
# section the editor doesn't need. A Glance pointed at it lists the same containers. With GLANCE_EDITOR_IMAGE set (CI
# builds it), the editor image lists them through it too, passing on only glance.* labels.
# Mounts the Docker socket read-only into the proxy only. The throwaway containers carry the test label.
source "$(dirname "$0")/lib.sh"
guard_docker_host

port=18085
gport=18087
eport=18088
net="$TEST_PREFIX-proxynet"
proxy="$TEST_PREFIX-proxy"
work="$(mktemp -d)"
trap 'cleanup_test_containers; docker network rm "$net" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
cleanup_test_containers
docker network create --label "$TEST_LABEL" "$net" >/dev/null
failures=0
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

mapfile -t proxy_env < <(docker_proxy_env_args)
docker run -d --name "$proxy" --label "$TEST_LABEL" --network "$net" -p "127.0.0.1:$port:2375" "${proxy_env[@]}" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro "$DOCKER_PROXY_IMAGE" >/dev/null
throwaway() { docker run -d --name "$TEST_PREFIX-$1" --label "$TEST_LABEL" "${@:2}" --entrypoint /bin/sleep "$GLANCE_IMAGE" 600 >/dev/null; }
throwaway pxy-plain --label glance.name=GE_PROXY_PLAIN --label other.secret=GE_NOT_PASSED_ON
throwaway pxy-hidden --label glance.hide=true

base="http://127.0.0.1:$port"
for _ in $(seq 1 40); do [[ "$(code "$base/containers/json")" == 200 ]] && break; sleep 0.25; done
target="$TEST_PREFIX-pxy-plain"

desc="GET /containers/json lists containers";            check bash -c "curl -fsS '$base/containers/json?all=true' | grep -qF '/$target'"
desc="versioned GET path works too";                      check test "$(code "$base/v1.41/containers/json")" = 200
desc="POST /containers/create is refused (403)";          check test "$(code -X POST -H 'Content-Type: application/json' --data '{"Image":"x"}' "$base/containers/create")" = 403
desc="POST …/stop is refused (403)";                      check test "$(code -X POST "$base/containers/$target/stop")" = 403
desc="POST …/kill is refused (403)";                      check test "$(code -X POST "$base/containers/$target/kill")" = 403
desc="POST …/exec is refused (403)";                      check test "$(code -X POST -H 'Content-Type: application/json' --data '{"Cmd":["true"]}' "$base/containers/$target/exec")" = 403
desc="DELETE a container is refused (403)";               check test "$(code -X DELETE "$base/containers/$target?force=true")" = 403
desc="the container is still running after all that";     check container_running "$target"
for section in images/json info volumes networks _ping version events; do
  desc="GET /$section is refused (403)";                  check test "$(code -m 3 "$base/$section")" = 403
done

# Glance itself, pointed at the proxy (an option for Phase 11; the live Glance keeps its own socket, ADR-0005).
cat > "$work/glance.yml" <<YAML
pages:
  - name: P
    slug: p
    columns:
      - size: full
        widgets:
          - type: docker-containers
            sock-path: tcp://$proxy:2375
YAML
docker run -d --name "$TEST_PREFIX-pxyglance" --label "$TEST_LABEL" --network "$net" -p "127.0.0.1:$gport:8080" \
  -v "$work:/app/config:ro" "$GLANCE_IMAGE" >/dev/null
desc="a Glance with sock-path tcp://proxy lists containers"; check wait_for_text "http://127.0.0.1:$gport/api/pages/p/content/" GE_PROXY_PLAIN 30
desc="… and honours the label";                          check bash -c "! curl -fsS http://127.0.0.1:$gport/api/pages/p/content/ | grep -qF '$TEST_PREFIX-pxy-hidden'"

if [[ -n "${GLANCE_EDITOR_IMAGE:-}" ]]; then
  mkdir -p "$work/config" "$work/data"
  cp "$REPO_ROOT/test/fixtures/import/commented.yml" "$work/config/glance.yml"
  docker run -d --name "$TEST_PREFIX-pxyeditor" --label "$TEST_LABEL" --network "$net" --user "$(id -u):$(id -g)" \
    -p "127.0.0.1:$eport:3000" -e DOCKER_PROXY_URL="tcp://$proxy:2375" \
    -v "$work/config:/glance-config" -v "$work/data:/data" "$GLANCE_EDITOR_IMAGE" node build >/dev/null
  ebase="http://127.0.0.1:$eport"
  for _ in $(seq 1 40); do curl -fsS -o /dev/null "$ebase/healthz" 2>/dev/null && break; sleep 0.5; done
  curl -fsS "$ebase/api/containers" > "$work/containers.json" || true
  py() { python3 -c "import json,sys; r=json.load(open('$work/containers.json')); $1"; }
  desc="editor image lists containers through the proxy";  check py "c={x['name']:x for x in r['containers']}; sys.exit(0 if r['status']=='ok' and c['$target']['glance']=={'name':'GE_PROXY_PLAIN'} and c['$TEST_PREFIX-pxy-hidden']['glance']=={'hide':'true'} else 1)"
  desc="… passing on no other labels";                    check bash -c "! grep -qF GE_NOT_PASSED_ON '$work/containers.json'"
else
  log "skip editor image checks (set GLANCE_EDITOR_IMAGE)"
fi

[[ $failures -eq 0 ]] || { docker logs "$proxy" >&2; fail "$failures proxy check(s) failed"; }
log "all proxy checks passed"
