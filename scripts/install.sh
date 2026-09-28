#!/usr/bin/env bash
# =============================================================================
# dsh-ssh-tunnel 一键安装（官方 CLI + bundle 自动挂载）
#
#   dsh plugin --profile web add <spec>
#
# 包内 dsh.bundle.patch（cordis.patch.yml）会由 CLI 写入
# dsh.profile.bundles，无需手写 profile cordis.patch.yml。
#
# 用法：
#   bash scripts/install.sh [版本] [--restart] [--dry-run] [--from github|npm]
#
#   版本         npm/git 版本；github 源可省略（默认 HEAD）或传 branch/tag/commit
#   --from       github（默认，仓库尚未上 npm 时）| npm
#   --restart    尝试 pm2 restart dsh-web
#   --dry-run    只打印步骤
#
# 环境：DSH_HOME（默认 ~/.dsh）、REGISTRY、DSH_CMD、GITHUB_REPO
# =============================================================================
set -euo pipefail

for arg in "$@"; do
  if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
    cat <<'EOF'
dsh-ssh-tunnel 一键安装

用法：bash scripts/install.sh [版本] [--restart] [--dry-run] [--from github|npm]

  版本         缺省：github 用默认分支；npm 用 latest
  --from       github（默认）| npm
  --restart    装完尝试 pm2 restart dsh-web
  --dry-run    只打印操作

前置：已安装并运行过 dsh web；建议已装 dsh-better-sidebar（侧栏 Tab 依赖）。
EOF
    exit 0
  fi
done

PKG="dsh-ssh-tunnel"
PLUGIN_ID="ssh-tunnel"
GITHUB_REPO="${GITHUB_REPO:-OMSociety/dsh-ssh-tunnel}"
DSH_HOME="${DSH_HOME:-${HOME:-${USERPROFILE:-}}/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/web"
WS_YML="$PROFILE_DIR/pnpm-workspace.yaml"
PATCH_YML="$PROFILE_DIR/cordis.patch.yml"
REGISTRY="${REGISTRY:-https://registry.npmjs.org}"
DSH_CMD="${DSH_CMD:-dsh}"

RESTART=false
DRY_RUN=false
FROM="github"
VERSION_SPEC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --restart) RESTART=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --from)
      [ $# -ge 2 ] || { echo "--from 需要 github|npm" >&2; exit 2; }
      FROM="$2"; shift 2
      ;;
    --from=github) FROM="github"; shift ;;
    --from=npm) FROM="npm"; shift ;;
    -h|--help) shift ;;
    -*)
      echo "未知参数: ${1}（用 -h 查看用法）" >&2
      exit 2
      ;;
    *) VERSION_SPEC="$1"; shift ;;
  esac
done
case "$FROM" in github|npm) ;; *) echo "--from 只能是 github 或 npm" >&2; exit 2 ;; esac

say()  { printf '\033[32m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

dsh_cli() {
  if command -v "$DSH_CMD" >/dev/null 2>&1; then
    printf '%s' "$DSH_CMD"
  elif command -v npx >/dev/null 2>&1; then
    printf 'npx -y --package @deepseek-ai/dsh dsh'
  else
    die "未找到 dsh 或 npx。请先安装 DSH，或用 DSH_CMD 指定。"
  fi
}

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

command -v node >/dev/null 2>&1 || die "未找到 node（需要 Node.js ≥ 20）。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || NODE_MAJOR=0
[ "${NODE_MAJOR:-0}" -ge 20 ] || die "Node.js $(node -v) 过旧（需要 ≥ 20）。"
[ -d "$PROFILE_DIR" ] || die "找不到 profile 目录：${PROFILE_DIR}（请先运行过 dsh web）"
[ -f "$WS_YML" ] || die "找不到 ${WS_YML}（请先初始化 web profile）"

ADD_SPEC="$(resolve_add_spec)"
CLI="$(dsh_cli)"
say "目标：$CLI plugin --profile web add ${ADD_SPEC}（profile: ${PROFILE_DIR}）"
say "来源：${FROM}（仓库 ${GITHUB_REPO}）"

if [ "$DRY_RUN" = true ]; then
  say "[dry-run] 1) minimumReleaseAgeExclude += ${PKG}"
  say "[dry-run] 2) $CLI plugin --profile web add ${ADD_SPEC}"
  say "[dry-run] 3) 校验 dsh.profile.bundles 含 ${PKG}"
  say "[dry-run] 4) 移除 profile cordis.patch.yml 中 id: ${PLUGIN_ID} 的旧手动挂载"
  if [ "$RESTART" = true ]; then say "[dry-run] 5) pm2 restart dsh-web"; else say "[dry-run] 5) 提示手动重启"; fi
  exit 0
fi

WS_RESULT="$(node -e '
const fs = require("fs");
const p = process.argv[1];
const pkg = process.argv[2];
let t = fs.readFileSync(p, "utf8");
const before = t;
if (!new RegExp("^\\s*-\\s+" + pkg.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "\\s*$", "m").test(t)) {
  if (/^\\s*minimumReleaseAgeExclude:\\s*$/m.test(t)) {
    t = t.replace(/^(\\s*minimumReleaseAgeExclude:\\s*)$/m, "$1\\n  - " + pkg);
  } else {
    t += "\\nminimumReleaseAgeExclude:\\n  - " + pkg + "\\n";
  }
}
if (t !== before) fs.writeFileSync(p, t);
console.log(t === before ? "unchanged" : "updated");
' "$WS_YML" "$PKG")"
[ "$WS_RESULT" = "updated" ] \
  && say "已写入 ${WS_YML}：minimumReleaseAgeExclude（${PKG}）" \
  || say "workspace 设置已就绪，跳过"

say "执行 $CLI plugin --profile web add $ADD_SPEC ..."
if ! $CLI plugin --profile web add "$ADD_SPEC" 2>&1 | tail -n +1; then
  warn "dsh plugin add 失败。可检查网络、registry，或手动："
  warn "  cd $PROFILE_DIR && pnpm install"
  warn "前置建议：dsh plugin --profile web add dsh-better-sidebar"
  exit 1
fi

if ! node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const bundles = p.dsh?.profile?.bundles ?? [];
  process.exit(bundles.includes(process.argv[2]) ? 0 : 1);
' "$PROFILE_DIR/package.json" "$PKG"; then
  warn "${PKG} 未出现在 dsh.profile.bundles——挂载未注册。"
  exit 1
fi
say "bundle 已注册：dsh.profile.bundles 包含 ${PKG}"

if [ -f "$PATCH_YML" ]; then
  MOUNT_RESULT="$(node -e '
const fs = require("fs");
const p = process.argv[1];
const id = process.argv[2];
const lines = fs.readFileSync(p, "utf8").split("\\n");
const out = [];
let i = 0;
let removed = false;
const idRe = new RegExp("id:\\\\s*" + id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "\\\\b");
while (i < lines.length) {
  const line = lines[i];
  if (/^[ \\t]*- insert:\\s*$/.test(line)) {
    const block = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !/^-\\s/.test(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    if (block.some((l) => idRe.test(l))) {
      while (out.length && /^[ \\t]*#/.test(out[out.length - 1])) out.pop();
      i = j;
      removed = true;
      continue;
    }
  }
  out.push(line);
  i++;
}
if (!removed) console.log("none");
else {
  fs.writeFileSync(p, out.join("\\n").replace(/\\n{3,}/g, "\\n\\n"));
  console.log("removed");
}
' "$PATCH_YML" "$PLUGIN_ID")"
  [ "$MOUNT_RESULT" = "removed" ] \
    && say "已从 $PATCH_YML 移除旧的 ${PLUGIN_ID} 手动挂载行" \
    || say "无旧手动挂载行，跳过"
fi

say "安装完成：${ADD_SPEC}"
say "验证：dsh --profile web --dump-config | grep -n '${PLUGIN_ID}\\|${PKG}'"

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
