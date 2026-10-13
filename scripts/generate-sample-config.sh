#!/usr/bin/env bash
# Writes the config used by the CI smoke test to the path given as $1.
# Phase 0: there is no generator yet, so this copies the hand-written fixture.
# From Phase 1 this must call the editor's real YAML generator on a seed data model,
# so CI proves that generated output is accepted by the pinned Glance.
set -euo pipefail
out="${1:?usage: generate-sample-config.sh <output-file>}"
cp "$(dirname "$0")/../test/fixtures/valid/sample.yml" "$out"
