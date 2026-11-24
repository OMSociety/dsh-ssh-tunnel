# AGENTS.md — dsh-ssh-tunnel Agent 宪法

适用范围：本仓库全部目录。
最后更新：2026-11-25

## 项目概览

- 一句话定位：DeepSeek Harness（DSH）的社区插件——SSH 主机库 + 按项目授权 + 侧栏终端与双栏 SFTP，并通过 `SSHManager` 工具把远端能力暴露给模型。
- 运行时：Node >= 20、纯 JavaScript、ESM（`"type": "module"`）。浏览器半侧是自包含 bundle，宿主半侧无构建步骤。
- 直接依赖：`ssh2`（`^1.17.0`，浮动）、`@xterm/xterm@5.5.0`、`@xterm/addon-fit@0.11.0`（精确钉版）。
- 宿主契约：宿主包由 DSH 运行时提供。
- CI 配置见 [.github/workflows/ci.yml](./.github/workflows/ci.yml)：在 Ubuntu 上运行完整自检与打包正反例。
- 文档索引：[README.md](./README.md) 与 [README_en.md](./README_en.md)（逐节对应）、[CHANGELOG.md](./CHANGELOG.md)（中英并列段，Keep a Changelog + SemVer）、[package.json](./package.json)。

## 常用命令

| 目的 | 命令 | 什么算通过 |
|---|---|---|
| 全部自检 | `npm test` | 退出码 0、0 skipped、0 failed、末行 `all passed` |
| 重出 README 预览图 | `npm run build:preview` | 需本机 Chrome（`CHROME_PATH` 可指定）；输出 `docs/panel-sidebar.png`、`docs/panel-sftp.png`、`docs/preview/panel.html` |
| 语法检查加自检 | `npm run check` | 宿主与客户端入口均通过语法检查，随后完整自检通过 |
| 浏览器产物语法 | `node --check lib/client.js` | 无输出、退出码 0 |
| 发包成员及缺件回归 | `npm run test:pack` | 必需成员在 npm 打包清单中；故意缺件的清单均被拒绝 |
| 禁止监听环境下的子集 | `node scripts/smoke-test.mjs --no-listen` | 只执行无需回环监听的用例；交付时注明跳过项 |

```bash
npm test
npm run check
```

自检使用临时数据目录，不依赖公网或运行中的 DSH。完整自检在 `127.0.0.1` 启动临时 ssh2 Server；模拟正常退出、非零退出、信号终止和连接切断时只连本地夹具。改过挂载时检查 `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title`，两席都按 `TAB_ID` 命名。

## 架构边界

```text
lib/index.js    宿主入口：SSHManager 注册、/dsh-ssh-tunnel/api 与 /dsh-ssh-tunnel/vendor 路由、授权与路径守卫
   -> lib/session.js        会话注册表：连接、keepalive、掉线墓碑、自动重连、exec/sftp 执行
      -> lib/shared/*.js    纯函数：args / path / host-key / host-summary / http-trust / persist /
                            session-auth / session-policy / shell-buffer / vendor
lib/client.js   浏览器 bundle（window.__ModuleLoader__.load，require 只认模块表里的名字）
   -> POST /dsh-ssh-tunnel/api/<method>   当前 32 个 method 分支
```

- 模型工具从宿主会话头取得项目工作区。侧栏经 `getProjectContext` 解析后，owner 在后续请求中指定项目；不得把该管理面当作不可信调用方的权威项目绑定。
- API 与 vendor 经宿主 `connection` 准入。0.2.3-alpha.2 检查 WebServer 传入的 Peer 的 `principal.kind`。0.2.2-rc.5 专属适配：先执行宿主请求检查；除 health 与静态资源外，必须验证 `admit(req)` 的 peer 是 `connection.browserPeer` 且为 owner。改此处须分别覆盖无身份、非 owner、owner，并覆盖 rc.5 的非浏览器 API peer。
- 宿主与侧栏之间只有这一条 HTTP 通道；工具分派与 API 分派共用 `lib/shared/` 的纯函数，但 `lib/client.js` 不 import 它们——它是自包含产物。
- 允许：`lib/index.js` 与 `lib/session.js` 依赖 `lib/shared/`。禁止：`lib/shared/` 反向依赖 `session.js`/`index.js`。原因：shared 是两侧共用且可在无 ssh2、无宿主环境下被自检直接导入的层，反向依赖会让自检跑不起来。

## 待办（有触发条件）

- **0.2.3 首个 RC 发布时**：清理 0.2.2 专属 HTTP 适配与相应用例，保留 owner 准入测试；同步两份 README 和 CHANGELOG。

## 修改契约

- 改 `SSHManager` 的动作或参数：四处同步——`parameters.properties`、`execute` 分派、两份 README 的动作表、CHANGELOG 中英各一段。口径核对：`lib/index.js` 里 `action === '…'` 的 distinct 数与两份 README 动作表里出现的动作名集合相等（当前 17）。
- 改 `handleApi` 的 method：客户端 `api("...")` 调用点与之对应（当前 32 个分支，UI 实际调 28 个）。`health`、`migrateDraft`、`sftpReadText`、`sftpWriteText` 属宿主与自检专用，删它们等于删自检。
- 改游标协议或 API 错误语义：游标协议四处同步（见风险区）；API 错误 body 带结构化 `code`（`bad_request`/`forbidden`/`not_found`/`conflict`/`gone`/`payload_too_large` 对应 400/403/404/409/410/413），客户端的会话终态判定只认 code（`not_found`/`gone`/`forbidden`），不认错误文案——别回退成文案匹配。
- 改 `lib/client.js`：这个文件是入库产物且没有构建步骤（`dsh plugin add` 只安装不构建），仓库里没有可改的 `src/`；直接改它，改完 `node --check lib/client.js`。挂载侧两层依赖别混：bundle 导出的 `inject = ["locale", "slots"]` 是**服务依赖**（`slots` 由核心提供）；右侧栏服务走延迟注入 `ctx.inject(["sidebarRightTabs", "sidebarRight"], cb)`，服务缺席时静默不挂（不 throw、不拖垮插件）。官方右侧栏三段落齐才出标签页：`tabs.register({ id, kind, priority: "extension", title, guide })`、`ctx.slots.register({ name: "sidebar.right.pane.tab", key: id }, Body)`、`ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: id }, Title)`；Body 的 props 由框架注入（`sessionId` 平铺 + `useTabInfo()` 取 `tab.visible`），`guide` 条目要有 provider 内唯一的 `id`。异步回调是 `ctx.inject` 的常态，别写同步回头检查。
- 改 `lib/client.js` 的界面或样式后：跑 `npm run build:preview` 并提交 `docs/panel-*.png` 与 `docs/preview/panel.html`；预览由真实 `lib/client.js` 加 `docs/preview/fixture.json`（虚构数据，不得写真实主机名、内网地址、个人路径）渲染，终端页因依赖 xterm 不入图。`esbuild`、`playwright-core`、`react`、`react-dom` 仅为 devDependencies，不进 `files` 白名单。
- 改界面文案：`lib/client.js` 内联的 `zh`/`en` 两份词典必须键集完全对称（当前各 90 键），新增键两侧同时加且确实被 `t("key")` 引用；`locale/zh.json` 与 `locale/en.json` 只放插件列表的 `meta.title`/`meta.description`，两样都要同时进 `exports` 与 `files`。
- 改本地路径处理：`lib/shared/path.js` 是词法加 realpath 的双层校验，含分隔符统一与 Windows 大小写折叠。新增用例至少覆盖：盘符根、`..`、符号链接指向根外、以及拿不到显式 root 的情形。
- 发版：`package.json` 的 `version`、CHANGELOG 顶部条目、附注 tag（`git tag -a`）、npm 发布、两份 README 的 `@x.y.z` 安装示例，五处必须同版本收口。文档改动留在 HEAD 而未 bump 时，CHANGELOG 补 `## [Unreleased]` 段。
- 改依赖：`@xterm/*` 两件保持精确版本（README 对它们有「钉死」表述）；`ssh2` 是 `^` 浮动。`package-lock.json` 被 `.gitignore` 排除，不要提交锁文件来「提高复现性」。
- 安装由 DSH 插件管理入口负责。发布清单须包含实际 main、client、图标、patch 和两份 locale；改 `files` 或 `exports` 后跑 `npm run test:pack`。

## 禁止操作

- 禁止新增第三方 CDN 拉取前端资产。原因：扩大 XSS 与 CSP 面。要加资产必须同时进 `lib/shared/vendor.js` 的 `VENDOR_ASSETS` 白名单和 `lib/client.js` 的引用名，两处逐字一致。
- 禁止用 `String(a || b)` 承担必填校验。原因：缺参数会变成字面量文件名 `undefined` 写到本地盘或远端目录（1.0.1 实测 12 处——按含路径参数的 `String(a || b)` 调用计、落在 11 行——能把用户文件改名成 `undefined` 并回 `ok: true`）。1.0.2 起统一走 `lib/shared/args.js` 的 `requireString`/`stringOrDefault`（缺了就 throw），别手写 `||` 兜底。
- 禁止把 `chmod 0600`/`0700` 当成 Windows 上的凭据保护。原因：NTFS 下实测 ACL 全量继承父目录，`chmodSync` 不改 DACL。写进文档时必须加平台限定。
- 禁止让路径守卫保留 `/workspace` 兜底还对外称「不假设挂载点」。原因：Windows 上它解析成宿主进程当前盘的 `\workspace`，该目录存在时守卫作用域就从当前项目放大到整棵 workspace 树。root 取不到就拒绝，不要兜底。
- 验证安装时使用独立临时 profile。真实 profile 承载运行中的宿主与用户数据；生产宿主的停启由用户执行。
- 禁止读取或转述 `secrets.json` 的内容，也禁止把它任何片段写进仓库文件、测试夹具或提交信息。原因：那是明文凭据文件，数据目录本就不该进仓库。
- 禁止用错误文案的正则白名单判断会话终态。原因：白名单外的错误既不显示也不停止轮询，状态栏会谎报 connected；终态要用宿主返回的状态字段。
- 禁止在 README、CHANGELOG、注释或测试里写真实主机名、内网地址、个人绝对路径或 emoji。原因：这是对外发布的包，仓库里任何一行都会被 `npm pack` 带进产物并被第三方读到。

## 验收标准

改动完成等于下列全部通过：

1. `npm test`，且末行是 `all passed`。
2. `npm run check`。
3. `npm run test:pack`：实际包清单通过，故意缺件的对照必须失败。
4. 中英两份 README 与 CHANGELOG 同步（改一版必须两版都有）。
5. 改过界面：刷新浏览器后，右侧栏标签条的「+」引导页里出现「SSH 隧道」入口，点开即挂载面板——官方右侧栏不自动常驻，布局按会话持久化，每个新会话第一次要各开一次。客户端产物在页面加载时取，只重启宿主不生效。这一条需要用户在真实 DSH 里目视确认，Agent 无法自证时必须在交付说明里写明「界面未验证」。
6. 输出里出现 `skip ... symlink unavailable` 时不算全绿：那是符号链接用例没跑（Windows 未开开发者模式），必须在交付说明里明写。

## 已知风险区

| 路径 | 风险（有实测的标注实测） | 改动前与改动后必做 |
|---|---|---|
| exec 结算 | 模型拿到 `text`/`isError`；只有已知退出码 0 成功 | 用回环 SSH 夹具分别验证 0、非零、信号和断线 |
| PTY 输出与 `shellRead` 游标 | 按 UTF-8 字节计最多保留 512 KiB，每次交付最多 256 KiB | 验证跨事件拆字与大块分页，逐页拼接不得丢失或重复；同步客户端与 README |
| `max_bytes` | exec 双流共享一次调用预算；SFTP 文本读取按前缀截断 | 修改时验证双流和跨限分包；同步两份 README 的默认值与上限 |
| 传输与撤权 | 下载使用同目录临时文件，通过结果授权门后提交；上传可能留下远端部分内容 | 失败、超时、取消与撤权均应保留已有下载目标；检查临时文件回收 |
| 包清单 | 宿主按 `dsh.bundle.patch`、入口与导出路径解析 | 核对 `npm run test:pack` 的正反例 |
| 数据目录 | `$DSH_HOME/ssh-tunnel/` 下 `hosts`/`secrets`/`grants`/`known_hosts` 四个 JSON，原子写用固定 `.tmp` 名 | 手改前先备份；测试一律用临时 `DSH_HOME`；坏 JSON 是抛错而非当空库，别改成静默 |
| 主机指纹提示 | 信任或驳回均须核对项目与有效授权；信任前核对端点 | 改生命周期时分别验证有效、撤权、错项目与端点变化 |

## 出错怎么办

| 症状（报错里的可检索片段） | 处理 |
|---|---|
| `dsh: skipping profile bundle "dsh-ssh-tunnel"` | 按日志给出的原因排查（缺 `dsh.bundle.patch`、客户端包缺失、加载期抛错） |
| `dsh: installation rejected: ... incompatible with dsh` | 版本闸拒绝，按宿主给的 allow-version 豁免流程走，别改区间来绕过 |
| 装好了但侧栏没有入口 | 刷新浏览器页面；官方右侧栏的标签页不自动常驻，入口在标签条「+」的引导页里；开 DevTools Console 看注册期异常（宿主侧一声不吭） |

## 维护

本文件与触发它的代码改动进同一个 PR。改动验收命令、模块边界、风险区、依赖管理方式时必须同步本文件。发现本文件与代码不符时，先改本文件，再继续改代码。
