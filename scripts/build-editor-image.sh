#!/usr/bin/env bash
# Builds the editor image with the pinned Glance binary. Usage: scripts/build-editor-image.sh [tag] (default glance-editor:dev)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../glance.version
source "$root/glance.version"
tag="${1:-glance-editor:dev}"
docker build --build-arg "GLANCE_IMAGE=$GLANCE_IMAGE" --build-arg "GLANCE_COMMIT=$GLANCE_COMMIT" -t "$tag" "$root"
echo "$tag"
