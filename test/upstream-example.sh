#!/usr/bin/env bash
# Downloads Glance's own example config (docs/glance.yml) at the pinned commit, checks its sha256, and validates it.
# It is the import fixture for Phase 2 (ADR-0011). It is not committed: Glance is AGPL-3.0 and this repo's
# license is not decided yet.
# Usage: test/upstream-example.sh [--print-path]   (prints the cached file path instead of only validating)
source "$(dirname "$0")/lib.sh"
guard_docker_host

cache="${GLANCE_EDITOR_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/glance-editor}/upstream/$GLANCE_COMMIT"
file="$cache/glance.yml"
if [[ ! -f "$file" ]]; then
  mkdir -p "$cache"
  curl -fsSL "https://raw.githubusercontent.com/glanceapp/glance/$GLANCE_COMMIT/docs/glance.yml" -o "$file.tmp"
  mv "$file.tmp" "$file"
fi
actual="$(sha256sum "$file" | cut -d' ' -f1)"
[[ "$actual" == "$GLANCE_EXAMPLE_SHA256" ]] || { rm -f "$file"; fail "checksum mismatch for upstream example ($actual)"; }

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp "$file" "$work/glance.yml"
glance_cli "$work" config:validate >/dev/null || fail "upstream example does not pass config:validate"
log "ok   upstream example ($GLANCE_VERSION) downloaded, checksum verified, passes config:validate"
[[ "${1:-}" == "--print-path" ]] && echo "$file"
exit 0
