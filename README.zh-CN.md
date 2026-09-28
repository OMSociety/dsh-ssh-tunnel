# dsh-ssh-tunnel

[English](./README.md) | [简体中文](./README.zh-CN.md)

> **提示：**本 npm 包由 [OMSociety fork](https://github.com/OMSociety/dsh-ssh-tunnel) 发布；上游项目为 [thirsty5034/dsh-ssh-tunnel](https://github.com/thirsty5034/dsh-ssh-tunnel)，也是本代码的作者（MIT，见 [LICENSE](./LICENSE)）。本版本加入工作区非 `/workspace` 时的本地路径守卫修复、补回打包内的自检脚本，并声明 DSH 宿主兼容。修复与问题反馈都走该 fork。安装：`dsh plugin --profile web add dsh-ssh-tunnel`。

DeepSeek Harness **社区插件**：多机 **SSH 隧道** + **SSHManager**，挂载于 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)。

- 主机库 + 密钥（**不**进入模型上下文）  
- **按项目授权**（`projectPathKey` = 工作区 cwd）  
- 模型工具 **`SSHManager`**（exec、SFTP、会话策略）  
- 侧栏：连接 / 授权  
- 中央面板：交互式 **终端**（xterm）与 **双栏 SFTP**  

**不会**把全局 `fs` / `subprocess` 改成「单机远程盘」。

配套：[dsh-git-forge](https://github.com/thirsty5034/dsh-git-forge)（Git 凭据 + push 策略）。

## 致谢 / 参考来源

**产品形态与部分 UX 参考开源项目 [LiveAgent](https://github.com/thirsty5034/LiveAgent)**（多机 SSH 主机库、按项目授权、侧栏隧道管理、中央终端 / SFTP 等）。

本仓库是 **DSH 原生实现**（Cordis host/client、`dsh-better-sidebar` Tab、`SSHManager` 工具、DSH 本地密钥布局），**不是** LiveAgent 的 git fork，也**不**内嵌 LiveAgent 源码。对照设计时请遵守 LiveAgent 自身许可证。

## 环境要求

- 带 **dsh-better-sidebar**（≥ 0.12）的 DSH web profile  
- Node.js 18+  
- 能访问目标 SSH 主机  

## 安装

**macOS / Linux**：

```sh
curl -fsSL https://raw.githubusercontent.com/thirsty5034/dsh-ssh-tunnel/main/scripts/install.sh | bash
```

**Windows（PowerShell）**：

```powershell
irm https://raw.githubusercontent.com/thirsty5034/dsh-ssh-tunnel/main/scripts/install.ps1 | iex
```

或 CLI（发布到 npm 前默认 GitHub 源）：

```bash
export DSH_HOME=${DSH_HOME:-$HOME/.dsh}
dsh plugin --profile web add "dsh-ssh-tunnel@github:thirsty5034/dsh-ssh-tunnel"
dsh --profile web --dump-config | grep ssh-tunnel
```

Host 侧改动后需 **重启 dsh web**，再 **硬刷新** 浏览器。

<details>
<summary><b>可选参数 / 本地 link / 日后 npm</b></summary>

```sh
bash scripts/install.sh --restart
bash scripts/install.sh --from npm 0.3.6
dsh plugin --profile web add "dsh-ssh-tunnel@link:/path/to/dsh-ssh-tunnel"
```

</details>


## 可发现性

- GitHub topics：`dsh-plugin`、`deepseek-harness`、`dsh`（[dsh.so](https://www.dsh.so/) 自动收录所需）
- 当前请从 GitHub 安装：见上文 **安装**
- 商店目录可能滞后于爬虫；以本仓库为准


## 数据目录

`$DSH_HOME/ssh-tunnel/`（建议 `0700`）：

| 文件 | 用途 |
|------|------|
| `hosts.json` | 主机元数据（无密钥明文） |
| `secrets.json` | 密码 / PEM / 口令（`0600`） |
| `grants.json` | `projectPathKey → hostIds[]` |
| `known_hosts.json` | 已信任 host key 指纹 |

## 侧栏

1. **主机库** — 增删改、OpenSSH 配置扫描导入  
2. **项目授权** — 当前项目允许使用的主机（**连接前须先授权**；Connect 不会自动写入授权）  
3. **隧道会话** — 连接 / 断开；打开 **终端** 或 **SFTP**。断开后保留墓碑，可 **重连**（同一 id）或 **关闭**。意外断开自动重连最多 3 次。ssh2 keepalive 为 30s × 3。  

## 模型工具

```text
SSHManager action=list_hosts
SSHManager action=exec host_id=<id> command="uname -a"
SSHManager action=sftp_list host_id=<id> path=/
```

会话策略：`reuse_or_create`（默认；会复活同主机已断开会话）、`new`、`require_existing`，或显式 `session_id`。  
`timeout_ms`（1000–300000）适用于 exec / SFTP / shell。默认：exec 与 SFTP 元数据 30s，SFTP 传输 120s。  
认证方式仅 **密码** 或 **私钥**。不支持键盘交互 / 堡垒机网页 MFA。

## 安全

- 列表与工具结果不得包含 password / PEM / 口令  
- 本地上传/下载/列举/删除路径限制在 `/workspace`（词法 **与** realpath；拒绝指向工作区外的符号链接）  
- Host key 以 **SHA256 hex** 存入 `known_hosts.json`；首次或变更时在侧栏确认（展示指纹）  
- HTTP API 限制 loopback / trusted hosts；浏览器 `Origin` 必须匹配；会话 API 必须带 `projectPathKey`  
- 优先密钥登录；若 `secrets.json` 可能泄露请轮换凭据  
- 键盘交互已下线：请把此类主机改为密码或私钥  

## 界面国际化

- 命名空间：`sshTunnel`  
- 字典：`zh` / `en`，注册到 `ctx.locale`  
- Tab 标题与面板随 DSH 界面语言即时切换  

Host 侧 `SSHManager` 描述保持英文（面向模型）。

## 开发

```bash
npm test
npm run check
./scripts/sync-to-dsh.sh
```

### xterm 加载

`@xterm/xterm@5.5.0` 与 `@xterm/addon-fit@0.11.0` 为钉死的运行时依赖。Host 侧把它们的 UMD/CSS 从同源白名单路由下发（`/dsh-ssh-tunnel/vendor/xterm.js|addon-fit.js|xterm.css`）；客户端用普通 `<script>`/`<link>` 加载。无 CDN 回退，也不依赖模块表。

## 许可证

MIT — 见 [LICENSE](./LICENSE)。
