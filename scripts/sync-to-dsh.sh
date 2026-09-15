#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DSH_HOME:=$HOME/.dsh}"
DEST="${DSH_HOME}/local-plugins/dsh-ssh-tunnel"
mkdir -p "$DEST/lib/shared" "$DEST/scripts"
rsync -a --delete \
  --exclude node_modules \
  --exclude package-lock.json \
  "$ROOT/package.json" "$ROOT/cordis.patch.yml" "$ROOT/LICENSE" "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/CHANGELOG.md" "$ROOT/CHANGELOG.zh-CN.md" \
  "$DEST/" 2>/dev/null || {
  cp -a "$ROOT/package.json" "$ROOT/cordis.patch.yml" "$ROOT/LICENSE" "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/CHANGELOG.md" "$ROOT/CHANGELOG.zh-CN.md" "$DEST/"
}
cp -a "$ROOT/lib/." "$DEST/lib/"
cp -a "$ROOT/scripts/." "$DEST/scripts/"
# keep existing node_modules; reinstall if any runtime dep (ssh2 / xterm) is missing
if [[ ! -d "$DEST/node_modules/ssh2" || ! -d "$DEST/node_modules/@xterm/xterm" || ! -d "$DEST/node_modules/@xterm/addon-fit" ]]; then
  (cd "$DEST" && npm install --omit=dev --ignore-scripts)
fi
echo "synced -> $DEST"
node --check "$DEST/lib/index.js"
node "$DEST/scripts/smoke-test.mjs"
