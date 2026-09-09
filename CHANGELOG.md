# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh-CN.md)

## 0.4.2 — 2026-09-08

### Security
- **Revoking a host's project grant now takes effect on established tunnel sessions.** Previously only new connections and the `SSHManager` tool re-checked grants; shell / SFTP operations over an already-open session and reconnection (including auto-reconnect) kept working after the grant was revoked. Now every session use re-validates the host against the session's project grants (`requireLiveSession`), reconnect / auto-reconnect refuse to resurrect a revoked host, and `setGrants` / host deletion actively close the affected live sessions.

## 0.4.1 — 2026-09-08

### Fixed
- Remove **`@deepseek-ai/dsh-client-runtime`** from `dsh.client.inject`. The package was deleted in DSH 0.1.2 (community upgrade card `DSH-0.1.2-A1-25`); keeping the phantom in `inject` could leave the client assembly row pending on 0.1.2 hosts. `@deepseek-ai/dsh-client-locale` is retained (provides `ctx.locale`).

## 0.4.0 — 2026-09-01

### Added
- Disconnected sessions stay as **tombstones** (Reconnect + Close). No TTL. Unexpected drops auto-reconnect up to 3 times on the same `session_id`.
- ssh2 **keepalive** 30s × 3 misses so half-open TCP becomes a real disconnect instead of a false-alive row.
- `SSHManager` `timeout_ms` (1s–300s) for exec, SFTP, and shell. Defaults: exec/SFTP metadata 30s, SFTP transfer 120s. Host ceiling 300s. Stop/`exec.signal` aborts in-flight work and destroys the channel.

### Changed
- `reuse_or_create` **revives** the oldest disconnected session for that host instead of opening a parallel live row. Reconnect failure leaves the tombstone and fails the tool call.
- Explicit `session_id` that is disconnected fails immediately (no ssh2 hang). Reconnecting ids wait for live.
- keyboard-interactive hosts cannot reconnect in place; close and Connect from the UI.

## 0.3.11 — 2026-08-26

### Fixed
- **Compatibility with dsh-better-sidebar ≥ 0.16**: the terminal / SFTP center panel is full-screen centered again. 0.16.x adds `contain: layout` to the sidebar panel containers (plus the unified panel host / free windows); per CSS Containment such a container becomes the **containing block for descendant `position:fixed` elements**, which trapped the previously inline-rendered viewport overlay inside the narrow right rail. The overlay now mounts through a React portal into `document.body` and no longer depends on ancestor positioning assumptions (context menu and dialogs travel with it); falls back to the legacy inline render if react-dom is unavailable.

## 0.3.10 — 2026-08-18

### Fixed
- Host library / tunnel rows: long endpoints (IPv6) no longer push **Edit/Delete** (and other actions) off-screen — text wraps, action cluster stays visible

## 0.3.9 — 2026-08-18

### Fixed
- **SSHManager registers as a global model tool** without importing `@deepseek-ai/dsh-tools` (raw JSON-Schema definition, same pattern as modlens). Out-of-tree `defineTool` resolution left the tool missing from standard chat catalogs.

## 0.3.8 — 2026-08-18

### Fixed
- Host key pinning: use ssh2 `hostHash: sha256` and store hex digests (legacy `String(Buffer)` entries are ignored and re-prompted)
- Trust UI shows the SHA256 fingerprint; `health.version` tracks `package.json`
- **Connect no longer auto-writes project grants**; host must already be authorized under Project access

## 0.3.7 — 2026-08-18

### Docs
- README (EN/ZH): explicit **Credits / prior art** — product shape informed by open-source [LiveAgent](https://github.com/thirsty5034/LiveAgent); DSH-native reimplementation, not a fork  

## 0.3.6 — 2026-08-16

### Community packaging
- Public GitHub repo layout aligned with dsh-better-sidebar  
- `scripts/install.sh` / `install.ps1` (GitHub default; `--from npm` ready)  
- package.json: `repository` / `homepage` / `bugs` / `publishConfig`  

### Docs
- Add Simplified Chinese README / CHANGELOG alongside English

## 0.3.5 — 2026-08-16

### Added
- Client i18n following dsh-better-sidebar: `ctx.locale.register("sshTunnel", zh|en)`, `t(key)`, live switch via `useSyncExternalStore`

### Fixed
- Plugin load TDZ when `zh.footerHint` incorrectly called `t()` during dictionary init

## 0.3.4 — 2026-08-16

### Changed
- Publish prep: package metadata, MIT LICENSE, README, CHANGELOG
- Extract shared pure modules (`lib/shared/*`) with offline smoke tests
- `shellRead` returns incremental `chunk` by default (omit full buffer unless `full: true`)
- Theme-safe UI tokens; in-panel dialogs for SFTP prompts (0.3.x)
- Neutral package description (no third-party product marketing)

### Fixed
- Host library delete asks for confirmation again
- Style sheet cache bust when CSS updates

## 0.3.0 — 2026-08-16

- Center overlay terminal (xterm) and dual-pane SFTP
- Project-scoped grants, SSHManager tool, OpenSSH scan

## 0.1.0 — 2026-08-16

- Initial permanent plugin scaffold
