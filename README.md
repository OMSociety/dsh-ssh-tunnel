<p align="center"><strong>简体中文</strong> | <a href="README_en.md">English</a></p>

<div align="center">
  <img src="https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/docs/logo.png" alt="DSH SSH Tunnel" width="160">
  <h1>DSH SSH Tunnel</h1>
  <p>DeepSeek Harness 的多机 SSH 工作台：主机库、按项目授权、右侧栏里的终端与双栏 SFTP。</p>
  <p>模型用 <strong>SSHManager</strong> 工具执行命令、传文件；你在侧栏管主机与授权。<strong>密钥不进模型上下文</strong>。</p>

  <p>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/releases"><img src="https://img.shields.io/github/v/tag/OMSociety/dsh-ssh-tunnel?label=version&color=4f6ef7" alt="Version"></a>
    <img src="https://img.shields.io/badge/DSH-%3E%3D0.1.7--rc.2%20%3C0.2.0--0%20%7C%7C%20%3E%3D0.2.0--rc.1%20%3C0.3.0--0-4f6ef7" alt="DSH">
    <a href="LICENSE"><img src="https://img.shields.io/github/license/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="License"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/stargazers"><img src="https://img.shields.io/github/stars/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Stars"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/issues"><img src="https://img.shields.io/github/issues/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Issues"></a>
  </p>

<a href="#这是什么">这是什么</a> • <a href="#核心特性">核心特性</a> • <a href="#快速开始">快速开始</a> • <a href="#侧栏">侧栏</a> • <a href="#模型工具">模型工具</a> • <a href="#安全">安全</a> • <a href="#开发">开发</a> • <a href="#许可证与作者">许可证与作者</a>
</div>

## 这是什么

**DSH SSH Tunnel** 是 DeepSeek Harness 的社区插件，挂在右侧栏宿主 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 上：把多台 SSH 主机收进一个**主机库**，按项目授权，然后在中央面板里开**交互式终端**（xterm）或**双栏 SFTP**。

它**不会**把全局 `fs` / `subprocess` 换成一个远程盘：远端操作只发生在你显式调用的 `SSHManager` 工具与面板里，本地文件与远端文件始终是两侧分明的东西。

配套插件是 [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge)（Git 凭据与 push 策略）。

## 参考来源

**产品形态与部分 UX 参考开源项目 [LiveAgent](https://github.com/thirsty5034/LiveAgent)**（多机 SSH 主机库、按项目授权、侧栏隧道管理、中央终端 / SFTP 等）。

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

**CLI 安装**

方式一：从 npm 安装

```sh
dsh plugin --profile <profile> add "dsh-ssh-tunnel@1.0.2"
```

包已发布到 npm，随包提供预构建产物，本地不需要构建步骤；换版本就把 `@1.0.2` 换成目标版本。

方式二：从 GitHub 源安装

```sh
dsh plugin --profile <profile> add "github:OMSociety/dsh-ssh-tunnel"
```

想复现某次安装就钉住 ref：在仓库地址后加 `#<tag 或提交 sha>`。

方式三：一键脚本

```sh
curl -fsSL https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.sh | bash -s -- --profile <profile>
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.ps1))) -Profile <profile>
```

脚本参数（bash 与 PowerShell 一一对应）：

| 说明 | bash | PowerShell |
|---|---|---|
| 安装版本（可选，缺省装最新发布版） | `[版本]`（首个位置参数） | `-Version <版本>` |
| **目标 profile（必填，无默认值）** | `--profile <名称>` | `-Profile <名称>` |
| 安装源（默认 `github`） | `--from github\|npm` | `-From github\|npm` |
| 修 profile（可选开关） | `--fix-profile` | `-FixProfile` |
| 重启 web（可选开关） | `--restart` | `-Restart` |
| 试运行（可选开关） | `--dry-run` | `-DryRun` |

- profile 缺失或不存在时脚本报错并列出实存 profile，退出码 2
- `--fix-profile` / `-FixProfile`：仅在该开关下，脚本才补写 profile `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（幂等）并清理 profile `cordis.patch.yml` 里旧版写入的手动挂载；写入后回读断言，失败回滚并以非零码退出。不带该开关时这两个文件保持原样
- `--restart` / `-Restart`：重启自托管 web 服务（按 pm2 进程名 `dsh-web`）

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
- 超时：默认 exec 30s、SFTP 元数据 30s、SFTP 传输 120s、shell 类操作（`read_session` / `send_input` / `resize_session`）10s；`timeout_ms` 可覆盖，取值钳制在 1000–300000，整次调用另有 300s 上限
- `max_bytes`：exec 与 `sftp_read_text` 的单次输出上限，按字节钳制在 1024–1048576（默认 exec 262144 即 256 KiB、`sftp_read_text` 524288 即 512 KiB）；达到上限时结果带 `truncated: true` 且只含前 `max_bytes` 字节
- exec 结算：结果带 `exitKnown` / `code` / `signal` / `connectionDropped`——正常退出 `exitKnown: true` 且 `code` 为退出码；按信号终止时返回 `signal`；连接被切断时 `code` 为 `null` 且 `connectionDropped: true`
- 交互式输出的读取走 seq 游标协议（侧栏轮询的 `shellRead`）：客户端携带上次读到的 `since`，响应返回 `chunk` / `since` / `seq` / `baseSeq` / `dropped` / `chunkTruncated`；环形缓冲（512 KiB）淘汰后 `baseSeq` 前移且 `dropped: true`，客户端据此全量重取；单次响应的 `chunk` 上限 256 KiB
- 认证方式只有**密码**或**私钥**；键盘交互式认证（含堡垒机网页 MFA）不支持

## 安全

**信任边界（客观陈述）**：插件的 HTTP API 挂在 DSH 宿主的本地 web 服务上，只接受本机回环（`localhost` / `127.0.0.1` / `::1`）与配置的可信主机，并校验浏览器 `Origin`；API 没有鉴权 token——**能在本机访问该端口的进程都被视为已授权用户**，可以使用本插件的能力。会话 API 必须带 `projectPathKey`，跨项目不可见。

授权与路径守卫动作清单：

- **连接必须先授权**：未在「项目授权」里勾选的主机无法建立连接，Connect 不会自动写入授权
- **授权撤销即时生效**：写类操作在发起前与结果回报前各复检一次授权；撤销后输出被丢弃并以 `not authorized` 失败，下载中的本地文件被删除，受影响的存活会话被关闭，重连拒绝复活已撤销主机
- **本地路径守卫 fail-closed**：上传 / 下载 / 列举 / 建目录 / 删除 / 重命名的本机路径限制在**项目工作区根**内，词法 **与** realpath 双重校验，越界路径与指向工作区外的符号链接一律拒绝；工作区根取不到时直接拒绝操作（可用环境变量 `DSH_SSH_TUNNEL_WORKSPACE_ROOT` 显式指定）
- 工具结果与列表 API 不返回 password / PEM / 口令
- 主机密钥以 **SHA256 hex** 存入 `known_hosts.json`；首次连接或指纹变更时在侧栏确认（展示指纹）
- 优先使用密钥登录；若 `secrets.json` 可能泄露请立即轮换凭据
- 认证方式为密码或私钥

## 数据放在哪

`$DSH_HOME/ssh-tunnel/`（目录权限 `0700`；此为 POSIX 系统行为——Windows 的 NTFS 权限由继承 ACL 决定，`chmod` 不改 DACL）：

| 文件 | 内容 | 权限（POSIX） |
|---|---|---|
| `hosts.json` | 主机元数据（不含密钥明文） | `0600` |
| `secrets.json` | 密码 / PEM / 口令 | `0600` |
| `grants.json` | `projectPathKey → hostIds[]` | `0600` |
| `known_hosts.json` | 已信任的主机密钥指纹 | `0600` |

## 开发

```sh
npm test                            # 自检脚本全量回归（实际执行 node scripts/smoke-test.mjs）
npm run check                       # 语法检查 + 自检
node scripts/smoke-test.mjs         # 直接运行自检（离线设计，不起 SSH、不起 DSH 进程）
bash scripts/install.sh --profile <profile> --dry-run   # 只看安装计划，不动 profile
bash scripts/sync-to-dsh.sh --dry-run                    # 预览 link: 接入命令；去掉 --dry-run 才会改写 profile
node scripts/portal-probe.mjs       # 客户端 Tab 渲染探针（能解析到 react 时生效，否则明确跳过）
```

项目目录：

```text
lib/index.js            宿主入口：工具注册、/dsh-ssh-tunnel/api 路由、授权与路径守卫、xterm 资产下发
lib/client.js           客户端 bundle（已入库；dsh plugin add 不做构建）
lib/session.js          会话生命周期：连接、keepalive、掉线墓碑与自动重连、exec/SFTP 执行
lib/shared/             宿主与客户端共用纯函数：path / args / host-key / host-summary / http-trust / persist /
                        session-auth / session-policy / shell-buffer / vendor
scripts/                install.sh · install.ps1 · sync-to-dsh.sh · smoke-test.mjs · portal-probe.mjs
scripts/lib/            安装链共享逻辑（.cjs，install.sh 与 install.ps1 共用）
cordis.patch.yml        包内 bundle patch，CLI 据此写入 dsh.profile.bundles
```

### xterm 加载

`@xterm/xterm@5.5.0` 与 `@xterm/addon-fit@0.11.0` 是钉死的运行时依赖。宿主把它们的 UMD 与 CSS 从同源白名单路由下发（`/dsh-ssh-tunnel/vendor/xterm.js|addon-fit.js|xterm.css`），客户端用普通 `<script>` / `<link>` 加载。没有 CDN 回退，也不依赖模块表。

## 支持与致谢

- 如果这个插件对你有帮助，欢迎点亮 Star；有问题或建议请提 [Issue](https://github.com/OMSociety/dsh-ssh-tunnel/issues) 或 [Pull Request](https://github.com/OMSociety/dsh-ssh-tunnel/pulls)。
- 变更记录见 [CHANGELOG](CHANGELOG.md)。
- LiveAgent（[thirsty5034/LiveAgent](https://github.com/thirsty5034/LiveAgent)）：产品形态与部分 UX 的参考来源（见上文「参考来源」）
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)：右侧栏宿主与 Tab 契约
- [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge)：同门插件，Git 凭据与 push 策略
- DeepSeek Harness：插件、工具与 agent shell 的宿主

## 许可证与作者

[MIT](LICENSE)。授权条款与版权归属以 LICENSE 为准；上游项目与代码作者 [@thirsty5034](https://github.com/thirsty5034)。
