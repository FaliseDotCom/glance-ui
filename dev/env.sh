# shellcheck shell=bash
# shellcheck disable=SC2034 # variables are used by the scripts that source this file
# Shared settings for the LAN dev environment. Source this file; do not execute it.
# Everything is labelled glance-editor-dev=1. The test harness (label glance-editor-test=1) never touches it,
# and these scripts never touch anything without this label.
set -euo pipefail

DEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../glance.version
source "$DEV_ROOT/glance.version"
# shellcheck source=../docker-proxy.version
source "$DEV_ROOT/docker-proxy.version"

DEV_LABEL="glance-editor-dev=1"
DEV_NETWORK="glance-editor-dev"
DEV_GLANCE="glance-editor-dev-glance"
DEV_EDITOR="glance-editor-dev-editor"
DEV_PREVIEW="glance-editor-dev-preview"   # the preview Glance (ADR-0019): no published port, reached through the editor
DEV_DOCKER_PROXY="glance-editor-dev-docker-proxy" # the editor's read-only Docker connection (ADR-0005): no published port

# Bind address: 0.0.0.0 makes the services reachable from the LAN (the PM's choice). Set DEV_BIND=127.0.0.1 to keep them local.
DEV_BIND="${DEV_BIND:-0.0.0.0}"
DEV_GLANCE_PORT="${DEV_GLANCE_PORT:-18180}"
DEV_EDITOR_PORT="${DEV_EDITOR_PORT:-18190}"

# State lives outside the repo, so it is never committed (the repo is public).
DEV_STATE="${DEV_STATE:-${XDG_DATA_HOME:-$HOME/.local/share}/glance-editor-dev}"
DEV_CONFIG_DIR="$DEV_STATE/glance-config"   # mounted as a DIRECTORY (ADR-0009: required for atomic saves)
DEV_EDITOR_DATA="$DEV_STATE/editor-data"
DEV_PREVIEW_DIR="$DEV_STATE/preview-config" # the preview Glance's own config dir; the editor writes it, never glance.yml
DEV_ASSETS_DIR="$DEV_STATE/assets"          # Glance's assets folder: /app/assets in both Glances, ASSETS_DIR for the editor

log() { printf '[dev] %s\n' "$*" >&2; }
