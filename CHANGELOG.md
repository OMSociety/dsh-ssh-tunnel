# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh-CN.md)

## 1.0.0 — 2026-09-28

### Changed
- **Declare DSH compatibility metadata.** `package.json` now carries `dsh.manifestVersion: 1`, `engines.dsh: ">=0.1.2-rc.1 <0.2.0"` (the author-declared compatible DSH range, sitting beside `engines.node`, which is raised to `>=20` like current ecosystem plugins), and a `@deepseek-ai/dsh-client-locale` peer over the same range. Since DSH 0.1.7-rc.1 the plugin gate compares `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer ranges against the running runtime (missing peers impose no constraint) — without a DSH peer this plugin passed every host silently. `dsh.manifestVersion` and `engines.dsh` stay declarative, as the manifest spec defines them.

### Fixed
- **`scripts/smoke-test.mjs` now ships in the packed install.** `npm test` / `npm run check` run it, but the `files` allowlist omitted it, so any install from the packed artifact failed with `MODULE_NOT_FOUND` and the declared self-check could not run at all. `scripts/portal-probe.mjs` and `scripts/sync-to-dsh.sh` are shipped alongside it, following the same packaging strategy as `dsh-git-forge` (every script under `scripts/` goes into the tarball).

- **The local-path guard now works on hosts whose workspace is not `/workspace`.** `isPathInsideRoots` compared a `root + '/'` prefix against platform-native keys (separator- and case-sensitive), so on Windows even `C:\ws\child` inside `C:\ws` was judged outside; `constrainToWorkspace` additionally hard-coded `/workspace`, so real workspace paths were rejected wherever it guards (SFTP `local_path` handling and the local file APIs). Containment is now judged on a separator-unified, Win32-case-folded comparison form, and the guard root still defaults to `/workspace` but can be pointed at the real workspace with `DSH_SSH_TUNNEL_WORKSPACE_ROOT`.
- **Smoke tests are platform-portable and hermetic.** The fixtures hard-coded POSIX paths — 9 tests fail on a Windows checkout with dependencies installed, covering path containment, session-to-project matching (raw fixture keys vs `normalizeProjectKey` on the production side), and the symlink escape case (its fixture directory did not exist). The suite now derives expectations through `normalizeProjectKey`, runs the path guard against a throwaway root, and skips the symlink case gracefully where symlink creation is unavailable.

## 0.4.6 — 2026-09-15

### Fixed
- **Terminal no longer fails with "无法加载 xterm".** `require("@xterm/xterm")` is unresolvable in the DSH browser module table (only platform seeds and registered plugin rows answer), and the 0.4.4 removal of the jsDelivr fallback left no working path. The plugin now pins `@xterm/xterm@5.5.0` + `@xterm/addon-fit@0.11.0` as runtime dependencies and serves their UMD/CSS from a same-origin allowlisted route (`/dsh-ssh-tunnel/vendor/*`); the client loads them with plain `<script>`/`<link>` tags, with the old module-table path kept only as a fallback. No third-party CDN is ever fetched.

### Security
- **Vendor route is allowlisted.** `/dsh-ssh-tunnel/vendor/*` resolves exactly three asset names; anything else (including path traversal) is a 404 sent without touching the filesystem path.

## 0.4.5 — 2026-09-09

### Removed
- **Keyboard-interactive auth is no longer offered.** Bastion/MFA hosts that only work inside a vendor web/client cannot be bound here. The sidebar auth dropdown is password or private key only. Existing `keyboardInteractive` host records are kept on disk but Connect, save-as-KBI, reconnect, and `SSHManager` all fail with a message to switch the host to password or private key (`credential=unsupported`).

## 0.4.4 — 2026-09-09

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

## 0.4.3 — 2026-09-08

### Security
- **Result gate for in-flight operations.** If a host's project grant is revoked while an `SSHManager` operation (exec / read_session / sftp_list / sftp_stat / sftp_read_text / sftp_download) is running, the result is re-validated right before delivery: output from the revoked host is discarded and the call fails with `not authorized`.
- **`sftp_download` never leaves data behind after a revocation.** If the grant is revoked during or after a pull, the locally written file is removed (even a partially written one on a mid-transfer failure) and the result is refused.

### Fixed
- **Terminal panel no longer silently polls a dead session.** When a session is closed or its host grant revoked while the terminal is open, the client stops polling and shows `Session disconnected` instead of hammering the server every 120ms with no feedback.

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
