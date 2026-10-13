#!/usr/bin/env bash
# Extracts the glance binary from the pinned image (/glance.version) into a cache dir and prints its path.
# Used by tests (GLANCE_BIN). The editor image copies the same binary (Dockerfile).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../glance.version
source "$root/glance.version"
dir="${GLANCE_EDITOR_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/glance-editor}/bin/$GLANCE_COMMIT"
bin="$dir/glance"
if [[ ! -x "$bin" ]]; then
  mkdir -p "$dir"
  cid="$(docker create "$GLANCE_IMAGE")"
  trap 'docker rm -f "$cid" >/dev/null' EXIT
  docker cp "$cid:/app/glance" "$bin.tmp" >/dev/null
  chmod +x "$bin.tmp"; mv "$bin.tmp" "$bin"
fi
echo "$bin"
