#!/usr/bin/env bash
# =============================================================================
# dsh-ssh-tunnel 一键安装（官方 CLI + bundle 自动挂载）
#
#   dsh plugin --profile <名称> add <spec>
#
# 包内 dsh.bundle.patch（cordis.patch.yml）会由 CLI 写入
# dsh.profile.bundles，无需手写 profile cordis.patch.yml。
#
# 用法：
#   bash scripts/install.sh [版本] [--profile <名称>] [--fix-profile] [--from github|npm] [--restart] [--dry-run] [-h|--help]
#
#   版本            npm 版本或 github 的 branch/tag/commit；github 源可省略（默认 HEAD）
#   --profile       目标 profile 名称（必填，无默认值；缺失或不存在时列出实存 profile 并退出 2）
#   --fix-profile   可选维护动作：向 pnpm-workspace.yaml 的 minimumReleaseAgeExclude
#                   追加本包（幂等），并清理 cordis.patch.yml 里 id: ssh-tunnel 的
#                   旧手动挂载块（幂等）。两者均写后回读断言，失败回滚并以非零码退出。
#                   不带本参数时绝不改写这两个文件，只在缺条目时打 warn 提示。
#   --from          github（默认，仓库尚未上 npm 时）| npm
#   --restart       尝试 pm2 restart dsh-web
#   --dry-run       只打印步骤，不写任何文件
#
# 环境：DSH_HOME（默认 ~/.dsh）、DSH_CMD（默认 dsh）、REGISTRY、GITHUB_REPO、
#       DSH_INSTALL_YES=1（跳过 npx 兜底的交互确认）
# =============================================================================
set -euo pipefail

PKG="dsh-ssh-tunnel"
PLUGIN_ID="ssh-tunnel"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
GITHUB_REPO="${GITHUB_REPO:-OMSociety/dsh-ssh-tunnel}"
REGISTRY="${REGISTRY:-https://registry.npmjs.org}"
DSH_CMD="${DSH_CMD:-dsh}"
DSH_HOME="${DSH_HOME:-${HOME:-${USERPROFILE:-}}/.dsh}"

usage() {
  cat <<'EOF'
dsh-ssh-tunnel 一键安装

用法：bash scripts/install.sh [版本] [--profile <名称>] [--fix-profile] [--from github|npm] [--restart] [--dry-run] [-h|--help]

  版本            npm 版本或 github 的 branch/tag/commit；github 源可省略（默认 HEAD）
  --profile <名>  目标 profile 名称（必填，无默认值）
  --fix-profile   可选：补写 minimumReleaseAgeExclude 并清理旧手动挂载（幂等、带回读断言）
  --from          github（默认）| npm
  --restart       装完尝试 pm2 restart dsh-web
  --dry-run       只打印操作，不写任何文件
  -h|--help       显示本帮助

环境：DSH_HOME（默认 ~/.dsh）、DSH_CMD（默认 dsh）、REGISTRY、GITHUB_REPO、
      DSH_INSTALL_YES=1（跳过 npx 兜底确认）

前置：目标 profile 已初始化（含 package.json 与 pnpm-workspace.yaml）；
      建议已装 dsh-better-sidebar（侧栏 Tab 依赖）。
EOF
}

say()  { printf '\033[32m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

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

# ---------- 参数解析 ----------
PROFILE_NAME=""
FROM="github"
VERSION_SPEC=""
FIX_PROFILE=false
RESTART=false
DRY_RUN=false
SHOW_HELP=false

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) SHOW_HELP=true; shift ;;
    --profile)
      [ $# -ge 2 ] || { echo "[error] --profile 需要一个名称（用 -h 查看用法）" >&2; exit 2; }
      PROFILE_NAME="$2"; shift 2 ;;
    --profile=*) PROFILE_NAME="${1#*=}"; shift ;;
    --fix-profile) FIX_PROFILE=true; shift ;;
    --from)
      [ $# -ge 2 ] || { echo "[error] --from 需要 github|npm（用 -h 查看用法）" >&2; exit 2; }
      FROM="$2"; shift 2 ;;
    --from=*) FROM="${1#*=}"; shift ;;
    --restart) RESTART=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -*) echo "[error] 未知参数: $1（用 -h 查看用法）" >&2; exit 2 ;;
    *)
      if [ -n "$VERSION_SPEC" ]; then
        echo "[error] 多余的位置参数: $1（版本只能传一个，用 -h 查看用法）" >&2
        exit 2
      fi
      VERSION_SPEC="$1"; shift ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then usage; exit 0; fi

case "$FROM" in
  github|npm) ;;
  *) echo "[error] --from 只能是 github 或 npm（当前: $FROM）" >&2; exit 2 ;;
esac

if [ -z "$PROFILE_NAME" ]; then
  echo "[error] 缺少 --profile 参数。$DSH_HOME/profiles/ 下实存 profile：" >&2
  list_profiles >&2
  exit 2
fi

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE_NAME"
WS_YML="$PROFILE_DIR/pnpm-workspace.yaml"
PATCH_YML="$PROFILE_DIR/cordis.patch.yml"
PKG_JSON="$PROFILE_DIR/package.json"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "[error] profile 不存在: $PROFILE_NAME（$PROFILE_DIR）。$DSH_HOME/profiles/ 下实存 profile：" >&2
  list_profiles >&2
  exit 2
fi

# ---------- 前置检查 ----------
command -v node >/dev/null 2>&1 || die "未找到 node（需要 Node.js ≥ 20）。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || NODE_MAJOR=0
[ "${NODE_MAJOR:-0}" -ge 20 ] || die "Node.js $(node -v 2>/dev/null) 过旧（需要 ≥ 20）。"

resolve_add_spec() {
  if [ "$FROM" = "npm" ]; then
    local given="${VERSION_SPEC:-latest}"
    if [ "$given" = "latest" ]; then
      local v=""
      if command -v npm >/dev/null 2>&1; then
        v="$(npm view "$PKG" version --registry="$REGISTRY" 2>/dev/null)" || v=""
      fi
      if [ -z "$v" ] && command -v pnpm >/dev/null 2>&1; then
        v="$(pnpm view "$PKG" version --registry="$REGISTRY" 2>/dev/null)" || v=""
      fi
      if [ -n "$v" ]; then printf '%s@%s' "$PKG" "$v"
      else printf '%s@latest' "$PKG"
      fi
    else
      printf '%s@%s' "$PKG" "$given"
    fi
  else
    local ref="${VERSION_SPEC:-}"
    if [ -n "$ref" ]; then
      printf '%s@github:%s#%s' "$PKG" "$GITHUB_REPO" "$ref"
    else
      printf '%s@github:%s' "$PKG" "$GITHUB_REPO"
    fi
  fi
}
ADD_SPEC="$(resolve_add_spec)"

# ---------- dsh CLI 解析（npx 兜底需交互确认） ----------
DSH_CLI_CMD=""
NPX_FALLBACK=false
if command -v "$DSH_CMD" >/dev/null 2>&1; then
  DSH_CLI_CMD="$DSH_CMD"
elif command -v npx >/dev/null 2>&1; then
  DSH_CLI_CMD="npx -y --package @deepseek-ai/dsh dsh"
  NPX_FALLBACK=true
else
  die "未找到 dsh 或 npx。请先安装 DSH，或用 DSH_CMD 指定。"
fi

say "目标：$DSH_CLI_CMD plugin --profile $PROFILE_NAME add $ADD_SPEC（profile 目录: $PROFILE_DIR）"
say "来源：$FROM（仓库 $GITHUB_REPO）"

if [ "$DRY_RUN" = true ]; then
  say "[dry-run] 1) minimumReleaseAgeExclude 处理（--fix-profile 时写入，否则仅检查+warn）：$WS_YML"
  say "[dry-run] 2) $DSH_CLI_CMD plugin --profile $PROFILE_NAME add $ADD_SPEC"
  say "[dry-run] 3) 校验 dsh.profile.bundles 含 $PKG：$PKG_JSON"
  say "[dry-run] 4) allowBuilds 预检（advisory）：$PROFILE_DIR/node_modules/.modules.yaml"
  say "[dry-run] 5) 旧手动挂载清理（仅 --fix-profile）：$PATCH_YML"
  if [ "$RESTART" = true ]; then
    say "[dry-run] 6) pm2 restart dsh-web"
  else
    say "[dry-run] 6) 提示重启 DSH web 并硬刷新浏览器"
  fi
  exit 0
fi

# npx 兜底：任何写操作发生前先交互确认
if [ "$NPX_FALLBACK" = true ]; then
  say "未找到 dsh，将用 npx 兜底执行：$DSH_CLI_CMD plugin --profile $PROFILE_NAME add $ADD_SPEC"
  if [ "${DSH_INSTALL_YES:-0}" != "1" ]; then
    printf '继续执行将联网下载并运行 @deepseek-ai/dsh，确认? [y/N] '
    REPLY=""
    read -r REPLY || { echo; die "读取确认失败，中止。"; }
    case "$REPLY" in
      y|Y|yes|YES|Yes) ;;
      *) die "已中止（未执行任何安装步骤）。" ;;
    esac
  fi
fi

[ -f "$PKG_JSON" ] || die "找不到 $PKG_JSON（profile 未初始化？）"
if [ "$FIX_PROFILE" = true ] && [ ! -f "$WS_YML" ]; then
  die "找不到 $WS_YML（--fix-profile 需要它来补写 minimumReleaseAgeExclude）"
fi

# ---------- 1) minimumReleaseAgeExclude ----------
if [ "$FIX_PROFILE" = true ]; then
  WS_RESULT="$(node "$LIB_DIR/ws-exclude.cjs" "$WS_YML" "$PKG")" \
    || die "--fix-profile：补写 minimumReleaseAgeExclude 失败（文件已保持原样）。"
  case "$WS_RESULT" in
    updated)   say "已补写 $WS_YML：minimumReleaseAgeExclude += $PKG" ;;
    unchanged) say "minimumReleaseAgeExclude 已含 $PKG，跳过" ;;
    *)         say "workspace exclude 状态: $WS_RESULT" ;;
  esac
else
  if [ -f "$WS_YML" ]; then
    if ! node "$LIB_DIR/ws-exclude.cjs" --check "$WS_YML" "$PKG" >/dev/null 2>&1; then
      warn "minimumReleaseAgeExclude 未包含 ${PKG}——pnpm minimumReleaseAge 可能拒绝安装；可加 --fix-profile 自动补写。"
    fi
  else
    warn "未找到 $WS_YML，跳过 minimumReleaseAgeExclude 检查。"
  fi
fi

# ---------- 2) plugin add ----------
say "执行 $DSH_CLI_CMD plugin --profile $PROFILE_NAME add $ADD_SPEC ..."
read -r -a CLI_ARR <<< "$DSH_CLI_CMD"
if ! "${CLI_ARR[@]}" plugin --profile "$PROFILE_NAME" add "$ADD_SPEC"; then
  warn "dsh plugin add 失败。可检查网络、registry，或手动执行："
  warn "  $DSH_CLI_CMD plugin --profile $PROFILE_NAME add \"$ADD_SPEC\""
  warn "前置建议：dsh plugin --profile $PROFILE_NAME add dsh-better-sidebar"
  exit 1
fi

# ---------- 3) bundle 校验 ----------
if ! node "$LIB_DIR/bundle-check.cjs" "$PKG_JSON" "$PKG"; then
  warn "$PKG 未出现在 dsh.profile.bundles——挂载未注册。"
  exit 1
fi
say "bundle 已注册：dsh.profile.bundles 包含 $PKG"

# ---------- 4) allowBuilds 预检（advisory） ----------
if ! node "$LIB_DIR/bundle-check.cjs" --ignored-builds "$PROFILE_DIR"; then
  warn "allowBuilds 预检异常（不影响安装结果）。"
fi

# ---------- 5) 旧手动挂载清理（仅 --fix-profile） ----------
if [ "$FIX_PROFILE" = true ] && [ -f "$PATCH_YML" ]; then
  STRIP_RESULT="$(node "$LIB_DIR/strip-mount.cjs" "$PATCH_YML" "$PLUGIN_ID")" \
    || die "清理旧手动挂载失败（$PATCH_YML 已回滚为原内容；插件本体安装不受影响）。"
  case "$STRIP_RESULT" in
    removed) say "已从 $PATCH_YML 移除旧的 $PLUGIN_ID 手动挂载块" ;;
    none)    say "无旧手动挂载块，跳过" ;;
  esac
fi

say "安装完成：$ADD_SPEC（profile: $PROFILE_NAME）"
say "验证：dsh --profile $PROFILE_NAME --dump-config | grep -n '${PLUGIN_ID}\\|${PKG}'"

if [ "$RESTART" = true ]; then
  if command -v pm2 >/dev/null 2>&1; then
    say "重启 dsh-web（pm2）..."
    pm2 restart dsh-web || warn "pm2 restart 失败，请手动重启 DSH"
  else
    warn "未找到 pm2，请手动重启 DSH（docker compose restart / pm2 / 进程管理器）"
  fi
else
  say "下一步：重启 DSH web，并硬刷新浏览器（Cmd/Ctrl+Shift+R）。"
fi
