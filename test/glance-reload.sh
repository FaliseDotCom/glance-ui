#!/usr/bin/env bash
# Verifies Glance's config hot-reload behaviour for the pinned version.
# Each check prints ok/BAD; results are recorded in docs/adr/0009-glance-behaviour-baseline.md.
source "$(dirname "$0")/lib.sh"
guard_docker_host

port="${GLANCE_RELOAD_PORT:-18081}"
url="http://127.0.0.1:$port/"
work="$(mktemp -d)"
trap 'cleanup_test_containers; rm -rf "$work"' EXIT
cleanup_test_containers
failures=0

page() { printf 'pages:\n  - name: %s\n    columns:\n      - size: full\n        widgets:\n          - type: clock\n' "$1"; }
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }

# --- A. Directory bind mount (what the editor should use) ---------------------------
mkdir -p "$work/dir"; page Alpha > "$work/dir/glance.yml"
c="$(glance_start reload-dir "$port" -v "$work/dir:/app/config")"
desc="dir mount: initial config served";               check wait_for_text "$url" Alpha 30

page Bravo > "$work/dir/glance.yml"
desc="dir mount: in-place write reloads";              check wait_for_text "$url" Bravo

printf 'pages:\n  - name: Broken\n    columns:\n      - size: small\n' > "$work/dir/glance.yml"
sleep 3
desc="dir mount: invalid config keeps Glance running"; check container_running "$c"
desc="dir mount: invalid config keeps old config";     check wait_for_text "$url" Bravo 2
desc="dir mount: invalid config is logged";            check bash -c "docker logs '$c' 2>&1 | grep -qi 'full width columns'"

page Charlie > "$work/dir/.glance.yml.tmp"; mv "$work/dir/.glance.yml.tmp" "$work/dir/glance.yml"
desc="dir mount: atomic rename reloads";               check wait_for_text "$url" Charlie

page Delta > "$work/dir/glance.yml"
desc="dir mount: in-place write after rename reloads"; check wait_for_text "$url" Delta

printf 'pages:\n  - $include: home.yml\n' > "$work/dir/glance.yml"
printf -- '- name: Echo\n  columns:\n    - size: full\n      widgets:\n        - type: clock\n' > "$work/dir/home.yml"
desc="dir mount: \$include picked up";                  check wait_for_text "$url" Echo
printf -- '- name: Foxtrot\n  columns:\n    - size: full\n      widgets:\n        - type: clock\n' > "$work/dir/home.yml"
desc="dir mount: change to included file reloads";     check wait_for_text "$url" Foxtrot
docker rm -f "$c" >/dev/null

# --- B. Single-file bind mount + atomic rename (expected to be unsafe) --------------
mkdir -p "$work/file"; page Golf > "$work/file/glance.yml"
c="$(glance_start reload-file "$port" -v "$work/file/glance.yml:/app/config/glance.yml")"
wait_for_text "$url" Golf 30 || fail "file mount: Glance did not start"
page Hotel > "$work/file/.tmp"; mv "$work/file/.tmp" "$work/file/glance.yml"
if wait_for_text "$url" Hotel 5; then
  log "info file mount: atomic rename DID reload"
else
  log "info file mount: atomic rename did NOT reload (container still sees the old inode)"
fi
docker rm -f "$c" >/dev/null

[[ $failures -eq 0 ]] || fail "$failures reload check(s) failed"
log "all reload checks passed"
