# AGENTS.md — dsh-ssh-tunnel Agent 宪法

适用范围：本仓库全部目录。
最后更新：2026-10-09

## 项目概览

- 一句话定位：DeepSeek Harness（DSH）的社区插件——SSH 主机库 + 按项目授权 + 侧栏终端与双栏 SFTP，并通过 `SSHManager` 工具把远端能力暴露给模型。
- 运行时：Node >= 20、纯 JavaScript、ESM（`"type": "module"`）。浏览器半侧是自包含 bundle，宿主半侧无构建步骤。
- 直接依赖：`ssh2`（`^1.17.0`，浮动）、`@xterm/xterm@5.5.0`、`@xterm/addon-fit@0.11.0`（精确钉版）。
- 宿主 peer：`@deepseek-ai/cordis@^4.0.4`、`@deepseek-ai/dsh-client-locale`、`dsh-better-sidebar>=0.12.0`。
- 没有 TypeScript、没有 lint/format/类型检查配置、没有 CI 目录：代码风格与正确性只靠上面两条命令加人工把关，无工具兜底。
- 文档索引：[README.md](./README.md) 与 [README_en.md](./README_en.md)（逐节对应）、[CHANGELOG.md](./CHANGELOG.md)（中英并列段，Keep a Changelog + SemVer）、[package.json](./package.json)。

## 常用命令

| 目的 | 命令 | 什么算通过 |
|---|---|---|
| 跑全部自检 | `npm test` | 每用例一行 `ok`（当前 50）+ 末行 `50 passed, 0 skipped, 0 failed`、`all passed` + 退出码 0 |
| 语法检查加自检 | `npm run check` | `node --check lib/index.js` 无输出，随后同一套自检（当前 50 用例）+ 末行 `all passed` + 退出码 0 |
| 浏览器产物语法 | `node --check lib/client.js` | 无输出、退出码 0 |
| 发布前的文件清单自查 | `npm pack --dry-run` | 计数与 `files` 白名单展开一致（当前 30） |
| 安装计划（bash，不写盘） | `bash scripts/install.sh --profile desktop --dry-run`（本机 profile 是 desktop；自建的换名） | 只打印计划、不写任何文件；`--profile` 必填，缺失或不存在时报错列出实存 profile 并退出 2 |
| 安装计划（PowerShell，不写盘） | `pwsh -File scripts/install.ps1 -Profile desktop -DryRun` | 只打印计划、不写任何文件；`-Profile` 必填，写成 `--dry-run` 会被当作未知参数拒绝并退出 2 |

```bash
npm test
npm run check
```

自检是离线设计（不起 SSH、不起 DSH 进程）。仓库内没有按用例过滤的入口：脚本用自带的 `test()` harness，要单验一条就在系统临时目录复制一份改。需要真跑 exec/sftp 语义时，用 `node_modules/ssh2` 的 `Server` 在 127.0.0.1 起本地假主机（临时生成 host key、密码认证），不要连真实主机。UI 挂载校验器在 `dsh-plugin-creator` 技能的 `scripts/check-mounts.mjs`，不在本仓库；本插件不使用官方 slot key，那个校验器对本仓库恒为 0 命中，不能当作挂载正确的证据。

## 架构边界

```text
lib/index.js    宿主入口：SSHManager 注册、/dsh-ssh-tunnel/api 与 /dsh-ssh-tunnel/vendor 路由、授权与路径守卫
   -> lib/session.js        会话注册表：连接、keepalive、掉线墓碑、自动重连、exec/sftp 执行
      -> lib/shared/*.js    纯函数：args / path / host-key / host-summary / http-trust / persist /
                            session-auth / session-policy / shell-buffer / vendor
lib/client.js   浏览器 bundle（window.__ModuleLoader__.load，require 只认模块表里的名字）
   -> POST /dsh-ssh-tunnel/api/<method>   当前 32 个 method 分支
```

- `projectPathKey` 是唯一的租户边界，来源有两条且必须一起看：模型侧从宿主会话头取（服务端权威），侧栏侧来自请求体 `body.projectPathKey || body.cwd`（客户端自报）。
- 宿主与侧栏之间只有这一条 HTTP 通道；工具分派与 API 分派共用 `lib/shared/` 的纯函数，但 `lib/client.js` 不 import 它们——它是自包含产物。
- 允许：`lib/index.js` 与 `lib/session.js` 依赖 `lib/shared/`。禁止：`lib/shared/` 反向依赖 `session.js`/`index.js`。原因：shared 是两侧共用且可在无 ssh2、无宿主环境下被自检直接导入的层，反向依赖会让自检跑不起来。

## 修改契约

- 改 `SSHManager` 的动作或参数：四处同步——`parameters.properties`、`execute` 分派、两份 README 的动作表、CHANGELOG 中英各一段。口径核对：`lib/index.js` 里 `action === '…'` 的 distinct 数与两份 README 动作表里出现的动作名集合相等（当前 17）。
- 改 `handleApi` 的 method：客户端 `api("...")` 调用点与之对应（当前 32 个分支，UI 实际调 28 个）。`health`、`migrateDraft`、`sftpReadText`、`sftpWriteText` 属宿主与自检专用，删它们等于删自检。
- 改游标协议或 API 错误语义：游标协议四处同步（见风险区）；API 错误 body 带结构化 `code`（`bad_request`/`forbidden`/`not_found`/`conflict`/`gone`/`payload_too_large` 对应 400/403/404/409/410/413），客户端的会话终态判定只认 code（`not_found`/`gone`/`forbidden`），不认错误文案——别回退成文案匹配。
- 改 `lib/client.js`：这个文件是入库产物且没有构建步骤（`dsh plugin add` 只安装不构建），仓库里没有可改的 `src/`；直接改它，改完 `node --check lib/client.js`。
- 改界面文案：`lib/client.js` 内联的 `zh`/`en` 两份词典必须键集完全对称（当前各 87 键），新增键两侧同时加且确实被 `t("key")` 引用；`locale/zh.json` 与 `locale/en.json` 只放插件列表的 `meta.title`/`meta.description`，两样都要同时进 `exports` 与 `files`。
- 改本地路径处理：`lib/shared/path.js` 是词法加 realpath 的双层校验，含分隔符统一与 Windows 大小写折叠。新增用例至少覆盖：盘符根、`..`、符号链接指向根外、以及拿不到显式 root 的情形。
- 改兼容范围（`engines.dsh` 与 `@deepseek-ai/dsh-*` 的 peer）：每个预发布元组单列一段，形如 `">=0.1.7-rc.2 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0"`，上界必须带 `-0`。原因：DSH 的兼容闸带 `includePrerelease`，而 npm/pnpm 解析 peer 不带——单段大区间对预发布判 `false`（`satisfies("0.2.0-rc.2", ">=0.1.7-rc.2 <0.3.0-0")` 实测为 false）。
- 发版：`package.json` 的 `version`、CHANGELOG 顶部条目、附注 tag（`git tag -a`）、npm 发布、两份 README 的 `@x.y.z` 安装示例，五处必须同版本收口。打 tag、`git push` 与 `npm publish` 由用户执行，Agent 只准备改动并列出待执行命令。文档改动留在 HEAD 而未 bump 时，CHANGELOG 补 `## [Unreleased]` 段。
- 改依赖：`@xterm/*` 两件保持精确版本（README 对它们有「钉死」表述）；`ssh2` 是 `^` 浮动。`package-lock.json` 被 `.gitignore` 排除，不要提交锁文件来「提高复现性」。
- 改安装链逻辑：bash 与 PowerShell 两侧共用的逻辑只放 `scripts/lib/*.cjs`（`ws-exclude`/`bundle-check`/`strip-mount`）单源，两侧经 node 调用；别在脚本里重新内联 JS。这三个文件在 `files` 白名单里，改名或删除会同时打断两条安装链，改动必须两侧伪 home 夹具复验。
- 本节与下文凡「当前 N 个」都是 2026-10-09 的快照数，改动后按这些命令现数：动作数 `grep -o "action === '[^']*'" lib/index.js | sort -u | wc -l`（别用 `[a-z_]*` 形参——本机 git-bash 的 grep 实测会截断匹配，只回 4 个）、method 分支数 `grep -cE "method === '" lib/index.js`（再减去 `serveVendor` 里的那一处）、UI 调用点 `grep -o 'api("[A-Za-z]*"' lib/client.js | sort -u | wc -l`、词典键数在 `lib/client.js` 的 `zh`/`en` 两个字面量里数键名冒号、包内文件数 `npm pack --dry-run` 的末行。

## 禁止操作

- 禁止新增第三方 CDN 拉取前端资产。原因：扩大 XSS 与 CSP 面。要加资产必须同时进 `lib/shared/vendor.js` 的 `VENDOR_ASSETS` 白名单和 `lib/client.js` 的引用名，两处逐字一致。
- 禁止用 `String(a || b)` 承担必填校验。原因：缺参数会变成字面量文件名 `undefined` 写到本地盘或远端目录（1.0.1 实测 12 处——按含路径参数的 `String(a || b)` 调用计、落在 11 行——能把用户文件改名成 `undefined` 并回 `ok: true`）。1.0.2 起统一走 `lib/shared/args.js` 的 `requireString`/`stringOrDefault`（缺了就 throw），别手写 `||` 兜底。
- 禁止把 `chmod 0600`/`0700` 当成 Windows 上的凭据保护。原因：NTFS 下实测 ACL 全量继承父目录，`chmodSync` 不改 DACL。写进文档时必须加平台限定。
- 禁止让路径守卫保留 `/workspace` 兜底还对外称「不假设挂载点」。原因：Windows 上它解析成宿主进程当前盘的 `\workspace`，该目录存在时守卫作用域就从当前项目放大到整棵 workspace 树。root 取不到就拒绝，不要兜底。
- 禁止为了「验证安装」而运行 `dsh plugin ...`、改 `~/.dsh/profiles/**` 或改写 profile 的 `pnpm-workspace.yaml`/`cordis.patch.yml`。原因：桌面版 profile 由 App 独占管理，运行中的服务会锁依赖。要验证就把 `DSH_HOME` 与 `DSH_CMD` 指向系统临时目录里的伪 home 与桩，跑完再核对真实 profile 的哈希未变；停启 DSH 由用户执行。
- 禁止读取或转述 `secrets.json` 的内容，也禁止把它任何片段写进仓库文件、测试夹具或提交信息。原因：那是明文凭据文件，数据目录本就不该进仓库。
- 禁止用错误文案的正则白名单判断会话终态。原因：白名单外的错误既不显示也不停止轮询，状态栏会谎报 connected；终态要用宿主返回的状态字段。
- 禁止在 README、CHANGELOG、注释或测试里写真实主机名、内网地址、个人绝对路径或 emoji。原因：这是对外发布的包，仓库里任何一行都会被 `npm pack` 带进产物并被第三方读到。

## 验收标准

改动完成等于下列全部通过：

1. `npm test`，且末行是 `all passed`。
2. `npm run check`。
3. 改过界面或样式时：`node --check lib/client.js`。
4. 中英两份 README 与 CHANGELOG 同步（改一版必须两版都有）。
5. 改过界面：刷新浏览器后右侧栏出现「SSH 隧道」入口——客户端产物在页面加载时取，只重启宿主不生效。这一条需要用户在真实 DSH 里目视确认，Agent 无法自证时必须在交付说明里写明「界面未验证」。
6. 输出里出现 `skip ... symlink unavailable` 时不算全绿：那是符号链接用例没跑（Windows 未开开发者模式），必须在交付说明里明写。

## 已知风险区

| 路径 | 风险（有实测的标注实测） | 改动前与改动后必做 |
|---|---|---|
| `lib/session.js` 的 exec 结算 | 结算字段是 `exitKnown`/`code`/`signal`/`connectionDropped`/`truncated`；1.0.1 的 `code ?? 0` 曾把信号死与连接中途销毁报成 `exit: 0` 且 `isError: false`（本地 ssh2 Server 实测） | 别把结算改回单一 code 语义；正常退出、127、信号死、连接切断四类 ssh2 Server 夹具已在自检里，动结算必跑且别删用例 |
| `lib/session.js` 的输出缓冲与 `shellRead` 游标 | 512 KiB 保留缓冲 + 每次交付最多 256 KiB（`SHELL_READ_CHUNK_MAX`）；游标语义是宿主回 `since`（本次交付到的 seq）、`baseSeq`（最旧保留）、`dropped`（有缺口）、`chunkTruncated`，客户端 `dropped` 时从 `baseSeq-1` 全量重取并清屏（旧版客户端用 `since = length`，饱和后交付率实测 0.7%–16%） | 动游标协议要四处同步：`session.js` 的 `chunkFrom`、`shell-buffer.js`、`client.js` 的消费与重取处、README 的上限声明 |
| `lib/session.js` 的输出解码与 `max_bytes` | 1.0.2 起 Buffer 聚合后一次解码、按字节截断并回 `truncated`；`max_bytes` 由 `clampMaxBytes` 钳制在 1 KiB–1 MiB（exec 默认 256 KiB、SFTP 读默认 512 KiB；旧版无钳制实测可要到 6 MiB，且按块拼接把跨块 UTF-8 打成替换符） | 别回退成按块字符串拼接；改上限要同步 `session-policy.js` 的 `MAX_BYTES_*` 常量与 README 声明 |
| `scripts/install.sh` 的写入步骤 | 1.0.1 的 bash 单引号内联 JS 因 `"\\n"` 与 `\\s` 转义不生效而追加出非法 YAML、幂等分支是死代码、假报成功退 0；现已抽成 `scripts/lib/*.cjs`，写后回读断言、失败回滚并非零退出 | 伪 home 夹具跑完必须回读并用 YAML 解析器判定，连跑两次验幂等；改逻辑只改 .cjs 单源 |
| `scripts/install.ps1` | `-Profile` 必填（缺失或不存在时列出实存 profile）、未知参数拒绝（`--dry-run` 实测报错退 2，不再静默吞掉真装）、内联 JS 已落 `scripts/lib/*.cjs` 并逐步查 `$LASTEXITCODE`（5.1 的引号剥离问题随之消除）；PATH 无 `dsh` 时的 npx 兜底先打印命令并要求确认 | 改动必须在 `powershell`（5.1）与 `pwsh`（7）两侧各跑一遍伪 home 夹具，并检查 `$LASTEXITCODE` 传导 |
| `package.json` 的 `dsh` 段与 `exports`/`files` | 挂载校验器不读 `package.json`，写错是静默的（1.0.2 已补 `dsh.client.inject` 的 `dsh-better-sidebar` 到达顺序边、`exports` 的 `./cordis.patch.yml`、`files` 的 `scripts/lib/*.cjs`） | 改完 `npm pack --dry-run` 对清单，并与宿主实装目录逐文件比 |
| 数据目录 | `$DSH_HOME/ssh-tunnel/` 下 `hosts`/`secrets`/`grants`/`known_hosts` 四个 JSON，原子写用固定 `.tmp` 名 | 手改前先备份；测试一律用临时 `DSH_HOME`；坏 JSON 是抛错而非当空库，别改成静默 |
| `pendingPrompts` | 1.0.2 起 TTL 5 分钟、总量上限 50、`listPrompts`/`answerPrompt` 收 `projectPathKey` 且 `answerPrompt` 校验主机仍在授权内；残留缺口：删主机不主动清它的 pendingPrompts，靠 TTL 兜底 | 改 TTL/上限常量要同步自检用例；动生命周期前先定删主机时的清理策略 |

## 出错怎么办

| 症状（报错里的可检索片段） | 处理 |
|---|---|
| `dsh: skipping profile bundle "dsh-ssh-tunnel"` | 先核 `dsh --version` 与 `engines.dsh`/peer 区间是否覆盖该预发布元组，预发布要单列段 |
| `Failed to parse pnpm-workspace.yaml` 或 `can not read a block mapping entry` | 1.0.1 的 install.sh 曾追加出字面 `\n` 垃圾行；现已写后回读断言、失败回滚。遇到历史遗留的坏行仍要手工删掉那一行，别再重复跑同一脚本 |
| `找不到 profile 目录` / `Profile dir missing` | 本机 profile 不是 `web`；文档的 CLI 形态针对自建 web/headless profile，桌面版 profile 由 App 管理 |
| `dsh: installation rejected: ... incompatible with dsh` | 版本闸拒绝，按宿主给的 allow-version 豁免流程走，别改区间来绕过 |
| 装好了但侧栏没有入口 | 刷新浏览器页面；开 DevTools Console 看注册期异常（宿主侧一声不吭） |
| `未找到 dsh（可用 DSH_CMD 指定）` | git-bash 不解析 `.cmd`，在那里要写 `dsh.cmd`，或用 `DSH_CMD` 指到内嵌 CLI |
| `npm test` 里 9 个用例失败且都是路径类 | 历史问题：夹具硬编码 POSIX 路径；现版已改走 `normalizeProjectKey` 与一次性根，若复现先看 `DSH_SSH_TUNNEL_WORKSPACE_ROOT` |

## 维护

本文件与触发它的代码改动进同一个 PR。改动验收命令、模块边界、风险区、依赖管理方式时必须同步本文件。发现本文件与代码不符时，先改本文件，再继续改代码。
