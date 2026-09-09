# 更新日志

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh-CN.md)

## 0.4.4 — 2026-09-09

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

## 0.4.3 — 2026-09-08

### 安全
- **在飞操作的结果门禁**。若 `SSHManager` 操作（exec / read_session / sftp_list / sftp_stat / sftp_read_text / sftp_download）执行期间该主机的项目授权被撤销，结果在交付前会复检：来自已撤销主机的输出被丢弃，调用以 `not authorized` 失败。
- **撤销授权后 `sftp_download` 不留任何本地文件**。若传输期间或之后授权被撤销，已写入的本地文件会被删除（含中途失败的部分写入），并拒绝交付结果。

### 修复
- **终端面板不再静默轮询已死会话**。会话被关闭或主机授权在终端打开期间被撤销时，客户端停止轮询并显示「会话已断开」，而不再每 120ms 无反馈地空转请求。

## 0.4.2 — 2026-09-08

### 安全
- **撤销某主机的项目授权后，已建立的隧道会话立即失效。** 此前只有新建连接和 `SSHManager` 工具会复检授权；已打开会话上的 shell / SFTP 操作、以及重连（含自动重连）在撤销授权后仍然可用。现在每次会话使用都会按该会话所属项目的授权重新校验（`requireLiveSession`），重连 / 自动重连拒绝复活已撤销主机，`setGrants` 与删除主机时还会主动关闭受影响的存活会话。

## 0.4.1 — 2026-09-08

### 修复
- 从 `dsh.client.inject` 移除 **`@deepseek-ai/dsh-client-runtime`**。该包在 DSH 0.1.2 已删除（社区升级卡 `DSH-0.1.2-A1-25`）；保留该幻影依赖可能让 client 装配行在 0.1.2 宿主上 pending。保留 `@deepseek-ai/dsh-client-locale`（提供 `ctx.locale`）。

## 0.4.0 — 2026-09-01

### 新增
- 会话断开后保留**墓碑**（重连 + 关闭），无 TTL。意外断开自动重连最多 3 次，同一 `session_id`。
- ssh2 **keepalive** 30s × 3，半开连接会变成真正断开，而不再假活。
- `SSHManager` 支持 `timeout_ms`（1s–300s），覆盖 exec / SFTP / shell。默认：exec 与 SFTP 元数据 30s，SFTP 传输 120s；整次调用天花板 300s。Stop / `exec.signal` 会中止并关掉 channel。

### 变更
- `reuse_or_create` **复活**同主机最老墓碑，不再另开一条活会话。重连失败则保持断线并让这次工具失败。
- 显式已断开的 `session_id` 立即失败（不再卡在 ssh2 上）。重连中的 id 会等到活过来。
- 键盘交互主机不能原地重连，需关闭后在 UI 重新 Connect。

## 0.3.11 — 2026-08-26

### 修复
- **适配 dsh-better-sidebar ≥ 0.16**：终端 / SFTP 中央面板重新全屏居中。0.16.x 给侧栏面板容器加了 `contain: layout`（并引入统一面板宿主 / 自由窗口），按 CSS Containment 规范该容器成为**后代 `position:fixed` 元素的包含块**——此前内联渲染的全屏覆盖层因此被「关进」右侧窄条。现改为通过 React portal 挂载到 `document.body`，不再依赖任何祖先的定位假设（右键菜单、对话框随覆盖层一起迁移）；react-dom 缺失时回退旧内联渲染。

## 0.3.10 — 2026-08-18

### 修复
- 主机库 / 隧道列表：过长 endpoint（如 IPv6）不再把 **编辑/删除** 等按钮挤出可视区——文案可换行，操作区始终保留

## 0.3.9 — 2026-08-18

### 修复
- **SSHManager 作为全局模型工具正确注册**（不再依赖 out-of-tree 解析 `@deepseek-ai/dsh-tools` 的 `defineTool`；改用与 modlens 相同的裸 JSON Schema 定义）。此前标准对话工具列表中看不到该工具。

## 0.3.8 — 2026-08-18

### 修复
- Host key 固定：使用 ssh2 `hostHash: sha256` 并以 hex 摘要入库（旧版 `String(Buffer)` 条目作废并重新提示信任）
- 信任 UI 展示 SHA256 指纹；`health.version` 与 `package.json` 对齐
- **Connect 不再静默写入项目授权**；须先在「项目授权」勾选主机

## 0.3.7 — 2026-08-18

### 文档
- README（中/英）：明确 **致谢 / 参考来源** — 产品形态参考开源 [LiveAgent](https://github.com/thirsty5034/LiveAgent)；DSH 原生实现，非 fork  

## 0.3.6 — 2026-08-16

### 社区发布形态
- 对齐 dsh-better-sidebar 的公开仓库结构  
- 增加 `scripts/install.sh` / `install.ps1`（默认 GitHub；`--from npm` 预留）  
- package.json：`repository` / `homepage` / `bugs` / `publishConfig`  

### 文档
- 增加简体中文 README / CHANGELOG，与英文版并列入口

## 0.3.5 — 2026-08-16

### 新增
- 客户端 i18n（对齐 dsh-better-sidebar）：`ctx.locale.register("sshTunnel", zh|en)`、`t(key)`、语言切换实时刷新

### 修复
- `zh.footerHint` 误调用 `t()` 导致插件加载 TDZ 报错

## 0.3.4 — 2026-08-16

### 变更
- 发布前规范化：包元数据、MIT LICENSE、README、CHANGELOG
- 抽取 `lib/shared/*` 纯函数与离线冒烟测试
- `shellRead` 默认只返回增量 `chunk`（`full: true` 才给全量）
- 主题 token 配色；SFTP 面板内对话框（0.3.x）

### 修复
- 主机库删除恢复确认
- 样式表缓存刷新

## 0.3.0 — 2026-08-16

- 中央终端（xterm）与双栏 SFTP
- 项目级授权、SSHManager、OpenSSH 扫描

## 0.1.0 — 2026-08-16

- 初始永久插件骨架
