# dsh-ssh-tunnel

[English](./README.md) | [简体中文](./README.zh-CN.md)

> **Note:** This npm package is published from the [OMSociety fork](https://github.com/OMSociety/dsh-ssh-tunnel); [thirsty5034/dsh-ssh-tunnel](https://github.com/thirsty5034/dsh-ssh-tunnel) is the upstream project and the author of this code (MIT, see [LICENSE](./LICENSE)). This release adds the local-path guard fix for hosts whose workspace is not `/workspace`, restores the smoke-test script in the packed install, and declares DSH host compatibility. Install: `dsh plugin --profile web add dsh-ssh-tunnel`.

DeepSeek Harness community plugin: multi-host **SSH tunnel** + **SSHManager** for [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar).

- Host inventory + secrets (never exposed to the model)  
- **Project-scoped** authorization (`projectPathKey` = workspace cwd)  
- Model tool **`SSHManager`** (exec, SFTP, session strategies)  
- Sidebar tab for connect / grants  
- Center overlay: interactive **terminal** (xterm) and **dual-pane SFTP**

Does **not** replace global `fs` / `subprocess` with a single remote disk.

Companion: [dsh-git-forge](https://github.com/thirsty5034/dsh-git-forge) (Git credentials + push policy).

## Credits / prior art

**Product shape and several UX patterns are informed by open-source [LiveAgent](https://github.com/thirsty5034/LiveAgent)** (multi-host SSH inventory, project-scoped access, sidebar tunnel management, center terminal / SFTP surfaces).

This package is a **DSH-native implementation** (Cordis host/client plugin, `dsh-better-sidebar` tab, `SSHManager` tool, DSH-local secret layout). It is **not** a git fork of LiveAgent and does not vendor LiveAgent sources. Consult LiveAgent under its own license when comparing designs.

## Requirements

- DSH web profile with **dsh-better-sidebar** (≥ 0.12)  
- Node.js 18+  
- Network access to your SSH targets  

## Install

**macOS / Linux**:

```sh
curl -fsSL https://raw.githubusercontent.com/thirsty5034/dsh-ssh-tunnel/main/scripts/install.sh | bash
```

**Windows (PowerShell)**:

```powershell
irm https://raw.githubusercontent.com/thirsty5034/dsh-ssh-tunnel/main/scripts/install.ps1 | iex
```

Or CLI (GitHub source until npm publish):

```bash
export DSH_HOME=${DSH_HOME:-$HOME/.dsh}
dsh plugin --profile web add "dsh-ssh-tunnel@github:thirsty5034/dsh-ssh-tunnel"
dsh --profile web --dump-config | grep ssh-tunnel
```

Restart DSH web after host-side changes, then hard-refresh the browser.

<details>
<summary><b>Options / local link / npm (later)</b></summary>

```sh
bash scripts/install.sh --restart
bash scripts/install.sh --from npm 0.3.6
dsh plugin --profile web add "dsh-ssh-tunnel@link:/path/to/dsh-ssh-tunnel"
```

</details>


## Discoverability

- GitHub topics: `dsh-plugin`, `deepseek-harness`, `dsh` (required for [dsh.so](https://www.dsh.so/) auto-index)
- Install from GitHub (current): see **Install** above
- Store listings may lag crawlers; source of truth is this repository


## Data layout

Under `$DSH_HOME/ssh-tunnel/` (mode `0700`):

| File | Purpose |
|------|---------|
| `hosts.json` | Non-secret host metadata |
| `secrets.json` | Passwords / PEM / passphrases (`0600`) |
| `grants.json` | `projectPathKey → hostIds[]` |
| `known_hosts.json` | Trusted host key fingerprints |

## Sidebar

1. **Hosts** — CRUD, OpenSSH scan import  
2. **Project access** — which hosts the current project may use (**grant before connect**; Connect does not auto-authorize)  
3. **Sessions** — Connect / disconnect; open **Terminal** or **SFTP**. Dropped sessions stay as tombstones with **Reconnect** (same id) or **Close**. Unexpected drops auto-reconnect up to 3 times. ssh2 keepalive is 30s × 3.

## Model tool

```text
SSHManager action=list_hosts
SSHManager action=exec host_id=<id> command="uname -a"
SSHManager action=sftp_list host_id=<id> path=/
```

Session strategies: `reuse_or_create` (default; revives a disconnected session for that host), `new`, `require_existing`, or explicit `session_id`.  
`timeout_ms` (1000–300000) applies to exec / SFTP / shell. Defaults: exec and SFTP metadata 30s, SFTP transfer 120s.  
Auth is **password** or **private key** only. Keyboard-interactive / bastion-web MFA is not supported.

## Security

- Tool and list APIs must not return `password` / PEM / passphrase  
- Local upload/download/list/delete paths are constrained to `/workspace` (lexical **and** realpath; outbound symlinks rejected)  
- Host keys are stored as **SHA256 hex** in `known_hosts.json`; first connect / rotation prompts in the sidebar (fingerprint shown)  
- HTTP API is loopback / trusted-hosts fenced; browser `Origin` must match; session APIs require `projectPathKey`  
- Prefer key-based auth; rotate secrets if `secrets.json` may have leaked  
- keyboard-interactive is retired: edit those hosts to password or private key  

## Internationalization (UI)

- Namespace: `sshTunnel`  
- Dictionaries: `zh` / `en` on `ctx.locale`  
- Tab title and panel track DSH locale preference live  

Host `SSHManager` strings stay English (model-facing).

## Development

```bash
npm test
npm run check
./scripts/sync-to-dsh.sh   # requires DSH_HOME; keeps local-plugins copy
```

### xterm loading

`@xterm/xterm@5.5.0` + `@xterm/addon-fit@0.11.0` are pinned runtime dependencies. The host serves their UMD/CSS from an allowlisted same-origin route (`/dsh-ssh-tunnel/vendor/xterm.js|addon-fit.js|xterm.css`); the client loads them with plain `<script>`/`<link>` tags. No CDN fallback and no module-table requirement.

## License

MIT — see [LICENSE](./LICENSE).
