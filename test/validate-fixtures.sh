#!/usr/bin/env bash
# Runs `glance config:validate` (pinned image) on every fixture.
# Valid fixtures must pass; invalid fixtures must fail.
source "$(dirname "$0")/lib.sh"
guard_docker_host

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
failures=0

check() {
  local fixture="$1" expect="$2" name out rc extra=()
  name="$(basename "$fixture")"
  rm -rf "$work/cfg"; mkdir -p "$work/cfg"; cp "$fixture" "$work/cfg/glance.yml"
  [[ "$name" == placeholders.yml ]] && mapfile -t extra < <(placeholder_run_args)
  set +e; out="$(glance_cli "$work/cfg" config:validate "${extra[@]}" 2>&1)"; rc=$?; set -e
  if [[ "$expect" == pass && $rc -eq 0 ]] || [[ "$expect" == fail && $rc -ne 0 ]]; then
    log "ok   $expect  $name"
  else
    log "BAD  expected $expect, got exit $rc: $name"; printf '%s\n' "$out" | sed 's/^/     /' >&2
    failures=$((failures + 1))
  fi
  [[ -n "${VERBOSE:-}" ]] && printf '%s\n' "$out" | sed 's/^/     | /' >&2
  return 0
}

for f in "$REPO_ROOT"/test/fixtures/valid/*.yml;   do check "$f" pass; done
for f in "$REPO_ROOT"/test/fixtures/invalid/*.yml; do check "$f" fail; done

[[ $failures -eq 0 ]] || fail "$failures fixture(s) did not behave as expected"
log "all fixtures behaved as expected"
