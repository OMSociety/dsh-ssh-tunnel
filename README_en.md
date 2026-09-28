<p align="center"><a href="README.md">简体中文</a> | <strong>English</strong></p>

<div align="center">
  <h1>dsh-ssh-tunnel</h1>
  <p>A multi-host SSH workbench for DeepSeek Harness: host inventory, per-project grants, and a terminal plus dual-pane SFTP in the sidebar.</p>
  <p>The model drives the <strong>SSHManager</strong> tool to run commands and move files; you manage hosts and grants in the sidebar. <strong>Secrets never enter model context</strong>.</p>

  <p>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/releases"><img src="https://img.shields.io/github/v/tag/OMSociety/dsh-ssh-tunnel?label=version&color=4f6ef7" alt="Version"></a>
    <a href="https://github.com/deepseek-ai/dsh"><img src="https://img.shields.io/badge/DSH-%3E%3D0.1.7--rc.2_%3C0.3.0--0-4f6ef7" alt="DSH"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="License"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/stargazers"><img src="https://img.shields.io/github/stars/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Stars"></a>
    <a href="https://github.com/OMSociety/dsh-ssh-tunnel/issues"><img src="https://img.shields.io/github/issues/OMSociety/dsh-ssh-tunnel?color=4f6ef7" alt="Issues"></a>
  </p>
</div>

> **Note:** This is the maintained line of `dsh-ssh-tunnel`, continued independently at the [OMSociety repository](https://github.com/OMSociety/dsh-ssh-tunnel) (standalone since 2026-09-28). The upstream project and the author of this code is [thirsty5034/dsh-ssh-tunnel](https://github.com/thirsty5034/dsh-ssh-tunnel) (MIT, see [LICENSE](LICENSE)). Fixes and issue reports are handled in this repository.

## What this is

**dsh-ssh-tunnel** is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/dsh), mounted in the sidebar host [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). It collects your SSH hosts into one **host inventory**, authorizes them per project, and then opens an **interactive terminal** (xterm) or **dual-pane SFTP** in the center panel.

It does **not** replace the global `fs` / `subprocess` with a remote disk: remote operations happen only in the `SSHManager` tool you call explicitly and inside the panel, and local and remote files remain two clearly separated sides.

Its companion plugin is [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge) (Git credentials and push policy).

## Prior art

**The product shape and several UX patterns are informed by the open-source [LiveAgent](https://github.com/thirsty5034/LiveAgent)** (multi-host SSH inventory, project-scoped access, sidebar tunnel management, center terminal / SFTP surfaces).

This package is a **DSH-native implementation** (Cordis host/client plugin, `dsh-better-sidebar` tab, `SSHManager` tool, DSH-local secret layout). It is **not** a git fork of LiveAgent and does **not** vendor LiveAgent sources. Consult LiveAgent under its own license when comparing designs.

## Features

| Feature | Description |
|---|---|
| **Host inventory** | Create, edit and delete hosts; import from your OpenSSH config; password or private key (with passphrase). Keys stay host-side |
| **Per-project grants** | The grant key is the **DSH session workspace** (`projectPathKey`). **Grant before connect** — Connect never auto-authorizes |
| **`SSHManager` tool** | Remote exec, SFTP list/read/write/mkdir/rename/delete, upload and download, interactive session I/O; session strategies `reuse_or_create` / `new` / `require_existing` |
| **Center panel** | Interactive terminal (xterm) and dual-pane SFTP: the project workspace on the left, the remote side on the right, with direct upload and download |
| **Survives drops** | A dropped session stays as a tombstone you can **Reconnect** (same id) or close; unexpected drops auto-reconnect up to 3 times, ssh2 keepalive 30s × 3 |
| **Host key fingerprints** | Stored as SHA256 hex in `known_hosts.json`; first connect or a changed fingerprint is confirmed in the sidebar with the fingerprint shown |
| **Local path guard** | Local upload / download / list / delete paths are constrained to the **project workspace root**, with both lexical and realpath checks |
| **Bilingual UI** | Sidebar and panel follow the DSH interface language between Chinese and English live |

## Quick start

**Option 1: install from npm (recommended)**

```powershell
# 1) stop dsh web first (a running server holds the dependency lock; start it again afterwards)
dsh plugin --profile web add "dsh-ssh-tunnel@1.0.0"
# 2) restart dsh web
```

The package is published to npm and ships the prebuilt artifacts, so no local build step is involved. Replace `@1.0.0` to install another version.

**Option 2: install from the GitHub source**

```powershell
dsh plugin --profile web add "github:OMSociety/dsh-ssh-tunnel"
```

To reproduce a specific install, pin a ref by appending `#<tag or commit sha>` to the repository URL.

**Option 3: one-line installer**

```sh
curl -fsSL https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.ps1 | iex
```

The script installs from the GitHub source by default (`bash scripts/install.sh --from npm 1.0.0` switches to npm). Besides installing, it adds this plugin to the profile's `minimumReleaseAgeExclude`, verifies that `dsh.profile.bundles` really received the entry, and removes the mount older versions wrote by hand into the profile's `cordis.patch.yml`. Add `--dry-run` to print the plan without touching anything.

> **Note:** After installing, **refresh the browser page** for the "SSH Tunnel" entry to appear in the sidebar — restarting the host alone is not enough, because the client artifact is fetched when the page loads.

**First run**

1. Open the "SSH Tunnel" tab in the sidebar and add a host on the **Hosts** page (password or private key)
2. Switch to **Project access** and grant that host to the current project, then save (without a grant you cannot connect — that is intentional)
3. Back on **Sessions**, press Connect; the first connection asks you to confirm the host key fingerprint
4. Click **Terminal** for an interactive shell, or **SFTP** for the dual-pane panel
5. Have the model run `SSHManager action=exec`, list a directory with `sftp_list`, and move a file with `sftp_upload` / `sftp_download` to verify the whole chain

## Sidebar

One sidebar tab with three pages:

| Page | Purpose |
|---|---|
| **Project access** | Hosts the current project may use |
| **Hosts** | Host CRUD and OpenSSH config scan import |
| **Sessions** | Connect / disconnect, open the terminal or SFTP; dropped sessions stay as tombstones you can reconnect or close |

## Model tool

`SSHManager` actions, grouped by purpose:

| Action | Purpose |
|---|---|
| `list_hosts` / `list_sessions` | List the host inventory and the current sessions |
| `create_session` / `close_session` | Open or close a session (together with `session_strategy`) |
| `exec` | Run a remote command (`command`, `cwd`, `timeout_ms`) |
| `sftp_list` / `sftp_stat` / `sftp_read_text` / `sftp_write_text` | Remote listing, metadata and text I/O |
| `sftp_mkdir` / `sftp_rename` / `sftp_delete` | Remote directory creation, rename and delete |
| `sftp_upload` / `sftp_download` | Transfer files between the project workspace and the remote side |
| `read_session` / `send_input` / `resize_session` | Read, feed and resize an interactive session |

- Session strategies: `reuse_or_create` (default; revives a disconnected session for that host), `new`, `require_existing`, or an explicit `session_id`
- `timeout_ms` ranges from 1000 to 300000 and applies to exec / SFTP / shell; defaults are 30s for exec and SFTP metadata, 120s for SFTP transfers
- Authentication is **password** or **private key** only; keyboard-interactive (including bastion web MFA) is not supported

## Security

- Tool results and list APIs never return password / PEM / passphrase
- Local upload, download, list and delete paths are constrained to the **project workspace root** (the host resolves it from the current session workspace rather than assuming a fixed mount point): both lexical and realpath checks apply, and out-of-bounds paths or symlinks pointing outside the workspace are rejected
- Host keys are stored as **SHA256 hex** in `known_hosts.json`; the first connect or a fingerprint change is confirmed in the sidebar with the fingerprint shown
- The HTTP API is fenced to loopback / trusted hosts; the browser `Origin` must match; session APIs require `projectPathKey`
- Prefer key-based auth; rotate credentials immediately if `secrets.json` may have leaked
- keyboard-interactive is retired: edit such hosts to password or private key

## Where data lives

Under `$DSH_HOME/ssh-tunnel/` (directory mode `0700`):

| File | Contents |
|---|---|
| `hosts.json` | Host metadata (no secret material) |
| `secrets.json` | Passwords / PEM / passphrases (`0600`) |
| `grants.json` | `projectPathKey → hostIds[]` |
| `known_hosts.json` | Trusted host key fingerprints |

## UI internationalization

- Namespace: `sshTunnel`; dictionaries `zh` / `en` registered on `ctx.locale`
- Tab title and panel follow the DSH interface language live
- Host-side `SSHManager` strings stay English (model-facing)

## Development

```powershell
npm test                   # node --test: full regression of the smoke scripts
npm run check              # syntax + smoke tests
bash scripts/sync-to-dsh.sh   # register this checkout into the web profile as link: (dev)
bash scripts/install.sh --dry-run   # print the install plan without touching the profile
node scripts/portal-probe.mjs       # client tab render probe (runs when react resolves, otherwise skips)
```

Layout and where to change what:

```text
lib/index.js            Host entry: tool registration, /dsh-ssh-tunnel/api routes, grants and path guard, xterm asset serving
lib/client.js           Client bundle (committed; dsh plugin add does not build)
lib/session.js          Session lifecycle: connect, keepalive, drop tombstones and auto-reconnect
lib/shared/             Pure functions shared by host and client: path / host-key / host-summary / http-trust / persist /
                        session-auth / session-policy / shell-buffer / vendor
scripts/                install.sh · install.ps1 · sync-to-dsh.sh · smoke-test.mjs · portal-probe.mjs
cordis.patch.yml        In-package bundle patch the CLI turns into dsh.profile.bundles
```

### xterm loading

`@xterm/xterm@5.5.0` and `@xterm/addon-fit@0.11.0` are pinned runtime dependencies. The host serves their UMD and CSS from an allowlisted same-origin route (`/dsh-ssh-tunnel/vendor/xterm.js|addon-fit.js|xterm.css`), and the client loads them with plain `<script>` / `<link>` tags. There is no CDN fallback and no module-table requirement.

## Support and credits

- If this plugin helps you, a Star is welcome; questions and suggestions go to [Issues](https://github.com/OMSociety/dsh-ssh-tunnel/issues) or [Pull Requests](https://github.com/OMSociety/dsh-ssh-tunnel/pulls).
- Changes are recorded in the [CHANGELOG](CHANGELOG.md).
- [LiveAgent](https://github.com/thirsty5034/LiveAgent): prior art for the product shape and several UX patterns (see "Prior art" above)
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar): the sidebar host and tab contract
- [dsh-git-forge](https://github.com/OMSociety/dsh-git-forge): sibling plugin for Git credentials and push policy
- [DeepSeek Harness](https://github.com/deepseek-ai/dsh): the host for plugins, tools and agent shells

## License and author

[MIT](LICENSE). Upstream project and code author [@thirsty5034](https://github.com/thirsty5034); maintenance and additions in this repository © 2026 [@OMSociety](https://github.com/OMSociety).
