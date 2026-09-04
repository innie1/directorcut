#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for bin in node npm ffmpeg ffprobe python3; do
  command -v "$bin" >/dev/null || { echo "Missing dependency: $bin"; exit 1; }
done
cd "$ROOT/desktop"
npm install
echo "Setup complete. Run: ./scripts/run-linux.sh"
