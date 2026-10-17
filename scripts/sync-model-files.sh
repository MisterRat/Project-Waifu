#!/usr/bin/env bash
# Apply the master motion set (assets/motions) to a Live2D model folder, then fill in
# expression files for emotions the model has no face for. Existing expression files
# (e.g. a rigger's) are never touched; motion files from the master set replace the
# model's copies so every app plays the same ones.
#
#   scripts/sync-model-files.sh <model folder> [model name, e.g. tamamo] [--register]
set -euo pipefail
dir="$1"; name="${2:-}"; register="${3:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$dir/Motions"
cp "$here"/assets/motions/shared/*.motion3.json "$dir/Motions/"
if [ -n "$name" ] && [ -d "$here/assets/motions/$name" ]; then
  cp "$here/assets/motions/$name/"*.motion3.json "$dir/Motions/"
fi
(cd "$here" && npx tsx scripts/export-model-files.ts "$dir" --faces-only $register)
