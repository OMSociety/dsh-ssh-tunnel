<p align="center"><strong>简体中文</strong> | <a href="README_en.md">English</a></p>

<div align="center">
  <h1>DSH SSH Tunnel</h1>
  <p>DeepSeek Harness 的多机 SSH 工作台：主机库、按项目授权、右侧栏里的终端与双栏 SFTP。</p>
  <p>模型用 <strong>SSHManager</strong> 工具执行命令、传文件；你在侧栏管主机与授权。<strong>密钥不进模型上下文</strong>。</p>

  <p>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/releases"><img src="https://img.shields.io/github/v/tag/OMSociety/dsh-ssh-tunnel?label=version&color=4f6ef7" alt="Version"></a>
    <a href="https://github.com/deepseek-ai/dsh"><img src="https://img.shields.io/badge/DSH-%3E%3D0.1.7--rc.2_%3C0.3.0--0-4f6ef7" alt="DSH"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="License"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/stargazers"><img src="https://img.shields.io/github/stars/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Stars"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/issues"><img src="https://img.shields.io/github/issues/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Issues"></a>
  </p>

<a href="#这是什么">这是什么</a> • <a href="#核心特性">核心特性</a> • <a href="#快速开始">快速开始</a> • <a href="#侧栏">侧栏</a> • <a href="#模型工具">模型工具</a> • <a href="#安全">安全</a> • <a href="#开发">开发</a> • <a href="#许可证与作者">许可证与作者</a>
</div>

> **提示：**本仓库是 `dsh-ssh-tunnel` 的维护主线，在 [OMSociety 仓库](https://github.com/OMSociety/dsh-ssh-tunnel) 独立延续（2026-09-28 起脱离 fork 网络）。上游项目与代码作者是 [thirsty5034/dsh-ssh-tunnel](https://github.com/thirsty5034/dsh-ssh-tunnel)（MIT，见 [LICENSE](LICENSE)）。修复与问题反馈都在本仓库处理。

## 这是什么

**dsh-ssh-tunnel** 是 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的社区插件，挂在右侧栏宿主 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 上：把多台 SSH 主机收进一个**主机库**，按项目授权，然后在中央面板里开**交互式终端**（xterm）或**双栏 SFTP**。

它**不会**把全局 `fs` / `subprocess` 换成一个远程盘：远端操作只发生在你显式调用的 `SSHManager` 工具与面板里，本地文件与远端文件始终是两侧分明的东西。

配套插件是 [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge)（Git 凭据与 push 策略）。

## 参考来源

**产品形态与部分 UX 参考开源项目 [LiveAgent](https://github.com/thirsty5034/LiveAgent)**（多机 SSH 主机库、按项目授权、侧栏隧道管理、中央终端 / SFTP 等）。

本仓库是 **DSH 原生实现**（Cordis host/client、`dsh-better-sidebar` Tab、`SSHManager` 工具、DSH 本地密钥布局），**不是** LiveAgent 的 git fork，也**不**内嵌 LiveAgent 源码。对照设计时请遵守 LiveAgent 自身许可证。

## 核心特性

| 特性 | 说明 |
|---|---|
| **主机库** | 主机增删改、支持导入 OpenSSH 配置；密码 / 私钥（含口令），密钥只存宿主侧 |
| **按项目授权** | 授权 key 是 **DSH 会话工作区**（`projectPathKey`）；**连接前必须先授权**，Connect 不会自动写入授权 |
| **`SSHManager` 工具** | 远端 exec、SFTP 列举/读写/增删改、上传下载、交互式会话读写；`reuse_or_create` / `new` / `require_existing` 会话策略 |
| **中央面板** | 交互式终端（xterm）与双栏 SFTP：左侧是项目工作区、右侧是远端，可直接上传下载 |
| **断线可续** | 掉线会话留作墓碑，可**重连**（同一 id）或关闭；意外断开自动重连最多 3 次，ssh2 keepalive 30s × 3 |
| **主机密钥指纹** | 以 SHA256 hex 存入 `known_hosts.json`，首次连接或指纹变更时在侧栏确认并展示指纹 |
| **本地路径守卫** | 上传 / 下载 / 列举 / 删除的本机路径限制在**项目工作区根**内，词法 **与** realpath 双重校验 |
| **界面双语** | 侧栏与面板随 DSH 界面语言在中文 / 英文间即时切换 |

## 快速开始

**方式一：从 npm 安装（推荐）**

```powershell
# 1) 先停掉 dsh web（运行中的服务会锁住依赖，装完再起）
dsh plugin --profile web add "dsh-ssh-tunnel@1.0.0"
# 2) 重新启动 dsh web
```

包已发布到 npm，随包提供预构建产物，本地不需要构建步骤；换版本就把 `@1.0.0` 换成目标版本。

**方式二：从 GitHub 源安装**

```powershell
dsh plugin --profile web add "github:OMSociety/dsh-ssh-tunnel"
```

想复现某次安装就钉住 ref：在仓库地址后加 `#<tag 或提交 sha>`。

**方式三：一键脚本**

```sh
curl -fsSL https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.ps1 | iex
```

脚本默认走 GitHub 源（`bash scripts/install.sh --from npm 1.0.0` 可切到 npm），除安装外还会把 profile 的 `minimumReleaseAgeExclude` 补上本插件、校验 `dsh.profile.bundles` 确实写入、清掉旧版手写在 profile `cordis.patch.yml` 里的挂载（先加 `--dry-run` 可只看计划不动手）。

> **提示：**装好后**刷新一下浏览器页面**，右侧栏才会出现「SSH 隧道」入口——只重启宿主不够，客户端产物是页面加载时取的。

**装完怎么用**

1. 打开右侧栏「SSH 隧道」→ **主机库** 添加一台主机（密码或私钥）
2. 切到 **项目授权**，给当前项目勾上这台主机并保存（**不授权连不上**，这是有意为之）
3. 回 **隧道会话** 点 Connect；首次连接会提示确认主机密钥指纹
4. 点 **终端** 得到一个交互式 shell，或点 **SFTP** 打开双栏面板
5. 让模型用 `SSHManager action=exec` 跑条命令、用 `sftp_list` 看目录、`sftp_upload` / `sftp_download` 传文件，验证整条链路

## 侧栏

侧栏只有一个 Tab，内部三页：

| 页面 | 作用 |
|---|---|
| **项目授权** | 当前项目允许使用的主机 |
| **主机库** | 主机增删改、OpenSSH 配置扫描导入 |
| **隧道会话** | 连接 / 断开，打开终端或 SFTP；掉线会话留墓碑，可重连或关闭 |

## 模型工具

`SSHManager` 的动作按用途分组：

| 动作 | 作用 |
|---|---|
| `list_hosts` / `list_sessions` | 列出主机库、列出当前会话 |
| `create_session` / `close_session` | 建立或关闭会话（配合 `session_strategy`） |
| `exec` | 远端执行命令（`command`、`cwd`、`timeout_ms`） |
| `sftp_list` / `sftp_stat` / `sftp_read_text` / `sftp_write_text` | 远端目录、元数据与文本读写 |
| `sftp_mkdir` / `sftp_rename` / `sftp_delete` | 远端建目录、重命名、删除 |
| `sftp_upload` / `sftp_download` | 在项目工作区与远端之间传文件 |
| `read_session` / `send_input` / `resize_session` | 交互式会话的读取、输入与窗口尺寸 |

- 会话策略：`reuse_or_create`（默认，会复活同主机已断开的会话）、`new`、`require_existing`，或显式传 `session_id`
- `timeout_ms` 取值 1000–300000，作用于 exec / SFTP / shell；默认 exec 与 SFTP 元数据 30s，SFTP 传输 120s
- 认证方式只有**密码**或**私钥**；键盘交互式认证（含堡垒机网页 MFA）不支持

## 安全

- 工具结果与列表 API 不返回 password / PEM / 口令
- 本地上传、下载、列举、删除的路径限制在**项目工作区根**内（由宿主按当前会话工作区解析，不假设固定挂载点）：词法 **与** realpath 双重校验，越界路径与指向工作区外的符号链接一律拒绝
- 主机密钥以 **SHA256 hex** 存入 `known_hosts.json`；首次连接或指纹变更时在侧栏确认（展示指纹）
- HTTP API 限制在 loopback / trusted hosts；浏览器 `Origin` 必须匹配；会话 API 必须带 `projectPathKey`
- 优先使用密钥登录；若 `secrets.json` 可能泄露请立即轮换凭据
- 键盘交互式认证已下线：请把这类主机改为密码或私钥

## 数据放在哪

`$DSH_HOME/ssh-tunnel/`（目录 `0700`）：

| 文件 | 内容 |
|---|---|
| `hosts.json` | 主机元数据（不含密钥明文） |
| `secrets.json` | 密码 / PEM / 口令（`0600`） |
| `grants.json` | `projectPathKey → hostIds[]` |
| `known_hosts.json` | 已信任的主机密钥指纹 |

## 界面国际化

- 命名空间：`sshTunnel`；字典 `zh` / `en` 注册到 `ctx.locale`
- Tab 标题与面板随 DSH 界面语言即时切换
- 宿主侧 `SSHManager` 的描述保持英文（面向模型）

## 开发

```powershell
npm test                   # node --test：自检脚本全量回归
npm run check              # 语法 + 自检
bash scripts/sync-to-dsh.sh   # 以 link: 方式把本仓库接入 web profile（开发用）
bash scripts/install.sh --dry-run   # 只看安装计划，不动 profile
node scripts/portal-probe.mjs       # 客户端 Tab 渲染探针（能解析到 react 时生效，否则明确跳过）
```

目录与「改东西去哪」：

```text
lib/index.js            宿主入口：工具注册、/dsh-ssh-tunnel/api 路由、授权与路径守卫、xterm 资产下发
lib/client.js           客户端 bundle（已入库；dsh plugin add 不做构建）
lib/session.js          会话生命周期：连接、keepalive、掉线墓碑与自动重连
lib/shared/             宿主与客户端共用纯函数：path / host-key / host-summary / http-trust / persist /
                        session-auth / session-policy / shell-buffer / vendor
scripts/                install.sh · install.ps1 · sync-to-dsh.sh · smoke-test.mjs · portal-probe.mjs
cordis.patch.yml        包内 bundle patch，CLI 据此写入 dsh.profile.bundles
```

### xterm 加载

`@xterm/xterm@5.5.0` 与 `@xterm/addon-fit@0.11.0` 是钉死的运行时依赖。宿主把它们的 UMD 与 CSS 从同源白名单路由下发（`/dsh-ssh-tunnel/vendor/xterm.js|addon-fit.js|xterm.css`），客户端用普通 `<script>` / `<link>` 加载。没有 CDN 回退，也不依赖模块表。

## 支持与致谢

- 如果这个插件对你有帮助，欢迎点亮 Star；有问题或建议请提 [Issue](https://github.com/OMSociety/dsh-ssh-tunnel/issues) 或 [Pull Request](https://github.com/OMSociety/dsh-ssh-tunnel/pulls)。
- 变更记录见 [CHANGELOG](CHANGELOG.md)。
- [LiveAgent](https://github.com/thirsty5034/LiveAgent)：产品形态与部分 UX 的参考来源（见上文「参考来源」）
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)：右侧栏宿主与 Tab 契约
- [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge)：同门插件，Git 凭据与 push 策略
- [DeepSeek Harness](https://github.com/deepseek-ai/dsh)：插件、工具与 agent shell 的宿主

## 许可证与作者

[MIT](LICENSE)。上游项目与代码作者 [@thirsty5034](https://github.com/thirsty5034)；本仓库的维护与新增部分 © 2026 [@OMSociety](https://github.com/OMSociety)。
