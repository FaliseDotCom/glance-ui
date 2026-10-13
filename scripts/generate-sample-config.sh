#!/usr/bin/env bash
# Writes the config used by the CI smoke test to the path given as $1, using the real generator on the sample model.
set -euo pipefail
out="${1:?usage: generate-sample-config.sh <output-file>}"
cd "$(dirname "$0")/.."
node packages/generator/src/cli.ts test/fixtures/model/v1/sample.json --out "$out"
