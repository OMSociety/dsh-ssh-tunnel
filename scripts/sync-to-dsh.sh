#!/usr/bin/env bash
# 把本仓库作为本地 link 插件接入 DSH profile（开发用）。
#
# 早期版本把文件复制进 $DSH_HOME/local-plugins/<pkg> 并就地 npm install；
# 当前运行时不再读取该目录，于是那条路径等于静默无效。现在改走官方入口：
#   dsh plugin --profile <profile> add "link:<repo>"
# 由 DSH 自己登记 dsh.profile.bundles 并解析依赖（ssh2 / @xterm/*），仓库改动无需再同步。
#
# 环境：DSH_PROFILE（默认 web）、DSH_CMD（默认 dsh）；DSH_HOME 由 dsh 自行解析。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${DSH_PROFILE:-web}"
DSH_CMD="${DSH_CMD:-dsh}"

command -v node >/dev/null 2>&1 || { echo "需要 node（>= 20）" >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || NODE_MAJOR=0
[ "${NODE_MAJOR:-0}" -ge 20 ] || { echo "Node.js $(node -v) 过旧（需要 ≥ 20）" >&2; exit 1; }

echo "== 自检：$ROOT =="
node --check "$ROOT/lib/index.js"
node "$ROOT/scripts/smoke-test.mjs"

if ! command -v "$DSH_CMD" >/dev/null 2>&1; then
  echo "未找到 $DSH_CMD（可用 DSH_CMD 指定）；手动执行：" >&2
  echo "  dsh plugin --profile $PROFILE add \"link:$ROOT\"" >&2
  exit 1
fi

echo "== 接入 profile ${PROFILE}（link） =="
"$DSH_CMD" plugin --profile "$PROFILE" add "link:$ROOT"
echo "已接入：$ROOT"
echo "下一步：重启 dsh web，并硬刷新浏览器。"
