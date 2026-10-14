#!/usr/bin/env bash
# Builds the Unraid Community Apps repository (its layout follows unraid/unraid-community-apps-starter, read
# 2026-10-14): ca_profile.xml, templates/glance-editor.xml, icon.png, README.md and LICENSE, into <out-dir>.
# The template is unraid/glance-editor.xml filled in for releases (:latest), with the fields Community Apps adds
# (TemplateURL to this exact file, ReadMe, screenshots, licence, date).
# Usage: scripts/render-community-apps.sh <owner/repo> <ca-owner/ca-repo> <version> <out-dir>
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="${1:?owner/repo of Glance Editor}"
ca="${2:?owner/repo of the Community Apps repository}"
version="${3:?release version, e.g. 1.1.0}"
out="${4:?output folder}"
[[ "$version" != *-* ]] || { echo "Community Apps follow releases, not test releases" >&2; exit 1; }
mkdir -p "$out/templates"
fill() { sed -e "s|{{REPO}}|$repo|g; s|{{CA_REPO}}|$ca|g" "$1"; }
fill "$root/unraid/community-apps/ca_profile.xml" > "$out/ca_profile.xml"
fill "$root/unraid/community-apps/README.md" > "$out/README.md"
cp "$root/unraid/glance-editor.png" "$out/icon.png"
cp "$root/LICENSE" "$out/LICENSE"
raw="https://raw.githubusercontent.com/$repo/v$version"
extra="  <TemplateURL>https://raw.githubusercontent.com/$ca/main/templates/glance-editor.xml</TemplateURL>
  <Icon>https://raw.githubusercontent.com/$ca/main/icon.png</Icon>
  <ReadMe>$raw/README.md</ReadMe>
  <ExtraSearchTerms>glance dashboard homepage startpage editor widgets</ExtraSearchTerms>
  <License>GPL-3.0</License>
  <Changes>See https://github.com/$repo/releases</Changes>
  <Date>$(date -u +%F)</Date>
  <Screenshot>$raw/docs/screenshots/readme/dashboard-desktop.png</Screenshot>
  <Screenshot>$raw/docs/screenshots/readme/editor-page-desktop.png</Screenshot>
  <Screenshot>$raw/docs/screenshots/readme/editor-theme-desktop.png</Screenshot>
  <Screenshot>$raw/docs/screenshots/readme/editor-preview-desktop.png</Screenshot>"
"$root/scripts/render-unraid-template.sh" "$repo" "$version" \
  | grep -v -e '<TemplateURL>' -e '<Icon>' -e '^<!--' \
  | awk -v extra="$extra" '{print} /<WebUI>/ {print extra}' > "$out/templates/glance-editor.xml"
for f in "$out/ca_profile.xml" "$out/templates/glance-editor.xml"; do
  python3 -I -c 'import sys, xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])' "$f" || { echo "not well-formed XML: $f" >&2; exit 1; }
done
if grep -rq '{{' "$out"; then echo "unfilled placeholder" >&2; exit 1; fi
echo "$out"
