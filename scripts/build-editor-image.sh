#!/usr/bin/env bash
# Builds the editor image with the pinned Glance binary.
# Usage: scripts/build-editor-image.sh [tag] [extra docker build args…] (default tag glance-editor:dev; the release workflow adds labels)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../glance.version
source "$root/glance.version"
tag="${1:-glance-editor:dev}"
shift || true
docker build --build-arg "GLANCE_IMAGE=$GLANCE_IMAGE" --build-arg "GLANCE_COMMIT=$GLANCE_COMMIT" --build-arg "GLANCE_VERSION=$GLANCE_VERSION" -t "$tag" "$@" "$root"
echo "$tag"
