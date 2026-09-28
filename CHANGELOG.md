# Changelog

本项目的更改记录在此文件。

All notable changes to this project are documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-28

### 变更

- **声明 DSH 兼容性元数据。** `package.json` 现携带 `dsh.manifestVersion: 1`、`engines.dsh: ">=0.1.2-rc.1 <0.2.0"`（作者声明的兼容 DSH 范围，与 `engines.node` 并列；后者随当前生态主流提到 `>=20`），以及覆盖同一范围的 `@deepseek-ai/dsh-client-locale` peer。自 DSH 0.1.7-rc.1 起，插件闸门会把 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的 peer 范围与运行时版本比对（未声明 DSH peer 则不施加约束）——此前本插件没有任何 DSH peer，在任何宿主上都被静默放行。`dsh.manifestVersion` 与 `engines.dsh` 按清单规范仍只是声明字段。

### 修复

- **`scripts/smoke-test.mjs` 现在会打进安装包。** `npm test` / `npm run check` 都会运行它，但 `files` 白名单把它漏掉了，于是任何从打包产物安装的副本都以 `MODULE_NOT_FOUND` 失败，声明的自检根本跑不起来。`scripts/portal-probe.mjs` 与 `scripts/sync-to-dsh.sh` 一并补齐，与 `dsh-git-forge` 采用同一打包策略（`scripts/` 下的脚本全部进包）。
- **本地路径守卫在工作区不是 `/workspace` 的宿主上恢复正常。** `isPathInsideRoots` 用 `root + '/'` 前缀对比平台原生形态的键（分隔符与大小写都敏感），于是 Windows 上连 `C:\ws\child` 在 `C:\ws` 内都被判为外部；`constrainToWorkspace` 还把 `/workspace` 写死，凡由它把守的地方（SFTP 的 `local_path` 与本地文件 API）都会拒绝真实工作区路径。现在包含判断在「统一分隔符、Win32 折叠大小写」的比较形态上进行，且守卫以宿主已知的项目工作区为根，于是 SFTP 上传/下载与本地文件 API（列目录、建目录、删除、重命名）都能接受真实工作区路径，相对本地路径也以该根为基准解析；`DSH_SSH_TUNNEL_WORKSPACE_ROOT` 作为运维覆盖保留，`/workspace` 仅作最后兜底。
- **自检用例可移植且自洽。** 夹具硬编码 POSIX 路径——装好依赖的 Windows 检出上固定挂 9 个用例，覆盖路径包含、会话与项目的匹配（夹具键是裸字符串而生产侧会过 `normalizeProjectKey`）、以及符号链接逃逸用例（其夹具目录根本不存在）。现在套件经 `normalizeProjectKey` 推导期望值、把路径守卫指向一次性根目录，并在无法创建符号链接的环境里优雅跳过该用例。

### Changed

- **Declare DSH compatibility metadata.** `package.json` now carries `dsh.manifestVersion: 1`, `engines.dsh: ">=0.1.2-rc.1 <0.2.0"` (the author-declared compatible DSH range, sitting beside `engines.node`, which is raised to `>=20` like current ecosystem plugins), and a `@deepseek-ai/dsh-client-locale` peer over the same range. Since DSH 0.1.7-rc.1 the plugin gate compares `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer ranges against the running runtime (missing peers impose no constraint) — without a DSH peer this plugin passed every host silently. `dsh.manifestVersion` and `engines.dsh` stay declarative, as the manifest spec defines them.

### Fixed

- **`scripts/smoke-test.mjs` now ships in the packed install.** `npm test` / `npm run check` run it, but the `files` allowlist omitted it, so any install from the packed artifact failed with `MODULE_NOT_FOUND` and the declared self-check could not run at all. `scripts/portal-probe.mjs` and `scripts/sync-to-dsh.sh` are shipped alongside it, following the same packaging strategy as `dsh-git-forge` (every script under `scripts/` goes into the tarball).
- **The local-path guard now works on hosts whose workspace is not `/workspace`.** `isPathInsideRoots` compared a `root + '/'` prefix against platform-native keys (separator- and case-sensitive), so on Windows even `C:\ws\child` inside `C:\ws` was judged outside; `constrainToWorkspace` additionally hard-coded `/workspace`, so real workspace paths were rejected wherever it guards (SFTP `local_path` handling and the local file APIs). Containment is now judged on a separator-unified, Win32-case-folded comparison form, and the guard takes the project workspace the host knows as its root, so SFTP upload/download and the local file APIs (list, mkdir, delete, rename) accept real workspace paths, with relative local paths resolving against that root; `DSH_SSH_TUNNEL_WORKSPACE_ROOT` remains an operator override and `/workspace` the last-resort fallback.
- **Smoke tests are platform-portable and hermetic.** The fixtures hard-coded POSIX paths — 9 tests fail on a Windows checkout with dependencies installed, covering path containment, session-to-project matching (raw fixture keys vs `normalizeProjectKey` on the production side), and the symlink escape case (its fixture directory did not exist). The suite now derives expectations through `normalizeProjectKey`, runs the path guard against a throwaway root, and skips the symlink case gracefully where symlink creation is unavailable.

## [0.4.6] - 2026-09-15

### 修复

- **终端不再报「无法加载 xterm」。** `require("@xterm/xterm")` 在 DSH 浏览器模块表里永远解析不到（只回答平台种子与已注册插件 row），而 0.4.4 移除 jsDelivr 回退后没有可用路径。插件现把 `@xterm/xterm@5.5.0` 与 `@xterm/addon-fit@0.11.0` 钉为运行时依赖，并将其 UMD/CSS 从同源白名单路由（`/dsh-ssh-tunnel/vendor/*`）下发；客户端用普通 `<script>`/`<link>` 标签加载，原来的模块表 require 路径仅作降级保留。永不访问第三方 CDN。

### 安全

- **Vendor 路由白名单化。** `/dsh-ssh-tunnel/vendor/*` 只解析三个固定资源名；其它任何请求（含路径穿越）一律 404，且不会触碰文件系统。

### Fixed

- **Terminal no longer fails with "无法加载 xterm".** `require("@xterm/xterm")` is unresolvable in the DSH browser module table (only platform seeds and registered plugin rows answer), and the 0.4.4 removal of the jsDelivr fallback left no working path. The plugin now pins `@xterm/xterm@5.5.0` + `@xterm/addon-fit@0.11.0` as runtime dependencies and serves their UMD/CSS from a same-origin allowlisted route (`/dsh-ssh-tunnel/vendor/*`); the client loads them with plain `<script>`/`<link>` tags, with the old module-table path kept only as a fallback. No third-party CDN is ever fetched.

### Security

- **Vendor route is allowlisted.** `/dsh-ssh-tunnel/vendor/*` resolves exactly three asset names; anything else (including path traversal) is a 404 sent without touching the filesystem path.

## [0.4.5] - 2026-09-09

### 移除

- **不再提供键盘交互登录。** 只能在堡垒机网页/客户端里用的主机无法绑定到本插件。侧栏认证方式只保留密码与私钥。已保存的 `keyboardInteractive` 主机记录仍留在磁盘，但连接、存成 KBI、重连和 `SSHManager` 都会失败，并提示改为密码或私钥（`credential=unsupported`）。

### Removed

- **Keyboard-interactive auth is no longer offered.** Bastion/MFA hosts that only work inside a vendor web/client cannot be bound here. The sidebar auth dropdown is password or private key only. Existing `keyboardInteractive` host records are kept on disk but Connect, save-as-KBI, reconnect, and `SSHManager` all fail with a message to switch the host to password or private key (`credential=unsupported`).

## [0.4.4] - 2026-09-09

### 安全

- **本地路径在解析符号链接后仍必须落在 `/workspace`。** 上传/下载/列举/建目录/删除/重命名会同时拒绝词法逃逸和指向工作区外的符号链接。删除符号链接只 unlink 链接本身，不跟随目标递归。
- **HTTP 会话 API 必须带 `projectPathKey`。** 省略该字段不再跳过项目检查。跨站 `Origin` 会被拒绝；`0.0.0.0` 不再当作回环。
- **损坏的 `secrets.json` 失败关闭。** 解析失败不再当成空库被下一次 `saveHost` 写回。JSON 采用临时文件 + rename 原子写入。
- **旧稿迁移幂等。** 标记文件 + host+port+username 去重，避免每次启动复制主机。
- **结果门禁覆盖写操作与 HTTP。** 写文件/上传/mkdir/重命名/删除/`send_input` 以及对应侧栏 API 在回报成功前复检授权。缺少授权谓词会抛错，不再静默放行。
- **拒绝键盘交互空应答。** 侧栏在没有应答 UI 时不会拨号；KBI 意外断开立即墓碑，不再空转重连。
- **xterm 仅使用打包模块。** 去掉 jsDelivr CSS/JS 回退。

### 修复

- 重连与 `close` 竞态时会 `end()` 新客户端，不再挂到已删除记录上。
- `openSftp` 与 `ensureShell` 遵守与 exec 相同的超时/取消合同。

### Security

- **Local paths stay under `/workspace` after symlink resolution.** Upload/download/list/mkdir/delete/rename now reject lexical escapes *and* outbound symlinks (for example `ln -s $DSH_HOME /workspace/.escape`). Deleting a symlink unlinks the link only; it does not walk the target.
- **HTTP session APIs require `projectPathKey`.** Omitting it no longer skips the project check on PTY/SFTP/`disconnect`. Cross-origin `Origin` headers are rejected; `0.0.0.0` is not treated as loopback.
- **Corrupt `secrets.json` fails closed.** Parse errors no longer become an empty store that the next `saveHost` would write back. JSON files are written atomically (`tmp` + rename).
- **Draft migration is idempotent.** A marker file plus host+port+username matching prevent duplicate hosts on every restart.
- **Result gates cover writes and HTTP.** `sftp_write_text` / upload / mkdir / rename / delete / `send_input` and the matching sidebar APIs re-check grants before reporting success. A missing authorization predicate throws instead of no-op.
- **keyboard-interactive empty answers are refused.** The sidebar will not dial KBI with no prompt UI; unexpected KBI drops tombstone immediately instead of a 25s reconnect loop.
- **xterm is bundled-only.** The previous jsDelivr CSS/JS fallback is removed.

### Fixed

- Reconnect that wins a race against `close` now `end()`s the new client instead of attaching it to a deleted record.
- `openSftp` and `ensureShell` honor the same timeout/abort contract as exec.

## [0.4.3] - 2026-09-08

### 安全

- **在飞操作的结果门禁**。若 `SSHManager` 操作（exec / read_session / sftp_list / sftp_stat / sftp_read_text / sftp_download）执行期间该主机的项目授权被撤销，结果在交付前会复检：来自已撤销主机的输出被丢弃，调用以 `not authorized` 失败。
- **撤销授权后 `sftp_download` 不留任何本地文件**。若传输期间或之后授权被撤销，已写入的本地文件会被删除（含中途失败的部分写入），并拒绝交付结果。

### 修复

- **终端面板不再静默轮询已死会话**。会话被关闭或主机授权在终端打开期间被撤销时，客户端停止轮询并显示「会话已断开」，而不再每 120ms 无反馈地空转请求。

### Security

- **Result gate for in-flight operations.** If a host's project grant is revoked while an `SSHManager` operation (exec / read_session / sftp_list / sftp_stat / sftp_read_text / sftp_download) is running, the result is re-validated right before delivery: output from the revoked host is discarded and the call fails with `not authorized`.
- **`sftp_download` never leaves data behind after a revocation.** If the grant is revoked during or after a pull, the locally written file is removed (even a partially written one on a mid-transfer failure) and the result is refused.

### Fixed

- **Terminal panel no longer silently polls a dead session.** When a session is closed or its host grant revoked while the terminal is open, the client stops polling and shows `Session disconnected` instead of hammering the server every 120ms with no feedback.

## [0.4.2] - 2026-09-08

### 安全

- **撤销某主机的项目授权后，已建立的隧道会话立即失效。** 此前只有新建连接和 `SSHManager` 工具会复检授权；已打开会话上的 shell / SFTP 操作、以及重连（含自动重连）在撤销授权后仍然可用。现在每次会话使用都会按该会话所属项目的授权重新校验（`requireLiveSession`），重连 / 自动重连拒绝复活已撤销主机，`setGrants` 与删除主机时还会主动关闭受影响的存活会话。

### Security

- **Revoking a host's project grant now takes effect on established tunnel sessions.** Previously only new connections and the `SSHManager` tool re-checked grants; shell / SFTP operations over an already-open session and reconnection (including auto-reconnect) kept working after the grant was revoked. Now every session use re-validates the host against the session's project grants (`requireLiveSession`), reconnect / auto-reconnect refuse to resurrect a revoked host, and `setGrants` / host deletion actively close the affected live sessions.

## [0.4.1] - 2026-09-08

### 修复

- 从 `dsh.client.inject` 移除 **`@deepseek-ai/dsh-client-runtime`**。该包在 DSH 0.1.2 已删除（社区升级卡 `DSH-0.1.2-A1-25`）；保留该幻影依赖可能让 client 装配行在 0.1.2 宿主上 pending。保留 `@deepseek-ai/dsh-client-locale`（提供 `ctx.locale`）。

### Fixed

- Remove **`@deepseek-ai/dsh-client-runtime`** from `dsh.client.inject`. The package was deleted in DSH 0.1.2 (community upgrade card `DSH-0.1.2-A1-25`); keeping the phantom in `inject` could leave the client assembly row pending on 0.1.2 hosts. `@deepseek-ai/dsh-client-locale` is retained (provides `ctx.locale`).

## [0.4.0] - 2026-09-01

### 新增

- 会话断开后保留**墓碑**（重连 + 关闭），无 TTL。意外断开自动重连最多 3 次，同一 `session_id`。
- ssh2 **keepalive** 30s × 3，半开连接会变成真正断开，而不再假活。
- `SSHManager` 支持 `timeout_ms`（1s–300s），覆盖 exec / SFTP / shell。默认：exec 与 SFTP 元数据 30s，SFTP 传输 120s；整次调用天花板 300s。Stop / `exec.signal` 会中止并关掉 channel。

### 变更

- `reuse_or_create` **复活**同主机最老墓碑，不再另开一条活会话。重连失败则保持断线并让这次工具失败。
- 显式已断开的 `session_id` 立即失败（不再卡在 ssh2 上）。重连中的 id 会等到活过来。
- 键盘交互主机不能原地重连，需关闭后在 UI 重新 Connect。

### Added

- Disconnected sessions stay as **tombstones** (Reconnect + Close). No TTL. Unexpected drops auto-reconnect up to 3 times on the same `session_id`.
- ssh2 **keepalive** 30s × 3 misses so half-open TCP becomes a real disconnect instead of a false-alive row.
- `SSHManager` `timeout_ms` (1s–300s) for exec, SFTP, and shell. Defaults: exec/SFTP metadata 30s, SFTP transfer 120s. Host ceiling 300s. Stop/`exec.signal` aborts in-flight work and destroys the channel.

### Changed

- `reuse_or_create` **revives** the oldest disconnected session for that host instead of opening a parallel live row. Reconnect failure leaves the tombstone and fails the tool call.
- Explicit `session_id` that is disconnected fails immediately (no ssh2 hang). Reconnecting ids wait for live.
- keyboard-interactive hosts cannot reconnect in place; close and Connect from the UI.

## [0.3.11] - 2026-08-26

### 修复

- **适配 dsh-better-sidebar ≥ 0.16**：终端 / SFTP 中央面板重新全屏居中。0.16.x 给侧栏面板容器加了 `contain: layout`（并引入统一面板宿主 / 自由窗口），按 CSS Containment 规范该容器成为**后代 `position:fixed` 元素的包含块**——此前内联渲染的全屏覆盖层因此被「关进」右侧窄条。现改为通过 React portal 挂载到 `document.body`，不再依赖任何祖先的定位假设（右键菜单、对话框随覆盖层一起迁移）；react-dom 缺失时回退旧内联渲染。

### Fixed

- **Compatibility with dsh-better-sidebar ≥ 0.16**: the terminal / SFTP center panel is full-screen centered again. 0.16.x adds `contain: layout` to the sidebar panel containers (plus the unified panel host / free windows); per CSS Containment such a container becomes the **containing block for descendant `position:fixed` elements**, which trapped the previously inline-rendered viewport overlay inside the narrow right rail. The overlay now mounts through a React portal into `document.body` and no longer depends on ancestor positioning assumptions (context menu and dialogs travel with it); falls back to the legacy inline render if react-dom is unavailable.

## [0.3.10] - 2026-08-18

### 修复

- 主机库 / 隧道列表：过长 endpoint（如 IPv6）不再把 **编辑/删除** 等按钮挤出可视区——文案可换行，操作区始终保留

### Fixed

- Host library / tunnel rows: long endpoints (IPv6) no longer push **Edit/Delete** (and other actions) off-screen — text wraps, action cluster stays visible

## [0.3.9] - 2026-08-18

### 修复

- **SSHManager 作为全局模型工具正确注册**（不再依赖 out-of-tree 解析 `@deepseek-ai/dsh-tools` 的 `defineTool`；改用与 modlens 相同的裸 JSON Schema 定义）。此前标准对话工具列表中看不到该工具。

### Fixed

- **SSHManager registers as a global model tool** without importing `@deepseek-ai/dsh-tools` (raw JSON-Schema definition, same pattern as modlens). Out-of-tree `defineTool` resolution left the tool missing from standard chat catalogs.

## [0.3.8] - 2026-08-18

### 修复

- Host key 固定：使用 ssh2 `hostHash: sha256` 并以 hex 摘要入库（旧版 `String(Buffer)` 条目作废并重新提示信任）
- 信任 UI 展示 SHA256 指纹；`health.version` 与 `package.json` 对齐
- **Connect 不再静默写入项目授权**；须先在「项目授权」勾选主机

### Fixed

- Host key pinning: use ssh2 `hostHash: sha256` and store hex digests (legacy `String(Buffer)` entries are ignored and re-prompted)
- Trust UI shows the SHA256 fingerprint; `health.version` tracks `package.json`
- **Connect no longer auto-writes project grants**; host must already be authorized under Project access

## [0.3.7] - 2026-08-18

### 变更

- README（中/英）：明确 **致谢 / 参考来源** — 产品形态参考开源 [LiveAgent](https://github.com/thirsty5034/LiveAgent)；DSH 原生实现，非 fork

### Changed

- README (EN/ZH): explicit **Credits / prior art** — product shape informed by open-source [LiveAgent](https://github.com/thirsty5034/LiveAgent); DSH-native reimplementation, not a fork

## [0.3.6] - 2026-08-16

### 变更

- 对齐 dsh-better-sidebar 的公开仓库结构
- 增加 `scripts/install.sh` / `install.ps1`（默认 GitHub；`--from npm` 预留）
- package.json：`repository` / `homepage` / `bugs` / `publishConfig`
- 增加简体中文 README / CHANGELOG，与英文版并列入口

### Changed

- Public GitHub repo layout aligned with dsh-better-sidebar
- `scripts/install.sh` / `install.ps1` (GitHub default; `--from npm` ready)
- package.json: `repository` / `homepage` / `bugs` / `publishConfig`
- Add Simplified Chinese README / CHANGELOG alongside English

## [0.3.5] - 2026-08-16

### 新增

- 客户端 i18n（对齐 dsh-better-sidebar）：`ctx.locale.register("sshTunnel", zh|en)`、`t(key)`、语言切换实时刷新

### 修复

- `zh.footerHint` 误调用 `t()` 导致插件加载 TDZ 报错

### Added

- Client i18n following dsh-better-sidebar: `ctx.locale.register("sshTunnel", zh|en)`, `t(key)`, live switch via `useSyncExternalStore`

### Fixed

- Plugin load TDZ when `zh.footerHint` incorrectly called `t()` during dictionary init

## [0.3.4] - 2026-08-16

### 变更

- 发布前规范化：包元数据、MIT LICENSE、README、CHANGELOG
- 抽取 `lib/shared/*` 纯函数与离线冒烟测试
- `shellRead` 默认只返回增量 `chunk`（`full: true` 才给全量）
- 主题 token 配色；SFTP 面板内对话框（0.3.x）
- 包描述改为中立表述，不再带第三方产品的营销文案

### 修复

- 主机库删除恢复确认
- 样式表缓存刷新

### Changed

- Publish prep: package metadata, MIT LICENSE, README, CHANGELOG
- Extract shared pure modules (`lib/shared/*`) with offline smoke tests
- `shellRead` returns incremental `chunk` by default (omit full buffer unless `full: true`)
- Theme-safe UI tokens; in-panel dialogs for SFTP prompts (0.3.x)
- Neutral package description (no third-party product marketing)

### Fixed

- Host library delete asks for confirmation again
- Style sheet cache bust when CSS updates

## [0.3.0] - 2026-08-16

### 新增

- 中央终端（xterm）与双栏 SFTP
- 项目级授权、SSHManager、OpenSSH 扫描

### Added

- Center overlay terminal (xterm) and dual-pane SFTP
- Project-scoped grants, SSHManager tool, OpenSSH scan

## [0.1.0] - 2026-08-16

### 新增

- 初始永久插件骨架

### Added

- Initial permanent plugin scaffold
