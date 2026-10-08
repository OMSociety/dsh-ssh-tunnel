#!/usr/bin/env bash
# 把本仓库作为本地 link 插件接入 DSH profile（开发用）。
#
# 早期版本把文件复制进 $DSH_HOME/local-plugins/<pkg> 并就地 npm install；
# 当前运行时不再读取该目录，于是那条路径等于静默无效。现在改走官方入口：
#   dsh plugin --profile <profile> add "link:<repo>"
# 由 DSH 自己登记 dsh.profile.bundles 并解析依赖（ssh2 / @xterm/*），仓库改动无需再同步。
#
# 用法：
#   bash scripts/sync-to-dsh.sh [-p|--profile <名称>] [--dry-run] [-h|--help]
#
#   -p/--profile  目标 profile；缺省读 DSH_PROFILE 环境变量；两者皆无则报错并列出实存 profile。
#   --dry-run     只打印将执行的命令，不做任何改动。
#
# 环境：DSH_PROFILE、DSH_CMD（默认 dsh）、DSH_HOME（默认 ~/.dsh，用于列出实存 profile）。
# MSYS/git-bash 下会用 cygpath -w 把仓库路径转成 Windows 形态再拼 link: spec。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_HOME:-${HOME:-${USERPROFILE:-}}/.dsh}"
DSH_CMD="${DSH_CMD:-dsh}"

usage() {
  cat <<'EOF'
把本仓库作为本地 link 插件接入 DSH profile（开发用）

用法：bash scripts/sync-to-dsh.sh [-p|--profile <名称>] [--dry-run] [-h|--help]

  -p|--profile <名>  目标 profile；缺省读 DSH_PROFILE 环境变量（两者皆无则报错并列出实存 profile）
  --dry-run          只打印将执行的命令，不做任何改动
  -h|--help          显示本帮助

环境：DSH_PROFILE、DSH_CMD（默认 dsh）、DSH_HOME（默认 ~/.dsh）
EOF
}

list_profiles() {
  if [ ! -d "$DSH_HOME/profiles" ]; then
    echo "  （未找到 $DSH_HOME/profiles）"
    return 0
  fi
  local any="" d
  for d in "$DSH_HOME"/profiles/*/; do
    [ -d "$d" ] || continue
    any=1
    echo "  - $(basename "$d")"
  done
  [ -n "$any" ] || echo "  （$DSH_HOME/profiles 下没有 profile）"
}

PROFILE="${DSH_PROFILE:-}"
DRY_RUN=false
SHOW_HELP=false

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)
      [ $# -ge 2 ] || { echo "[error] $1 需要一个名称（用 -h 查看用法）" >&2; exit 2; }
      PROFILE="$2"; shift 2 ;;
    --profile=*) PROFILE="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) SHOW_HELP=true; shift ;;
    -*) echo "[error] 未知参数: $1（用 -h 查看用法）" >&2; exit 2 ;;
    *) echo "[error] 多余的位置参数: $1（用 -h 查看用法）" >&2; exit 2 ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then usage; exit 0; fi

if [ -z "$PROFILE" ]; then
  echo "[error] 未指定 profile（用 -p/--profile 或环境变量 DSH_PROFILE）。$DSH_HOME/profiles/ 下实存 profile：" >&2
  list_profiles >&2
  exit 2
fi

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
if [ ! -d "$PROFILE_DIR" ]; then
  echo "[error] profile 不存在: $PROFILE（$PROFILE_DIR）。$DSH_HOME/profiles/ 下实存 profile：" >&2
  list_profiles >&2
  exit 2
fi

# MSYS/git-bash/Cygwin：link: spec 需要 Windows 路径形态
LINK_TARGET="$ROOT"
if command -v cygpath >/dev/null 2>&1 && uname -s 2>/dev/null | grep -qiE 'MINGW|MSYS|CYGWIN'; then
  LINK_TARGET="$(cygpath -w "$ROOT")"
fi
ADD_SPEC="link:$LINK_TARGET"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] 1) node --check \"$ROOT/lib/index.js\""
  echo "[dry-run] 2) node \"$ROOT/scripts/smoke-test.mjs\""
  printf '[dry-run] 3) %s plugin --profile %s add "%s"\n' "$DSH_CMD" "$PROFILE" "$ADD_SPEC"
  exit 0
fi

command -v node >/dev/null 2>&1 || { echo "需要 node（>= 20）" >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || NODE_MAJOR=0
[ "${NODE_MAJOR:-0}" -ge 20 ] || { echo "Node.js $(node -v) 过旧（需要 ≥ 20）" >&2; exit 1; }

echo "== 自检：$ROOT =="
node --check "$ROOT/lib/index.js"
node "$ROOT/scripts/smoke-test.mjs"

if ! command -v "$DSH_CMD" >/dev/null 2>&1; then
  echo "未找到 $DSH_CMD（可用 DSH_CMD 指定）；手动执行：" >&2
  printf '  %s plugin --profile %s add "%s"\n' "$DSH_CMD" "$PROFILE" "$ADD_SPEC" >&2
  exit 1
fi

echo "== 接入 profile ${PROFILE}（link） =="
"$DSH_CMD" plugin --profile "$PROFILE" add "$ADD_SPEC"
printf '已接入：%s\n' "$ROOT"
echo "下一步：重启 dsh web，并硬刷新浏览器。"
