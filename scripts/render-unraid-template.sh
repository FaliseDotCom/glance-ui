#!/usr/bin/env bash
# Fills in unraid/glance-editor.xml for one release (ADR-0024); the release workflow attaches the result.
# Usage: scripts/render-unraid-template.sh <owner/repo> <version>   (version without the v, e.g. 1.0.0 or 1.0.0-rc.1)
# A test release (a version with "-") names its exact image tag and its own template; a release follows :latest.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="${1:?owner/repo}"
version="${2:?version}"
owner="${repo%%/*}"
owner="${owner,,}"
out="$(sed -e "s|{{REPO}}|$repo|g; s|{{OWNER}}|$owner|g; s|{{VERSION}}|$version|g" "$root/unraid/glance-editor.xml")"
if [[ "$version" == *-* ]]; then
  out="$(sed -e "s|/glance-editor:latest<|/glance-editor:$version<|; s|/releases/latest/download/|/releases/download/v$version/|" <<<"$out")"
fi
if grep -q '{{' <<<"$out"; then echo "unfilled placeholder in the template" >&2; exit 1; fi
printf '%s\n' "$out"
