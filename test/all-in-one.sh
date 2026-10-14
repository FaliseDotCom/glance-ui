#!/usr/bin/env bash
# The all-in-one container (ADR-0024), run the way the Unraid template runs it: one container, one data folder, the
# Docker socket read only, no --user. Checks a first run from nothing to a live dashboard, Preview, the container list,
# and that the editor can't reach the socket. Then a second first run from an uploaded zip of a Glance folder
# (ADR-0025): its assets served by Glance, its .env given to Glance (not the editor). Needs the image: set GLANCE_EDITOR_IMAGE.
source "$(dirname "$0")/lib.sh"
guard_docker_host
image="${GLANCE_EDITOR_IMAGE:?set GLANCE_EDITOR_IMAGE to the editor image to test}"

gport=18086
eport=18087
name="$TEST_PREFIX-aio"
work="$(mktemp -d)"
# The container gives the data folder to 99:100; remove it as root through the image.
trap 'cleanup_test_containers; docker run --rm -v "$work:/w" --entrypoint sh "$image" -c "rm -rf /w/data /w/data2 /w/data3" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
cleanup_test_containers
mkdir -p "$work/data/assets/icons"
echo "copied in by someone else" > "$work/data/assets/icons/note.txt"

docker run -d --name "$name" --label "$TEST_LABEL" -p "127.0.0.1:$gport:8080" -p "127.0.0.1:$eport:3000" \
  -e TEST_SECRET=not-for-the-editor -v "$work/data:/data" -v /var/run/docker.sock:/var/run/docker.sock:ro "$image" >/dev/null

base="http://127.0.0.1:$eport"
origin=(-H "Origin: $base" -H "Content-Type: application/json")
for _ in $(seq 1 60); do curl -fsS -o /dev/null "$base/healthz" 2>/dev/null && break; sleep 0.5; done
failures=0
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
editor_node() { docker exec -u 99:100 "$name" node -e "$1"; }

desc="editor answers; first run";                         check bash -c "curl -fsS $base/api/state | grep -q '\"firstRun\":true'"
desc="no dashboard yet: Glance waits for glance.yml";     check bash -c "docker logs $name 2>&1 | grep -q 'waiting for /data/config/glance.yml'"
desc="data folder given to 99:100 (copied-in file too)";  check test "$(stat -c %u:%g "$work/data/assets/icons/note.txt")" = 99:100
desc="Start empty";                                       check bash -c "curl -fsS -X POST ${origin[*]@Q} --data '{\"pageName\":\"Home\",\"layout\":\"one-full\"}' $base/api/start-empty | grep -q '\"firstRun\":false'"
save="$(curl -fsS -X POST "${origin[@]}" --data '{}' "$base/api/save")"
desc="first Save writes glance.yml, Glance starts on it"; check bash -c "grep -q '\"status\":\"saved\"' <<<'$save'"
for _ in $(seq 1 40); do curl -fsS -o /dev/null "http://127.0.0.1:$gport/" 2>/dev/null && break; sleep 0.5; done
desc="the dashboard is served on Glance's port";          check bash -c "curl -fsS http://127.0.0.1:$gport/ | grep -q '<title>Home'"
desc="editor sees Glance";                                check bash -c "curl -fsS $base/api/glance | grep -q reachable"
desc="glance.yml owned by 99:100";                        check test "$(stat -c %u:%g "$work/data/config/glance.yml")" = 99:100

curl -fsS "$base/api/state" | python3 -c 'import json,sys; d=json.load(sys.stdin)["draft"]; d["pages"][0]["name"]="Renamed"; print(json.dumps(d))' > "$work/draft.json"
curl -fsS -X PUT "${origin[@]}" --data @"$work/draft.json" "$base/api/draft" >/dev/null
desc="Preview builds on the preview Glance";              check bash -c "curl -fsS -X POST ${origin[*]@Q} --data '{}' $base/api/preview | grep -q '\"status\":\"built\"'"
desc="Preview shows the draft";                           check bash -c "curl -fsS $base/preview/ | grep -q '<title>Renamed'"
desc="the dashboard still shows the saved version";       check bash -c "curl -fsS http://127.0.0.1:$gport/ | grep -q '<title>Home'"
sleep 1.1 # the reload stamp has 1 s resolution
desc="Save → Glance reloads (D-29)";                      check bash -c "curl -fsS -X POST ${origin[*]@Q} --data '{}' $base/api/save | grep -q '\"reload\":\"reloaded\"'"

desc="containers listed through the gate";                check bash -c "curl -fsS $base/api/containers | grep -q '\"name\":\"$name\"'"
desc="the gate refuses a stop (403)";                     check test "$(editor_node "fetch('http://127.0.0.1:47802/containers/$name/stop',{method:'POST'}).then(r=>console.log(r.status))")" = 403
desc="the gate refuses anything but the list";            check test "$(editor_node "fetch('http://127.0.0.1:47802/containers/$name/json').then(r=>console.log(r.status))")" = 403
desc="the editor's user can't open the socket";           check test "$(editor_node "require('net').connect('/var/run/docker.sock').on('connect',()=>{console.log('open');process.exit()}).on('error',e=>console.log(e.code))")" = EACCES
desc="…whatever the socket's mode: /run is root's only";  check test "$(editor_node "require('fs').readdir('/run',e=>console.log(e&&e.code))")" = EACCES
desc="no setuid programs in the image";                   check test -z "$(docker exec "$name" find / -xdev -perm -4000 -type f)"
# A process by its command line (not the searching shell's own), as root inside the container.
pid_of() { docker exec "$name" sh -c 'for p in /proc/[0-9]*; do case "$(tr "\0" " " < "$p/cmdline" 2>/dev/null)" in "$1"*) basename "$p";; esac; done' sh "$1" | sed -n 1p; }
editor_pid="$(pid_of "$(docker exec "$name" node -p process.execPath) /app/build")"
desc="the editor runs as 99:100";                         check test "$(docker exec "$name" stat -c %u:%g "/proc/$editor_pid")" = 99:100
# The editor gets the names of Glance's variables (GLANCE_ENV_NAMES, ADR-0025), never their values.
desc="your variables reach Glance, not the editor";       check test "$(docker exec -u 99:100 "$name" sh -c "grep -ac not-for-the-editor /proc/$editor_pid/environ; true")" = 0
glance_pid="$(pid_of "/usr/local/bin/glance --config /data/config/glance.yml")"
desc="…which has it";                                     check test "$(docker exec "$name" sh -c "grep -ac TEST_SECRET /proc/$glance_pid/environ; true")" = 1
desc="container stops cleanly";                           check bash -c "docker stop -t 10 $name >/dev/null && test \"\$(docker inspect -f '{{.State.ExitCode}}' $name)\" = 0"

docker rm "$name" >/dev/null

# ---- ADR-0025: a first run from an uploaded zip, laid out like Glance's Docker Compose template ----
mkdir -p "$work/data2"
docker run -d --name "$name" --label "$TEST_LABEL" -p "127.0.0.1:$gport:8080" -p "127.0.0.1:$eport:3000" \
  -v "$work/data2:/data" "$image" >/dev/null
python3 -I - "$work/glance.zip" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("glance/.env", "PAGE_NAME=From env\n")
    z.writestr("glance/config/glance.yml", "server:\n  assets-path: /app/assets\ntheme:\n  custom-css-file: /assets/user.css\npages:\n  $include: home.yml\n")
    z.writestr("glance/config/home.yml", "- name: ${PAGE_NAME}\n  columns:\n    - size: full\n      widgets:\n        - type: clock\n")
    z.writestr("glance/assets/user.css", "/* uploaded */\n")
PY
for _ in $(seq 1 60); do curl -fsS -o /dev/null "$base/healthz" 2>/dev/null && break; sleep 0.5; done
check_up="$(curl -fsS -X POST -H "Origin: $base" -H "Content-Type: application/octet-stream" --data-binary @"$work/glance.zip" "$base/api/import/upload")"
id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["upload"]["id"])' <<<"$check_up")"
desc="upload: checks pass, include joined, .env found";   check bash -c "grep -q '\"ok\":true' <<<${check_up@Q} && grep -q '\"names\":\[\"PAGE_NAME\"\]' <<<${check_up@Q}"
desc="upload: assets-path becomes /data/assets";          check bash -c "grep -q '\"to\":\"/data/assets\"' <<<${check_up@Q}"
desc="Import copies assets and .env";                     check bash -c "curl -fsS -X POST ${origin[*]@Q} --data '{\"upload\":\"$id\"}' $base/api/import | grep -q '\"copied\":{\"assets\":1,\"env\":true}'"
desc="Save writes glance.yml";                            check bash -c "curl -fsS -X POST ${origin[*]@Q} --data '{}' $base/api/save | grep -q '\"status\":\"saved\"'"
for _ in $(seq 1 40); do curl -fsS -o /dev/null "http://127.0.0.1:$gport/" 2>/dev/null && break; sleep 0.5; done
desc="Glance substitutes the .env value";                 check bash -c "curl -fsS http://127.0.0.1:$gport/ | grep -q '<title>From env'"
desc="glance.yml keeps the placeholder";                  check grep -q 'name: ${PAGE_NAME}' "$work/data2/config/glance.yml"
desc="Glance serves the uploaded CSS";                    check bash -c "curl -fsS http://127.0.0.1:$gport/assets/user.css | grep -q uploaded"
editor_pid="$(pid_of "$(docker exec "$name" node -p process.execPath) /app/build")"
desc=".env values don't reach the editor";                check test "$(docker exec -u 99:100 "$name" sh -c "grep -ac 'From env' /proc/$editor_pid/environ; true")" = 0
desc=".env is readable by its owner only";                check test "$(stat -c %a "$work/data2/config/.env")" = 600
docker exec "$name" sh -c 'echo "PAGE_NAME=Changed" > /data/config/.env'
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$gport/" 2>/dev/null | grep -q '<title>Changed' && break; sleep 0.5; done
desc="a changed .env restarts Glance with it";            check bash -c "curl -fsS http://127.0.0.1:$gport/ | grep -q '<title>Changed'"
desc="container stops cleanly";                           check bash -c "docker stop -t 10 $name >/dev/null && test \"\$(docker inspect -f '{{.State.ExitCode}}' $name)\" = 0"

docker rm "$name" >/dev/null

# ---- HTTPS from Glance: widgets that fetch from the web need the image's CA certificates (Go reads the system's) ----
mkdir -p "$work/data3/config"
printf 'pages:\n  - name: Home\n    columns:\n      - size: full\n        widgets:\n          - type: weather\n            location: Berlin, Germany\n' > "$work/data3/config/glance.yml"
docker run -d --name "$name" --label "$TEST_LABEL" -p "127.0.0.1:$gport:8080" -p "127.0.0.1:$eport:3000" -v "$work/data3:/data" "$image" >/dev/null
desc="the image has a CA certificate bundle";              check docker exec "$name" test -s /etc/ssl/certs/ca-certificates.crt
for _ in $(seq 1 40); do curl -fsS -o /dev/null "http://127.0.0.1:$gport/" 2>/dev/null && break; sleep 0.5; done
weather="$(curl -fsS --max-time 30 "http://127.0.0.1:$gport/api/pages/home/content/" 2>/dev/null || true)"
if grep -q "x509\|certificate" <<<"$weather"; then
  desc="Glance verifies HTTPS sites (weather)";          check false
elif grep -qi "weather-column\|°" <<<"$weather"; then
  desc="Glance verifies HTTPS sites (weather)";          check true
else
  log "skip Glance's HTTPS check: no answer from open-meteo.com (offline?)"
fi
desc="container stops cleanly";                           check bash -c "docker stop -t 10 $name >/dev/null && test \"\$(docker inspect -f '{{.State.ExitCode}}' $name)\" = 0"

[[ $failures -eq 0 ]] || { docker logs "$name" >&2; fail "$failures all-in-one check(s) failed"; }
log "all all-in-one checks passed"
