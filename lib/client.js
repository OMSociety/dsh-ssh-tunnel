window.__ModuleLoader__.load({
	id: "dsh-ssh-tunnel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// Lazy react-dom resolver (same module loader registry as react).
		// Only needed for the body portal in CenterOverlay; optional on purpose.
		let ReactDOMRef;
		function getReactDOM() {
			if (ReactDOMRef !== undefined) return ReactDOMRef;
			try { ReactDOMRef = require("react-dom"); } catch (e) { ReactDOMRef = null; }
			return ReactDOMRef;
		}

		// --- i18n (same pattern as dsh-better-sidebar) ---
		const LOCALE_NS = "sshTunnel";
		const zh = {
			tabTitle: "SSH 隧道",
			projectLabel: "项目: {path}",
			projectUnbound: "(未绑定)",
			refresh: "刷新",
			tabGrants: "项目授权",
			tabHosts: "主机库",
			tabTunnel: "隧道会话",
			needConfirm: "需要确认",
			trustConnect: "信任并连接",
			dismissPrompt: "不信任",
			promptKeyUnknown: "未知主机指纹",
			promptKeyChanged: "主机指纹已变更",
			promptFpNew: "新指纹",
			promptFpOld: "原指纹",
			trustedNotConnected: "已保存信任，但未发起连接：",
			grantsHint: "勾选后，当前项目下的对话可通过 SSHManager 与隧道使用这些主机。连接前须先完成项目授权（不会在连接时自动授权）。",
			saveGrants: "保存项目授权",
			newHost: "新建主机",
			scanOpenSsh: "扫描 OpenSSH",
			edit: "编辑",
			delete: "删除",
			deleteHostConfirm: "确定删除主机「{name}」？此操作不可撤销。",
			import: "导入",
			name: "名称 / 别名",
			host: "Host",
			port: "Port",
			username: "Username",
			authType: "认证方式",
			authPrivateKey: "私钥",
			authPassword: "密码",
			privateKeyPath: "私钥路径",
			privateKeyPem: "或粘贴 PEM",
			passphrase: "私钥口令",
			password: "密码",
			save: "保存",
			back: "返回",
			sftpOnConnect: "连接时启用 SFTP",
			connectSection: "连接",
			connect: "连接",
			needHostKey: "需要在提示中信任 host key",
			sessionsSection: "会话（终端 / SFTP 在中央打开）",
			noSessions: "暂无会话",
			terminal: "终端",
			sftp: "SFTP",
			disconnect: "断开",
			reconnect: "重连",
			reconnecting: "重连中 ({attempt}/{max})",
			disconnected: "已断开",
			connected: "已连接",
			sessionDropped: "会话已断开",
			kbiUnsupported: "不支持键盘交互登录，请编辑主机改为密码或私钥",
			kbiEditNotice: "该主机原为键盘交互认证，此方式已不再支持；请改选密码或私钥并重新输入凭据。",
			closeSession: "关闭",
			footerHint: "连接与授权在此侧栏；终端与 SFTP 在中央面板打开。",
			bashTitle: "SSH 终端 · {name}",
			close: "关闭",
			bash: "Bash",
			bashStatusReady: "connected · 直接在终端内输入，Ctrl+C 等快捷键可用",
			bashStatusLoading: "loading",
			bashStatusError: "error",
			xtermLoadFailed: "无法加载 xterm",
			transferring: "传输中…",
			transferSkipped: "传输完成，跳过 {count} 个目录",
			mkdirTitle: "新建文件夹",
			mkdirLocation: "位置：{path}",
			mkdirPlaceholder: "文件夹名称",
			create: "创建",
			renameTitle: "重命名",
			confirmDeleteTitle: "确认删除",
			confirmDeleteDesc: "将删除 {count} 项，此操作可能不可恢复。",
			copiedPath: "已复制路径",
			pathTitle: "路径",
			localProject: "本地项目",
			remoteDevice: "远端设备",
			parentDir: "上级",
			upload: "上传 →",
			download: "← 下载",
			sftpHint: "多选: Ctrl/⌘ 点击 · Shift 范围 · 拖拽跨栏传输 · 右键菜单",
			open: "打开",
			uploadToRemote: "上传到远端",
			downloadToLocal: "下载到本地",
			newFolder: "新建文件夹",
			rename: "重命名",
			copyPath: "复制路径",
			ok: "确定",
			cancel: "取消",
			gotIt: "好的",
		};
		const en = {
			tabTitle: "SSH Tunnel",
			projectLabel: "Project: {path}",
			projectUnbound: "(not bound)",
			refresh: "Refresh",
			tabGrants: "Project access",
			tabHosts: "Hosts",
			tabTunnel: "Sessions",
			needConfirm: "Confirmation needed",
			trustConnect: "Trust and connect",
			dismissPrompt: "Dismiss",
			promptKeyUnknown: "Unknown host key",
			promptKeyChanged: "Host key changed",
			promptFpNew: "New fingerprint",
			promptFpOld: "Previous fingerprint",
			trustedNotConnected: "Trust saved, but the connection was not attempted:",
			grantsHint: "Checked hosts can be used by SSHManager and the tunnel for this project. Grant access before connecting (connect does not auto-authorize).",
			saveGrants: "Save project access",
			newHost: "New host",
			scanOpenSsh: "Scan OpenSSH",
			edit: "Edit",
			delete: "Delete",
			deleteHostConfirm: "Delete host \"{name}\"? This cannot be undone.",
			import: "Import",
			name: "Name / alias",
			host: "Host",
			port: "Port",
			username: "Username",
			authType: "Authentication",
			authPrivateKey: "Private key",
			authPassword: "Password",
			privateKeyPath: "Private key path",
			privateKeyPem: "Or paste PEM",
			passphrase: "Key passphrase",
			password: "Password",
			save: "Save",
			back: "Back",
			sftpOnConnect: "Enable SFTP on connect",
			connectSection: "Connect",
			connect: "Connect",
			needHostKey: "Trust the host key in the prompt first",
			sessionsSection: "Sessions (terminal / SFTP open in the center)",
			noSessions: "No sessions",
			terminal: "Terminal",
			sftp: "SFTP",
			disconnect: "Disconnect",
			reconnect: "Reconnect",
			reconnecting: "Reconnecting ({attempt}/{max})",
			disconnected: "Disconnected",
			connected: "Connected",
			sessionDropped: "Session disconnected",
			kbiUnsupported: "Keyboard-interactive auth is not supported; edit the host to password or private key",
			kbiEditNotice: "This host used keyboard-interactive auth, which is no longer supported. Pick password or private key and re-enter the credential.",
			closeSession: "Close",
			footerHint: "Use this sidebar for connect and access; terminal and SFTP open in the center panel.",
			bashTitle: "SSH terminal · {name}",
			close: "Close",
			bash: "Bash",
			bashStatusReady: "connected · type directly in the terminal (Ctrl+C etc.)",
			bashStatusLoading: "loading",
			bashStatusError: "error",
			xtermLoadFailed: "Failed to load xterm",
			transferring: "Transferring…",
			transferSkipped: "Transfer finished; {count} skipped",
			mkdirTitle: "New folder",
			mkdirLocation: "Location: {path}",
			mkdirPlaceholder: "Folder name",
			create: "Create",
			renameTitle: "Rename",
			confirmDeleteTitle: "Confirm delete",
			confirmDeleteDesc: "Delete {count} item(s)? This may not be recoverable.",
			copiedPath: "Path copied",
			pathTitle: "Path",
			localProject: "Local project",
			remoteDevice: "Remote",
			parentDir: "Up",
			upload: "Upload →",
			download: "← Download",
			sftpHint: "Multi-select: Ctrl/⌘ click · Shift range · drag across panes · right-click menu",
			open: "Open",
			uploadToRemote: "Upload to remote",
			downloadToLocal: "Download to local",
			newFolder: "New folder",
			rename: "Rename",
			copyPath: "Copy path",
			ok: "OK",
			cancel: "Cancel",
			gotIt: "OK",
		};
		let localeService;
		function attachLocale(service) {
			localeService = service;
		}
		function activeLocale() {
			const fromSvc = localeService && localeService.getSnapshot ? localeService.getSnapshot().active : undefined;
			const raw = fromSvc || (typeof navigator !== "undefined" ? navigator.language : "") || "en";
			return String(raw);
		}
		function isZh() {
			return activeLocale().toLowerCase().startsWith("zh");
		}
		/** Translate a copy key; `{name}` placeholders from params (better-sidebar style). */
		function t(key, params) {
			const dict = isZh() ? zh : en;
			let text = dict[key];
			if (text === undefined) text = en[key] || zh[key] || key;
			if (params !== undefined && params !== null) {
				for (const [name, value] of Object.entries(params)) {
					text = String(text).split("{" + name + "}").join(String(value));
				}
			}
			return text;
		}

		const TAB_ID = "dsh-ssh-tunnel";
		const API = "/dsh-ssh-tunnel/api";

		// Errors carry the structured fields the host sends: `code` (API_ERROR_STATUS
		// semantic) and `data` (full parsed body) so callers can react to
		// interactive states (e.g. a host-key prompt arrives as 200 + ok:false +
		// promptId) instead of parsing message strings.
		async function api(method, body) {
			const response = await fetch(API + "/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body || {}),
			});
			const text = await response.text();
			let data;
			try { data = text ? JSON.parse(text) : {}; }
			catch (e) { throw new Error("bad JSON (" + response.status + "): " + text.slice(0, 200)); }
			const failed = !response.ok || (data && data.ok === false);
			if (failed) {
				const err = new Error(String((data && data.error) || ("HTTP " + response.status)));
				if (data && data.code) err.code = String(data.code);
				err.data = data;
				throw err;
			}
			return data;
		}

		// Injected vendor nodes are tracked so the caller's effect disposer can
		// remove them again (no permanent <head> growth on plugin reload).
		let xtermPromise = null;
		const injectedVendor = [];
		function loadScript(src) {
			return new Promise(function (resolve, reject) {
				const s = document.createElement("script");
				s.src = src;
				s.async = true;
				s.onload = function () { resolve(); };
				s.onerror = function () { s.remove(); reject(new Error("load fail " + src)); };
				injectedVendor.push(s);
				document.head.appendChild(s);
			});
		}
		function loadCssOnce(href) {
			if (document.querySelector('link[data-ssh-t="' + href + '"]')) return;
			const l = document.createElement("link");
			l.rel = "stylesheet";
			l.href = href;
			l.setAttribute("data-ssh-t", href);
			injectedVendor.push(l);
			document.head.appendChild(l);
		}
		// Vendor assets are same-origin files served by this plugin's host route
		// (/dsh-ssh-tunnel/vendor/*). No CDN, no module-table dependency, and no
		// require("@xterm/*") fallback — the module table never carries xterm, so
		// that branch was dead code. A failed load retries on the next open
		// (xtermPromise is reset below) instead of caching the failure forever.
		async function ensureXterm() {
			if (xtermPromise) return xtermPromise;
			xtermPromise = (async function () {
				try {
					if (typeof document !== "undefined") {
						loadCssOnce("/dsh-ssh-tunnel/vendor/xterm.css");
						await loadScript("/dsh-ssh-tunnel/vendor/xterm.js");
						await loadScript("/dsh-ssh-tunnel/vendor/addon-fit.js");
					}
					const Terminal = globalThis.Terminal || null;
					const FitAddon = (globalThis.FitAddon && globalThis.FitAddon.FitAddon) || globalThis.FitAddon || null;
					if (!Terminal) throw new Error(t("xtermLoadFailed"));
					return { Terminal: Terminal, FitAddon: FitAddon, disposeVendor: disposeVendor };
				} catch (e) {
					xtermPromise = null; // allow a retry on the next open
					throw e;
				}
			})();
			return xtermPromise;
		}
		function disposeVendor() {
			for (const node of injectedVendor.splice(0)) {
				try { node.remove(); } catch (e) {}
			}
		}

		function icon(size) {
			const s = size || 16;
			// 与包根 icon.svg 同一份图：插件列表磁贴与侧边栏共用同一张标。
			return React.createElement("svg", {
				width: s, height: s, viewBox: "0 0 36 36", fill: "none", "aria-hidden": true,
			},
				React.createElement("defs", null,
					React.createElement("linearGradient", {
						id: "dsh-ssh-tunnel-tab-host", x1: "18", y1: "6", x2: "18", y2: "30",
						gradientUnits: "userSpaceOnUse",
					},
						React.createElement("stop", { stopColor: "#4E6EF2" }),
						React.createElement("stop", { offset: "1", stopColor: "#1434B8" })),
					React.createElement("linearGradient", {
						id: "dsh-ssh-tunnel-tab-flow", x1: "14", y1: "18", x2: "22", y2: "18",
						gradientUnits: "userSpaceOnUse",
					},
						React.createElement("stop", { stopColor: "#5CE1E6" }),
						React.createElement("stop", { offset: "1", stopColor: "#38E298" }))),
				React.createElement("g", { transform: "translate(18 18) scale(1.3) translate(-18 -18)" },
					React.createElement("rect", { x: 7, y: 10, width: 7, height: 16, rx: 2, fill: "url(#dsh-ssh-tunnel-tab-host)" }),
					React.createElement("circle", { cx: 10.5, cy: 14, r: 1, fill: "#5CE1E6" }),
					React.createElement("circle", { cx: 10.5, cy: 18, r: 1, fill: "#FFFFFF", fillOpacity: 0.8 }),
					React.createElement("rect", { x: 22, y: 10, width: 7, height: 16, rx: 2, fill: "url(#dsh-ssh-tunnel-tab-host)" }),
					React.createElement("circle", { cx: 25.5, cy: 14, r: 1, fill: "#5CE1E6" }),
					React.createElement("circle", { cx: 25.5, cy: 18, r: 1, fill: "#FFFFFF", fillOpacity: 0.8 }),
					React.createElement("path", { d: "M14 15.5H22", stroke: "url(#dsh-ssh-tunnel-tab-flow)", strokeWidth: 2.2, strokeLinecap: "round" }),
					React.createElement("path", { d: "M14 20.5H22", stroke: "url(#dsh-ssh-tunnel-tab-flow)", strokeWidth: 2.2, strokeLinecap: "round" }),
					React.createElement("circle", { cx: 18, cy: 15.5, r: 1.3, fill: "#FFFFFF" }),
					React.createElement("circle", { cx: 18, cy: 20.5, r: 1.3, fill: "#FFFFFF" })),
			);
		}

		// Returns a disposer removing the injected <style>; apply() registers it
		// through ctx.effect so a disabled plugin leaves no style rules behind.
		function ensureStyles() {
			if (typeof document === "undefined") return function () {};
			// bump id when theme CSS changes so hard-refresh replaces rules
			const STYLE_ID = "dsh-ssh-tunnel-style-v4";
			const prev = document.getElementById("dsh-ssh-tunnel-style") || document.getElementById("dsh-ssh-tunnel-style-v2") || document.getElementById("dsh-ssh-tunnel-style-v3") || document.getElementById("dsh-ssh-tunnel-style-v4");
			if (prev && prev.id === STYLE_ID && prev.getAttribute("data-rev") === "4") return;
			if (prev) prev.remove();
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.setAttribute("data-rev", "4");
			el.textContent = [
				/* Theme-only surfaces: no hard-coded black/gray panels */
				".ssh-t-root{display:flex;flex-direction:column;gap:14px;padding:14px 14px 18px;height:100%;overflow:auto;font-size:13px;line-height:1.45;color:var(--dsw-alias-label-primary);box-sizing:border-box;background:transparent;}",
				".ssh-t-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px;}",
				".ssh-t-title{font-weight:600;font-size:15px;letter-spacing:-0.01em;color:var(--dsw-alias-label-primary);}",
				".ssh-t-sub{color:var(--dsw-alias-label-secondary);font-size:12px;word-break:break-all;margin-top:3px;opacity:1;}",
				".ssh-t-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:3px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;width:fit-content;}",
				".ssh-t-tab{padding:6px 12px;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;font-weight:500;transition:background var(--ds-transition-duration-slow, .15s) ease,color .15s ease;}",
				".ssh-t-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}",
				".ssh-t-tab.on{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-inverted, #fff);}",
				".ssh-t-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-1);}",
				/* Rows: keep action buttons visible when endpoint (IPv6) is long */
				".ssh-t-row{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px 12px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);}",
				".ssh-t-row:last-child{border-bottom:none;padding-bottom:0;}",
				".ssh-t-row:first-child{padding-top:0;}",
				".ssh-t-row-main{flex:1 1 12rem;min-width:0;max-width:100%;}",
				".ssh-t-row-main strong,.ssh-t-row-main .ssh-t-name{display:block;font-weight:600;overflow-wrap:anywhere;word-break:break-word;}",
				".ssh-t-endpoint{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:2px;overflow-wrap:anywhere;word-break:break-word;line-height:1.4;}",
				".ssh-t-row > .ssh-t-actions{flex:0 0 auto;margin-top:0;margin-left:auto;}",
				".ssh-t-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center;}",
				".ssh-t-check span{min-width:0;flex:1;overflow-wrap:anywhere;word-break:break-word;}",
				".ssh-t-btn{padding:7px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2, transparent);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;font-weight:500;transition:background .15s,border-color .15s;}",
				".ssh-t-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2);}",
				".ssh-t-btn:disabled{opacity:.45;cursor:not-allowed;}",
				".ssh-t-btn.primary{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-label-primary-inverted, #fff);}",
				".ssh-t-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover, var(--dsw-alias-button-primary-fill));}",
				".ssh-t-btn.danger{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);}",
				".ssh-t-btn.danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent);}",
				".ssh-t-field{display:block;margin-bottom:12px;}",
				".ssh-t-label{display:block;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:6px;letter-spacing:0;text-transform:none;}",
				".ssh-t-input,.ssh-t-select,.ssh-t-textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;transition:border-color .15s, box-shadow .15s;}",
				".ssh-t-input:focus,.ssh-t-select:focus,.ssh-t-textarea:focus{border-color:var(--dsw-alias-border-l4, var(--dsw-alias-brand-primary));box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);}",
				".ssh-t-ok{color:var(--dsw-alias-state-success-primary, #3d9a5f);font-size:12px;}",
				".ssh-t-err{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;padding:8px 10px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, transparent);}",
				".ssh-t-muted{color:var(--dsw-alias-label-secondary);font-size:12px;}",
				".ssh-t-check{display:flex;align-items:center;gap:10px;margin:8px 0;cursor:pointer;padding:8px 10px;border-radius:8px;border:1px solid transparent;color:var(--dsw-alias-label-primary);}",
				".ssh-t-check:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1);}",
				".ssh-t-check input{accent-color:var(--dsw-alias-brand-primary);}",
				".ssh-t-prompt{border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 40%, transparent);background:var(--dsw-alias-state-warn-tertiary, color-mix(in srgb, #d97706 12%, transparent));border-radius:12px;padding:12px 14px;color:var(--dsw-alias-label-primary);}",
				/* Overlay follows theme; only terminal canvas stays dark for readability */
				".ssh-ov-root{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb, var(--dsw-alias-bg-base) 35%, rgba(0,0,0,.45));backdrop-filter:blur(6px);}",
				".ssh-ov-panel{display:flex;flex-direction:column;position:relative;width:min(1180px,100%);height:min(840px,100%);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 18px 50px color-mix(in srgb, #000 35%, transparent);overflow:hidden;}",
				".ssh-ov-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;}",
				".ssh-ov-bar .ssh-t-title{flex:1;min-width:0;font-size:14px;color:var(--dsw-alias-label-primary);}",
				".ssh-ov-tabs{display:flex;gap:4px;flex:none;padding:3px;background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));border-radius:999px;border:1px solid var(--dsw-alias-border-l1);}",
				".ssh-ov-tabs button{padding:5px 12px;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;font-weight:500;}",
				".ssh-ov-tabs button.on{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-inverted, #fff);}",
				".ssh-ov-body{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);}",
				".ssh-ov-xterm{flex:1;min-height:0;padding:10px;background:#0b0f14;}",
				".ssh-ov-xterm .xterm,.ssh-ov-xterm .xterm-viewport{height:100%;}",
				".ssh-sftp{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);}",
				".ssh-sftp-panes{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:0;}",
				".ssh-sftp-pane{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);}",
				".ssh-sftp-pane:last-child{border-right:none;}",
				".ssh-sftp-pane-hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;background:var(--dsw-alias-bg-layer-1);}",
				".ssh-sftp-pane-hd strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);min-width:64px;}",
				".ssh-sftp-pane-hd input{flex:1;min-width:80px;}",
				".ssh-sftp-list{flex:1;min-height:0;overflow:auto;user-select:none;padding:6px;background:var(--dsw-alias-bg-base);}",
				".ssh-sftp-item{display:flex;align-items:center;gap:10px;padding:8px 10px;font-size:12px;cursor:default;border-radius:8px;margin-bottom:2px;color:var(--dsw-alias-label-primary);}",
				".ssh-sftp-item:hover{background:var(--dsw-alias-interactive-bg-hover);}",
				".ssh-sftp-item.sel{background:var(--dsw-alias-interactive-bg-active, color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent));outline:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent);}",
				".ssh-sftp-item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
				".ssh-sftp-item .sz{color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums;font-size:11px;}",
				".ssh-ctx{position:fixed;z-index:13000;min-width:190px;background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:6px;box-shadow:0 12px 32px color-mix(in srgb, #000 25%, transparent);}",
				".ssh-ctx button{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;border-radius:6px;}",
				".ssh-ctx button:hover{background:var(--dsw-alias-interactive-bg-hover);}",
				".ssh-ctx button.danger{color:var(--dsw-alias-state-error-primary);}",
				".ssh-ctx hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:4px 0;}",
				".ssh-modal-root{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:20px;background:color-mix(in srgb, var(--dsw-alias-bg-base) 30%, rgba(0,0,0,.35));}",".ssh-modal{width:min(400px,100%);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 16px 40px color-mix(in srgb,#000 28%,transparent);padding:16px 16px 14px;}",".ssh-modal-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 6px;}",".ssh-modal-desc{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 12px;line-height:1.45;word-break:break-all;}",".ssh-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}",".ssh-status{padding:7px 14px;font-size:11px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;}",
			].join("\n");
			document.head.appendChild(el);
			return function () {
				try { el.remove(); } catch (e) {}
			};
		}

function Btn(props) {
			const cls = "ssh-t-btn" + (props.primary ? " primary" : "") + (props.danger ? " danger" : "");
			return React.createElement("button", { type: "button", className: cls, disabled: props.disabled, onClick: props.onClick }, props.children);
		}
		function Field(props) {
			return React.createElement("label", { className: "ssh-t-field" },
				React.createElement("span", { className: "ssh-t-label" }, props.label), props.children);
		}
		function emptyForm() {
			return { id: "", name: "", host: "", port: 22, username: "", authType: "privateKey", privateKeyPath: "", password: "", privateKeyPem: "", passphrase: "" };
		}
		// Paths are dual-flavor: remote SFTP paths are POSIX, local paths on
		// Windows carry backslashes. Split/join detect the flavor per path
		// instead of assuming "/" everywhere (C-01).
		function splitPath(p) {
			return String(p || "").split(/[\\/]+/).filter(Boolean);
		}
		function parentOf(p) {
			const parts = splitPath(p);
			if (parts.length <= 1) {
				// "C:\" style drive roots and "/" both have no parent
				return /^[A-Za-z]:[\\/]?$/.test(String(p || "")) ? String(p) : "/";
			}
			const head = parts.slice(0, -1).join(p.indexOf("\\") >= 0 ? "\\" : "/");
			// preserve the drive prefix ("C:" + "\x")
			if (/^[A-Za-z]:$/.test(head)) return head + (p.indexOf("\\") >= 0 ? "\\" : "/");
			return head || "/";
		}
		function joinPath(base, name) {
			if (!base) return name;
			const sep = String(base).indexOf("\\") >= 0 ? "\\" : "/";
			if (base === "/" || /^[A-Za-z]:[\\/]?$/.test(String(base))) return base.replace(/[\\/]?$/, sep) + name;
			return String(base).replace(/[\\/]+$/, "") + sep + name;
		}
		function formatSize(n) {
			n = Number(n) || 0;
			if (n < 1024) return n + " B";
			if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " K";
			return (n / (1024 * 1024)).toFixed(1) + " M";
		}


		/** In-panel dialog (replaces window.prompt / confirm). */
		function TextDialog(props) {
			const open = props.open;
			const title = props.title || "";
			const description = props.description || "";
			const mode = props.mode || "prompt"; // prompt | confirm | alert
			const confirmLabel = props.confirmLabel || (mode === "confirm" ? t("ok") : mode === "alert" ? t("gotIt") : t("ok"));
			const cancelLabel = props.cancelLabel || t("cancel");
			const danger = !!props.danger;
			const [value, setValue] = React.useState(props.defaultValue || "");
			const inputRef = React.useRef(null);
			React.useEffect(function () {
				if (!open) return;
				setValue(props.defaultValue || "");
				const t = setTimeout(function () {
					if (inputRef.current) {
						inputRef.current.focus();
						inputRef.current.select && inputRef.current.select();
					}
				}, 30);
				return function () { clearTimeout(t); };
			}, [open, props.defaultValue, props.token]);
			if (!open) return null;
			function submit() {
				if (mode === "prompt") props.onConfirm && props.onConfirm(value);
				else props.onConfirm && props.onConfirm(true);
			}
			function cancel() {
				props.onCancel && props.onCancel();
			}
			return React.createElement("div", {
				className: "ssh-modal-root",
				onMouseDown: function (e) {
					if (e.target === e.currentTarget) cancel();
				},
			},
				React.createElement("div", {
					className: "ssh-modal",
					role: "dialog",
					"aria-modal": "true",
					onMouseDown: function (e) { e.stopPropagation(); },
				},
					React.createElement("div", { className: "ssh-modal-title" }, title),
					description ? React.createElement("div", { className: "ssh-modal-desc" }, description) : null,
					mode === "prompt"
						? React.createElement("input", {
							ref: inputRef,
							className: "ssh-t-input",
							value: value,
							placeholder: props.placeholder || "",
							onChange: function (e) { setValue(e.target.value); },
							onKeyDown: function (e) {
								if (e.key === "Enter") submit();
								if (e.key === "Escape") cancel();
							},
						})
						: null,
					React.createElement("div", { className: "ssh-modal-actions" },
						mode !== "alert"
							? React.createElement(Btn, { onClick: cancel }, cancelLabel)
							: null,
						React.createElement(Btn, {
							primary: !danger,
							danger: danger,
							onClick: submit,
						}, confirmLabel),
					),
				),
			);
		}


		/** Full-screen center overlay host */
		function CenterOverlay(props) {
			const rootEl = React.createElement("div", {
				className: "ssh-ov-root",
				onMouseDown: function (e) {
					if (e.target === e.currentTarget && props.onClose) props.onClose();
				},
			}, React.createElement("div", { className: "ssh-ov-panel", role: "dialog", "aria-modal": "true" }, props.children));
			// Portal to <body>: the overlay relies on position:fixed being
			// viewport-relative. better-sidebar >=0.16 gives its panel
			// containers `contain: layout` (and panels animate with transform),
			// which makes them the containing block for fixed descendants — an
			// inline-rendered overlay would then be trapped inside the narrow
			// sidebar instead of covering the screen. Portaling removes that
			// dependency; fall back to inline rendering if react-dom is absent.
			const rd = getReactDOM();
			if (rd && typeof rd.createPortal === "function" && typeof document !== "undefined" && document.body) {
				return rd.createPortal(rootEl, document.body);
			}
			return rootEl;
		}

		/** LA-like SSH terminal: xterm fills center, type directly */
		function CenterBash(props) {
			const { sessionId, projectPathKey, title, onClose, onOpenSftp } = props;
			const hostRef = React.useRef(null);
			const termRef = React.useRef(null);
			const fitRef = React.useRef(null);
			// Cursor into the host's {text,seq} chunk log: the last seq we rendered.
			const sinceRef = React.useRef(0);
			const [err, setErr] = React.useState("");
			const [status, setStatus] = React.useState("loading");

			React.useEffect(function () {
				let cancelled = false;
				let timer = null;
				let ro = null;
				let pollDelay = 120;
				let inFlight = false;
				// Terminal conditions carry structured codes from the host
				// (API_ERROR_STATUS): the session was closed, expired, or its host
				// grant was revoked. Everything else is transient: show it and
				// back off instead of hammering a sick session every 120ms.
				const isTerminalCode = function (e) {
					return !!e && (e.code === "not_found" || e.code === "gone" || e.code === "forbidden");
				};
				const poll = async function () {
					if (cancelled || !termRef.current || inFlight) return;
					inFlight = true;
					try {
						const r = await api("shellRead", {
							sessionId, projectPathKey, since: sinceRef.current,
						});
						if (cancelled || !termRef.current) return;
						if (r.dropped) {
							// Ring eviction swallowed output between our cursor and the
							// retained base — a plain chunk would silently skip lines.
							// Repaint from the retained base instead.
							const resync = await api("shellRead", {
								sessionId, projectPathKey, since: Math.max(0, (r.baseSeq || 1) - 1),
							});
							if (cancelled || !termRef.current) return;
							try { termRef.current.clear(); } catch (e) {}
							if (resync.chunk) termRef.current.write(resync.chunk);
							sinceRef.current = resync.since != null ? resync.since : sinceRef.current;
						} else {
							if (r.chunk) termRef.current.write(r.chunk);
							// Cursor = last seq actually delivered (`since`), not the
							// buffer tail (`seq`): a chunkTruncated response continues
							// from where this chunk stopped.
							if (r.since != null) sinceRef.current = r.since;
							else if (r.seq != null) sinceRef.current = r.seq;
							if (r.chunkTruncated) console.debug("[dsh-ssh-tunnel] shell chunk hit the 256KiB cap; continuing next tick");
						}
						setErr("");
						pollDelay = 120;
					} catch (e) {
						if (cancelled) return;
						const msg = String(e && e.message ? e.message : e);
						if (isTerminalCode(e)) {
							stopPolling();
							setErr(msg);
							setStatus("dropped");
							return;
						}
						setErr(msg);
						pollDelay = Math.min(pollDelay * 2, 2000);
					} finally {
						inFlight = false;
					}
					if (!cancelled) timer = setTimeout(poll, pollDelay);
				};
				const stopPolling = function () {
					if (timer) { clearTimeout(timer); timer = null; }
				};
				(async function () {
					try {
						const mods = await ensureXterm();
						if (cancelled || !hostRef.current) return;
						if (!mods.Terminal) throw new Error(t("xtermLoadFailed"));
						// disposeVendor on a previous close removed the stylesheet and
						// the cached ensureXterm() promise never re-runs loadCssOnce —
						// re-attach it here (idempotent via the data-ssh-t marker).
						if (typeof document !== "undefined") loadCssOnce("/dsh-ssh-tunnel/vendor/xterm.css");
						// First frame comes from shellOpen itself (it returns the whole
						// buffer plus the seq cursor) — no second full-buffer fetch.
						const open = await api("shellOpen", { sessionId, projectPathKey });
						if (cancelled || !hostRef.current) return;
						const term = new mods.Terminal({
							cursorBlink: true,
							fontSize: 14,
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
							theme: { background: "#0b0f14", foreground: "#d7e0ea", cursor: "#d7e0ea" },
							convertEol: true,
							scrollback: 5000,
						});
						let fit = null;
						if (mods.FitAddon) {
							fit = new mods.FitAddon();
							term.loadAddon(fit);
						}
						term.open(hostRef.current);
						if (fit) { try { fit.fit(); } catch (e) {} }
						term.focus();
						termRef.current = term;
						fitRef.current = fit;
						if (open.output) term.write(open.output);
						sinceRef.current = open.seq != null ? open.seq : 0;
						term.onData(function (data) {
							api("shellWrite", { sessionId, projectPathKey, data: data }).catch(function (e) {
								setErr(String(e && e.message ? e.message : e));
							});
						});
						const sendSize = function () {
							try {
								if (fitRef.current) fitRef.current.fit();
							} catch (e) {}
							if (!termRef.current) return;
							api("shellResize", {
								sessionId, projectPathKey,
								cols: termRef.current.cols,
								rows: termRef.current.rows,
							}).catch(function () {});
						};
						sendSize();
						if (typeof ResizeObserver !== "undefined" && hostRef.current) {
							ro = new ResizeObserver(sendSize);
							ro.observe(hostRef.current);
						}
						window.addEventListener("resize", sendSize);
						termRef.current._onWin = sendSize;
						termRef.current._vendorDispose = mods.disposeVendor;
						setStatus("connected");
						timer = setTimeout(poll, pollDelay);
					} catch (e) {
						if (!cancelled) {
							const msg = String(e && e.message ? e.message : e);
							setErr(msg);
							setStatus(isTerminalCode(e) || /not running|disconnected/i.test(msg) ? "dropped" : "error");
						}
					}
				})();
				return function () {
					cancelled = true;
					stopPolling();
					if (ro) try { ro.disconnect(); } catch (e) {}
					if (termRef.current) {
						if (termRef.current._onWin) window.removeEventListener("resize", termRef.current._onWin);
						if (termRef.current._vendorDispose) try { termRef.current._vendorDispose(); } catch (e) {}
						try { termRef.current.dispose(); } catch (e) {}
						termRef.current = null;
					}
				};
			}, [sessionId, projectPathKey]);

			return React.createElement(CenterOverlay, { onClose: onClose },
				React.createElement("div", { className: "ssh-ov-bar" },
					React.createElement("div", { className: "ssh-t-title" }, t("bashTitle", { name: title || sessionId.slice(0, 8) })),
					React.createElement("div", { className: "ssh-ov-tabs" },
						React.createElement("button", { type: "button", className: "on" }, t("bash")),
						React.createElement("button", { type: "button", onClick: onOpenSftp }, t("sftp")),
					),
					React.createElement(Btn, { onClick: onClose }, t("close")),
				),
				React.createElement("div", { className: "ssh-ov-body" },
					React.createElement("div", { className: "ssh-ov-xterm", ref: hostRef }),
				),
				React.createElement("div", { className: "ssh-status" }, (status === "connected" ? t("bashStatusReady") : status === "loading" ? t("bashStatusLoading") : status === "dropped" ? t("sessionDropped") : t("bashStatusError")) + (err ? " · " + err : "")),
			);
		}

		function FileList(props) {
			const { entries, selected, onSelect, onActivate, onContext } = props;
			return React.createElement("div", { className: "ssh-sftp-list", onContextMenu: function (e) {
				// empty area
				if (e.target === e.currentTarget) {
					e.preventDefault();
					onContext && onContext(e, null);
				}
			} },
				entries.map(function (ent) {
					const sel = selected.indexOf(ent.path) >= 0;
					return React.createElement("div", {
						key: ent.path,
						className: "ssh-sftp-item" + (sel ? " sel" : ""),
						onClick: function (e) { onSelect(ent, e); },
						onDoubleClick: function () { onActivate(ent); },
						onContextMenu: function (e) {
							e.preventDefault();
							e.stopPropagation();
							onContext && onContext(e, ent);
						},
						draggable: true,
						onDragStart: function (e) {
							const paths = selected.indexOf(ent.path) >= 0 ? selected : [ent.path];
							e.dataTransfer.setData("application/x-dsh-sftp", JSON.stringify({
								side: props.side,
								paths: paths,
							}));
							e.dataTransfer.effectAllowed = "copyMove";
						},
					},
						React.createElement("span", null, ent.isDirectory ? "📁" : "📄"),
						React.createElement("span", { className: "nm" }, ent.name),
						React.createElement("span", { className: "sz" }, ent.isDirectory ? "" : formatSize(ent.size)),
					);
				}),
			);
		}

		/** LA-like dual-pane SFTP */
		function CenterSftp(props) {
			const { sessionId, projectPathKey, title, onClose, onOpenBash } = props;
			const [localPath, setLocalPath] = React.useState(projectPathKey || "");
			const [remotePath, setRemotePath] = React.useState("/");
			const [localEntries, setLocalEntries] = React.useState([]);
			const [remoteEntries, setRemoteEntries] = React.useState([]);
			const [localSel, setLocalSel] = React.useState([]);
			const [remoteSel, setRemoteSel] = React.useState([]);
			const [status, setStatus] = React.useState("");
			const [err, setErr] = React.useState("");
			const [ctx, setCtx] = React.useState(null); // {x,y,side,entry|null}
			const [dialog, setDialog] = React.useState(null); // in-panel modal config
			const dialogToken = React.useRef(0);
			const localAnchor = React.useRef(null);
			const remoteAnchor = React.useRef(null);

			function openDialog(cfg) {
				dialogToken.current += 1;
				return new Promise(function (resolve) {
					setDialog(Object.assign({}, cfg, {
						token: dialogToken.current,
						_resolve: resolve,
					}));
				});
			}
			function finishDialog(result) {
				setDialog(function (cur) {
					if (cur && cur._resolve) cur._resolve(result);
					return null;
				});
			}
			function askText(opts) {
				return openDialog({
					mode: "prompt",
					title: opts.title,
					description: opts.description || "",
					defaultValue: opts.defaultValue || "",
					placeholder: opts.placeholder || "",
					confirmLabel: opts.confirmLabel || t("ok"),
				}).then(function (v) {
					if (v == null) return null;
					const s = String(v).trim();
					return s ? s : null;
				});
			}
			function askConfirm(opts) {
				return openDialog({
					mode: "confirm",
					title: opts.title,
					description: opts.description || "",
					confirmLabel: opts.confirmLabel || t("ok"),
					danger: !!opts.danger,
				}).then(function (v) { return !!v; });
			}
			function askAlert(opts) {
				return openDialog({
					mode: "alert",
					title: opts.title,
					description: opts.description || "",
					confirmLabel: opts.confirmLabel || t("gotIt"),
				});
			}

			const refreshLocal = React.useCallback(async function (p) {
				const path = p != null ? p : localPath;
				const r = await api("localList", { projectPathKey, path: path });
				setLocalPath(r.path);
				setLocalEntries(r.entries || []);
				setLocalSel([]);
			}, [localPath, projectPathKey]);

			const refreshRemote = React.useCallback(async function (p) {
				const path = p != null ? p : remotePath;
				const r = await api("sftpList", { sessionId, projectPathKey, path: path });
				setRemotePath(r.path || path);
				setRemoteEntries(r.entries || []);
				setRemoteSel([]);
			}, [remotePath, sessionId, projectPathKey]);

			React.useEffect(function () {
				refreshLocal(projectPathKey || "").catch(function (e) {
					setErr(String(e && e.message ? e.message : e));
				});
				refreshRemote("/").catch(function (e) {
					const msg = String(e && e.message ? e.message : e);
					setErr(/not running|disconnected/i.test(msg) ? t("sessionDropped") + " · " + msg : msg);
				});
			}, [sessionId, projectPathKey]); // eslint-disable-line

			function selectHandler(side) {
				return function (ent, e) {
					const list = side === "local" ? localEntries : remoteEntries;
					const setSel = side === "local" ? setLocalSel : setRemoteSel;
					const sel = side === "local" ? localSel : remoteSel;
					const anchorRef = side === "local" ? localAnchor : remoteAnchor;
					if (e.shiftKey && anchorRef.current) {
						const paths = list.map(function (x) { return x.path; });
						const a = paths.indexOf(anchorRef.current);
						const b = paths.indexOf(ent.path);
						if (a >= 0 && b >= 0) {
							const lo = Math.min(a, b), hi = Math.max(a, b);
							setSel(paths.slice(lo, hi + 1));
							return;
						}
					}
					if (e.metaKey || e.ctrlKey) {
						if (sel.indexOf(ent.path) >= 0) setSel(sel.filter(function (p) { return p !== ent.path; }));
						else setSel(sel.concat([ent.path]));
						anchorRef.current = ent.path;
						return;
					}
					setSel([ent.path]);
					anchorRef.current = ent.path;
				};
			}

			function activate(side) {
				return function (ent) {
					if (ent.isDirectory) {
						if (side === "local") refreshLocal(ent.path).catch(function (e) { setErr(String(e.message || e)); });
						else refreshRemote(ent.path).catch(function (e) { setErr(String(e.message || e)); });
					}
				};
			}

			async function transfer(direction, paths) {
				// direction: 'upload' local->remote, 'download' remote->local
				setErr("");
				setStatus(t("transferring"));
				let skipped = 0;
				try {
					for (let i = 0; i < paths.length; i++) {
						const src = paths[i];
						const name = splitPath(src).pop();
						if (direction === "upload") {
							// skip dirs for v1 simple file upload
							const ent = localEntries.find(function (e) { return e.path === src; });
							if (ent && ent.isDirectory) {
								skipped++;
								continue;
							}
							const remote = joinPath(remotePath, name);
							await api("sftpUpload", {
								sessionId, projectPathKey,
								local_path: src,
								remote_path: remote,
							});
						} else {
							const ent = remoteEntries.find(function (e) { return e.path === src; });
							if (ent && ent.isDirectory) {
								skipped++;
								continue;
							}
							const local = joinPath(localPath, name);
							await api("sftpDownload", {
								sessionId, projectPathKey,
								remote_path: src,
								local_path: local,
							});
						}
					}
					await refreshLocal(localPath);
					await refreshRemote(remotePath);
					// C-09: a skipped directory used to overwrite the status with a
					// per-item line and vanish; surface it as a final summary instead.
					setStatus(skipped > 0 ? t("transferSkipped", { count: skipped }) : "");
				} catch (e) {
					setErr(String(e && e.message ? e.message : e));
					setStatus("");
				}
			}

			function onDropPane(side) {
				return function (e) {
					e.preventDefault();
					let raw = e.dataTransfer.getData("application/x-dsh-sftp");
					if (!raw) return;
					let payload;
					try { payload = JSON.parse(raw); } catch (err) { return; }
					if (!payload || !payload.paths) return;
					if (payload.side === side) return;
					if (payload.side === "local" && side === "remote") transfer("upload", payload.paths);
					if (payload.side === "remote" && side === "local") transfer("download", payload.paths);
				};
			}

			async function ctxAction(action) {
				if (!ctx) return;
				const side = ctx.side;
				const entry = ctx.entry;
				const sel = side === "local" ? (localSel.length ? localSel : (entry ? [entry.path] : [])) : (remoteSel.length ? remoteSel : (entry ? [entry.path] : []));
				setCtx(null);
				try {
					if (action === "open" && entry) {
						activate(side)(entry);
						return;
					}
					if (action === "upload" && side === "local") {
						await transfer("upload", sel);
						return;
					}
					if (action === "download" && side === "remote") {
						await transfer("download", sel);
						return;
					}
					if (action === "mkdir") {
						const name = await askText({
							title: t("mkdirTitle"),
							description: t("mkdirLocation", { path: side === "local" ? localPath : remotePath }),
							placeholder: t("mkdirPlaceholder"),
							confirmLabel: t("create"),
						});
						if (!name) return;
						if (side === "local") {
							await api("localMkdir", { projectPathKey, path: joinPath(localPath, name) });
							await refreshLocal(localPath);
						} else {
							await api("sftpMkdir", { sessionId, projectPathKey, path: joinPath(remotePath, name) });
							await refreshRemote(remotePath);
						}
						return;
					}
					if (action === "rename" && entry) {
						const name = await askText({
							title: t("renameTitle"),
							description: entry.path,
							defaultValue: entry.name,
							confirmLabel: t("save"),
						});
						if (!name || name === entry.name) return;
						const dest = joinPath(side === "local" ? localPath : remotePath, name);
						if (side === "local") {
							await api("localRename", { projectPathKey, from_path: entry.path, to_path: dest });
							await refreshLocal(localPath);
						} else {
							await api("sftpRename", { sessionId, projectPathKey, from_path: entry.path, to_path: dest });
							await refreshRemote(remotePath);
						}
						return;
					}
					if (action === "delete") {
						if (!sel.length) return;
						const ok = await askConfirm({
							title: t("confirmDeleteTitle"),
							description: t("confirmDeleteDesc", { count: sel.length }),
							confirmLabel: t("delete"),
							danger: true,
						});
						if (!ok) return;
						for (let i = 0; i < sel.length; i++) {
							if (side === "local") await api("localDelete", { projectPathKey, path: sel[i] });
							else await api("sftpDelete", { sessionId, projectPathKey, path: sel[i] });
						}
						if (side === "local") await refreshLocal(localPath);
						else await refreshRemote(remotePath);
						return;
					}
					if (action === "copyPath" && entry) {
						try {
							await navigator.clipboard.writeText(entry.path);
							setStatus(t("copiedPath"));
						} catch (e) {
							await askAlert({ title: t("pathTitle"), description: entry.path });
						}
					}
				} catch (e) {
					setErr(String(e && e.message ? e.message : e));
				}
			}

			function pane(side) {
				const isLocal = side === "local";
				const path = isLocal ? localPath : remotePath;
				const setPath = isLocal ? setLocalPath : setRemotePath;
				const entries = isLocal ? localEntries : remoteEntries;
				const sel = isLocal ? localSel : remoteSel;
				const refresh = isLocal ? refreshLocal : refreshRemote;
				return React.createElement("div", {
					className: "ssh-sftp-pane",
					onDragOver: function (e) { e.preventDefault(); },
					onDrop: onDropPane(side),
				},
					React.createElement("div", { className: "ssh-sftp-pane-hd" },
						React.createElement("strong", null, isLocal ? t("localProject") : t("remoteDevice")),
						React.createElement(Btn, { onClick: function () { refresh(parentOf(path)).catch(function (e) { setErr(String(e.message || e)); }); } }, t("parentDir")),
						React.createElement(Btn, { onClick: function () { refresh(path).catch(function (e) { setErr(String(e.message || e)); }); } }, t("refresh")),
						React.createElement("input", {
							className: "ssh-t-input",
							value: path,
							onChange: function (e) { setPath(e.target.value); },
							onKeyDown: function (e) {
								if (e.key === "Enter") refresh(path).catch(function (err) { setErr(String(err.message || err)); });
							},
						}),
					),
					React.createElement(FileList, {
						side: side,
						entries: entries,
						selected: sel,
						onSelect: selectHandler(side),
						onActivate: activate(side),
						onContext: function (e, ent) {
							// ensure selection includes entry
							if (ent) {
								const cur = isLocal ? localSel : remoteSel;
								if (cur.indexOf(ent.path) < 0) {
									if (isLocal) setLocalSel([ent.path]);
									else setRemoteSel([ent.path]);
								}
							}
							setCtx({ x: e.clientX, y: e.clientY, side: side, entry: ent });
						},
					}),
				);
			}

			return React.createElement(CenterOverlay, { onClose: onClose },
				React.createElement("div", { className: "ssh-ov-bar" },
					React.createElement("div", { className: "ssh-t-title" }, t("sftp") + " · " + (title || sessionId.slice(0, 8))),
					React.createElement("div", { className: "ssh-ov-tabs" },
						React.createElement("button", { type: "button", onClick: onOpenBash }, t("bash")),
						React.createElement("button", { type: "button", className: "on" }, t("sftp")),
					),
					React.createElement(Btn, {
						primary: true,
						disabled: !localSel.length,
						onClick: function () { transfer("upload", localSel); },
					}, t("upload")),
					React.createElement(Btn, {
						primary: true,
						disabled: !remoteSel.length,
						onClick: function () { transfer("download", remoteSel); },
					}, t("download")),
					React.createElement(Btn, { onClick: onClose }, t("close")),
				),
				React.createElement("div", { className: "ssh-ov-body ssh-sftp" },
					React.createElement("div", { className: "ssh-sftp-panes" },
						pane("local"),
						pane("remote"),
					),
					React.createElement("div", { className: "ssh-status" },
						(status || t("sftpHint")) + (err ? " · " + err : ""),
					),
				),
				ctx ? React.createElement("div", {
					className: "ssh-ctx",
					style: { left: ctx.x, top: ctx.y },
					onMouseDown: function (e) { e.stopPropagation(); },
				},
					ctx.entry ? React.createElement("button", { type: "button", onClick: function () { ctxAction("open"); } }, t("open")) : null,
					ctx.side === "local" ? React.createElement("button", { type: "button", onClick: function () { ctxAction("upload"); } }, t("uploadToRemote")) : null,
					ctx.side === "remote" ? React.createElement("button", { type: "button", onClick: function () { ctxAction("download"); } }, t("downloadToLocal")) : null,
					React.createElement("button", { type: "button", onClick: function () { ctxAction("mkdir"); } }, t("newFolder")),
					ctx.entry ? React.createElement("button", { type: "button", onClick: function () { ctxAction("rename"); } }, t("rename")) : null,
					ctx.entry ? React.createElement("button", { type: "button", onClick: function () { ctxAction("copyPath"); } }, t("copyPath")) : null,
					React.createElement("hr"),
					React.createElement("button", { type: "button", className: "danger", onClick: function () { ctxAction("delete"); } }, t("delete")),
				) : null,
				ctx ? React.createElement("div", {
					style: { position: "fixed", inset: 0, zIndex: 12999 },
					onMouseDown: function () { setCtx(null); },
					onContextMenu: function (e) { e.preventDefault(); setCtx(null); },
				}) : null,
				React.createElement(TextDialog, {
					open: !!dialog,
					token: dialog && dialog.token,
					mode: dialog && dialog.mode,
					title: dialog && dialog.title,
					description: dialog && dialog.description,
					defaultValue: dialog && dialog.defaultValue,
					placeholder: dialog && dialog.placeholder,
					confirmLabel: dialog && dialog.confirmLabel,
					danger: dialog && dialog.danger,
					onCancel: function () { finishDialog(null); },
					onConfirm: function (v) { finishDialog(v); },
				}),
			);
		}

		function TunnelPanel(props) {
			const visible = props.visible;
			const scope = props.scope || {};
			const [view, setView] = React.useState("tunnel");
			const [projectPathKey, setProjectPathKey] = React.useState("");
			const [sessionId, setSessionId] = React.useState(scope.sessionId || "");
			const [hosts, setHosts] = React.useState([]);
			const [granted, setGranted] = React.useState([]);
			const [sessions, setSessions] = React.useState([]);
			const [prompts, setPrompts] = React.useState([]);
			const [scan, setScan] = React.useState(null);
			const [form, setForm] = React.useState(emptyForm());
			const [sftpOn, setSftpOn] = React.useState(true);
			const [busy, setBusy] = React.useState("");
			const [message, setMessage] = React.useState("");
			const [error, setError] = React.useState("");
			// center overlay state
			const [overlay, setOverlay] = React.useState(null); // {sessionId, title, mode:'bash'|'sftp'}
			// in-panel dialog (same machinery as CenterSftp) — replaces window.confirm
			const [dialog, setDialog] = React.useState(null);
			const dialogToken = React.useRef(0);
			function openDialog(cfg) {
				dialogToken.current += 1;
				return new Promise(function (resolve) {
					setDialog(Object.assign({}, cfg, { token: dialogToken.current, _resolve: resolve }));
				});
			}
			function finishDialog(result) {
				setDialog(function (cur) {
					if (cur && cur._resolve) cur._resolve(result);
					return null;
				});
			}
			async function askConfirm(opts) {
				const v = await openDialog({
					mode: "confirm",
					title: opts.title,
					description: opts.description || "",
					confirmLabel: opts.confirmLabel || t("ok"),
					danger: !!opts.danger,
				});
				return !!v;
			}

			// scope.cwd is the real scope key better-sidebar passes; repoRoot is
			// the accepted alias. workspacePath was never provided by any host.
			const cwdGuess = scope.cwd || scope.repoRoot || "";

			const refresh = React.useCallback(async () => {
				setError("");
				const ctx = await api("getProjectContext", {
					sessionId: scope.sessionId || sessionId || "",
					cwd: cwdGuess || undefined,
				});
				const key = ctx.projectPathKey || cwdGuess || "";
				setProjectPathKey(key);
				if (ctx.sessionId) setSessionId(ctx.sessionId);
				const [h, g, s, p] = await Promise.all([
					api("listHosts"),
					api("getGrants", { projectPathKey: key }),
					api("listSessions", { projectPathKey: key }),
					api("listPrompts", { projectPathKey: key }),
				]);
				setHosts(h.hosts || []);
				setGranted(g.hostIds || []);
				setSessions(s.sessions || []);
				setPrompts(p.prompts || []);
			}, [scope.sessionId, cwdGuess, sessionId]);

			React.useEffect(() => {
				if (!visible) return;
				refresh().catch(function (e) { setError(String(e && e.message ? e.message : e)); });
				const t = setInterval(function () {
					if (!visible) return;
					// Background polls log instead of swallowing: a broken host route
					// should be diagnosable from the console (C-23) while the UI
					// keeps the last known state.
					api("listSessions", { projectPathKey: projectPathKey || cwdGuess })
						.then(function (s) { setSessions(s.sessions || []); })
						.catch(function (e) { console.warn("[dsh-ssh-tunnel] session poll failed:", e && e.message ? e.message : e); });
					api("listPrompts", { projectPathKey: projectPathKey || cwdGuess })
						.then(function (p) { setPrompts(p.prompts || []); })
						.catch(function (e) { console.warn("[dsh-ssh-tunnel] prompt poll failed:", e && e.message ? e.message : e); });
				}, 4000);
				return function () { clearInterval(t); };
			}, [visible, refresh, projectPathKey, cwdGuess]);

			function patchForm(p) {
				setForm(function (prev) { return Object.assign({}, prev, p); });
			}
			async function run(name, fn) {
				setBusy(name); setMessage(""); setError("");
				try { await fn(); setMessage(""); await refresh(); }
				catch (e) { setError(String(e && e.message ? e.message : e)); }
				finally { setBusy(""); }
			}
			function toggleGrant(id) {
				setGranted(granted.includes(id) ? granted.filter(function (x) { return x !== id; }) : granted.concat([id]));
			}
			function openCenter(sess, mode) {
				setOverlay({
					sessionId: sess.session_id,
					title: sess.title || sess.endpoint || sess.session_id,
					mode: mode,
				});
			}

			const tabs = [
				{ id: "grants", label: t("tabGrants") },
				{ id: "hosts", label: t("tabHosts") },
				{ id: "tunnel", label: t("tabTunnel") },
			];

			const overlayEl = overlay
				? (overlay.mode === "bash"
					? React.createElement(CenterBash, {
						sessionId: overlay.sessionId,
						projectPathKey: projectPathKey,
						title: overlay.title,
						onClose: function () { setOverlay(null); },
						onOpenSftp: function () { setOverlay(Object.assign({}, overlay, { mode: "sftp" })); },
					})
					: React.createElement(CenterSftp, {
						sessionId: overlay.sessionId,
						projectPathKey: projectPathKey,
						title: overlay.title,
						onClose: function () { setOverlay(null); },
						onOpenBash: function () { setOverlay(Object.assign({}, overlay, { mode: "bash" })); },
					}))
				: null;

			return React.createElement(React.Fragment, null,
				overlayEl,
				React.createElement("div", { className: "ssh-t-root" },
					React.createElement("div", { className: "ssh-t-head" },
						React.createElement("div", null,
							React.createElement("div", { className: "ssh-t-title" }, t("tabTitle")),
							React.createElement("div", { className: "ssh-t-sub" }, t("projectLabel", { path: projectPathKey || t("projectUnbound") })),
						),
						React.createElement(Btn, { disabled: !!busy, onClick: function () {
							refresh().catch(function (e) { setError(String(e.message || e)); });
						} }, t("refresh")),
					),
					React.createElement("div", { className: "ssh-t-tabs" },
						tabs.map(function (t) {
							return React.createElement("button", {
								key: t.id, type: "button",
								className: "ssh-t-tab" + (view === t.id || (view === "edit" && t.id === "hosts") ? " on" : ""),
								onClick: function () { setView(t.id); },
							}, t.label);
						}),
					),
					prompts && prompts.length ? React.createElement("div", { className: "ssh-t-prompt" },
						React.createElement("div", { style: { fontWeight: 600, marginBottom: 6 } }, t("needConfirm")),
						prompts.map(function (p) {
							const changed = p.kind === "host_key_changed";
							const newFp = p.fingerprint
								? ((p.fingerprintAlgo || "SHA256") + ":" + String(p.fingerprint))
								: "";
							const monoStyle = {
								marginTop: 6, wordBreak: "break-all",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11,
							};
							// Structured render: kind label + endpoint + old/new
							// fingerprints from fields. The host `message` string embeds
							// the new fingerprint too — showing both duplicated it.
							return React.createElement("div", { key: p.promptId, style: { marginBottom: 8 } },
								React.createElement("div", null,
									(changed ? t("promptKeyChanged") : t("promptKeyUnknown"))
										+ " · " + p.host + ":" + (p.port || 22)),
								newFp
									? React.createElement("div", { className: "ssh-t-muted", style: monoStyle }, t("promptFpNew") + ": " + newFp)
									: null,
								changed && p.previous
									? React.createElement("div", { className: "ssh-t-muted", style: monoStyle }, t("promptFpOld") + ": SHA256:" + String(p.previous))
									: null,
								React.createElement("div", { className: "ssh-t-actions" },
									React.createElement(Btn, { primary: true, disabled: !!busy, onClick: function () {
										run("trust", async function () {
											const r = await api("answerPrompt", {
												promptId: p.promptId, trustHostKey: true, connectAfter: true,
												projectPathKey: projectPathKey, sftpEnabled: sftpOn,
											});
											// C-08: "trusted but not connected" must not look
											// like a failed trust — say both parts explicitly.
											if (r && r.trusted && r.connected === false && r.error) {
												throw new Error(t("trustedNotConnected") + " " + String(r.error));
											}
											if (r && r.connected === false && r.error) throw new Error(String(r.error));
										});
									} }, t("trustConnect")),
									React.createElement(Btn, { disabled: !!busy, onClick: function () {
										run("dismiss", async function () {
											// No trustHostKey: the host drops the prompt and
											// stores nothing.
											await api("answerPrompt", { promptId: p.promptId });
										});
									} }, t("dismissPrompt")),
								),
							);
						}),
					) : null,
					view === "grants" ? React.createElement("div", { className: "ssh-t-card" },
						React.createElement("div", { className: "ssh-t-muted", style: { marginBottom: 8 } }, t("grantsHint")),
						hosts.map(function (h) {
							return React.createElement("label", { key: h.id, className: "ssh-t-check" },
								React.createElement("input", {
									type: "checkbox", checked: granted.includes(h.id),
									onChange: function () { toggleGrant(h.id); },
								}),
								React.createElement("span", null,
									React.createElement("span", { className: "ssh-t-name" }, h.name || h.id),
									React.createElement("span", { className: "ssh-t-endpoint" },
										h.username + "@" + h.host + ":" + (h.port || 22) + " · " + h.credentialStatus,
									),
								),
							);
						}),
						React.createElement("div", { className: "ssh-t-actions" },
							React.createElement(Btn, { primary: true, disabled: !!busy || !projectPathKey, onClick: function () {
								run("grants", async function () {
									await api("setGrants", { projectPathKey: projectPathKey, hostIds: granted });
								});
							} }, t("saveGrants")),
						),
					) : null,
					view === "hosts" ? React.createElement("div", { className: "ssh-t-card" },
						React.createElement("div", { className: "ssh-t-actions", style: { marginTop: 0 } },
							React.createElement(Btn, { primary: true, onClick: function () { setForm(emptyForm()); setView("edit"); } }, t("newHost")),
							React.createElement(Btn, { disabled: !!busy, onClick: function () {
								run("scan", async function () { setScan(await api("scanOpenSsh")); });
							} }, t("scanOpenSsh")),
						),
						hosts.map(function (h) {
							return React.createElement("div", { key: h.id, className: "ssh-t-row" },
								React.createElement("div", { className: "ssh-t-row-main" },
									React.createElement("div", { className: "ssh-t-name" }, h.name || h.id),
									React.createElement("div", { className: "ssh-t-endpoint", title: h.username + "@" + h.host + ":" + h.port },
										h.username + "@" + h.host + ":" + h.port,
									),
								),
								React.createElement("div", { className: "ssh-t-actions" },
									React.createElement(Btn, { onClick: function () {
										setForm({
											id: h.id, name: h.name || "", host: h.host || "", port: h.port || 22,
											username: h.username || "",
											// C-19: a legacy keyboard-interactive host must not look
											// like an ordinary password host. Keep the retirement
											// visible with an explicit banner on the edit form.
											authType: h.authType === "keyboardInteractive" ? "password" : (h.authType || "privateKey"),
											legacyKbi: h.authType === "keyboardInteractive",
											privateKeyPath: h.privateKeyPath || "", password: "", privateKeyPem: "", passphrase: "",
										});
										setView("edit");
									} }, t("edit")),
									React.createElement(Btn, { danger: true, onClick: async function () {
										const ok = await askConfirm({
											title: t("confirmDeleteTitle"),
											description: t("deleteHostConfirm", { name: h.name || h.id }),
											confirmLabel: t("delete"),
											danger: true,
										});
										if (!ok) return;
										run("del", async function () { await api("deleteHost", { id: h.id }); });
									} }, t("delete")),
								),
							);
						}),
						scan ? React.createElement("div", { style: { marginTop: 12 } },
							(scan.configs || []).map(function (c, i) {
								return React.createElement("div", { key: i, className: "ssh-t-row" },
									React.createElement("div", { className: "ssh-t-row-main" },
										React.createElement("div", { className: "ssh-t-name" }, c.name || c.host),
										React.createElement("div", { className: "ssh-t-endpoint", title: c.host },
											(c.username ? c.username + "@" : "") + c.host + ":" + (c.port || 22),
										),
										c.privateKeyPath
											? React.createElement("div", { className: "ssh-t-endpoint" }, t("privateKeyPath") + ": " + c.privateKeyPath)
											: null,
									),
									React.createElement("div", { className: "ssh-t-actions" },
										React.createElement(Btn, { onClick: function () {
											run("imp", async function () { await api("importScan", { entry: c }); });
										} }, t("import")),
									),
								);
							}),
						) : null,
					) : null,
					view === "edit" ? React.createElement("div", { className: "ssh-t-card" },
						React.createElement(Field, { label: t("name") }, React.createElement("input", { className: "ssh-t-input", value: form.name, onChange: function (e) { patchForm({ name: e.target.value }); } })),
						React.createElement(Field, { label: t("host") }, React.createElement("input", { className: "ssh-t-input", value: form.host, onChange: function (e) { patchForm({ host: e.target.value }); } })),
						React.createElement(Field, { label: t("port") }, React.createElement("input", { className: "ssh-t-input", type: "number", value: form.port, onChange: function (e) { patchForm({ port: e.target.value }); } })),
						React.createElement(Field, { label: t("username") }, React.createElement("input", { className: "ssh-t-input", value: form.username, onChange: function (e) { patchForm({ username: e.target.value }); } })),
						React.createElement(Field, { label: t("authType") },
							React.createElement("select", { className: "ssh-t-select", value: form.authType, onChange: function (e) { patchForm({ authType: e.target.value, legacyKbi: false }); } },
								React.createElement("option", { value: "privateKey" }, t("authPrivateKey")),
								React.createElement("option", { value: "password" }, t("authPassword")),
							),
						),
						form.authType === "privateKey" ? React.createElement(React.Fragment, null,
							React.createElement(Field, { label: t("privateKeyPath") }, React.createElement("input", { className: "ssh-t-input", value: form.privateKeyPath, onChange: function (e) { patchForm({ privateKeyPath: e.target.value }); } })),
							React.createElement(Field, { label: t("privateKeyPem") }, React.createElement("textarea", { className: "ssh-t-textarea", rows: 3, value: form.privateKeyPem, onChange: function (e) { patchForm({ privateKeyPem: e.target.value }); } })),
							React.createElement(Field, { label: t("passphrase") }, React.createElement("input", { className: "ssh-t-input", type: "password", value: form.passphrase, onChange: function (e) { patchForm({ passphrase: e.target.value }); } })),
						) : null,
						form.authType === "password" ? React.createElement(Field, { label: t("password") }, React.createElement("input", { className: "ssh-t-input", type: "password", value: form.password, onChange: function (e) { patchForm({ password: e.target.value }); } })) : null,
						form.legacyKbi ? React.createElement("div", { className: "ssh-t-err" }, t("kbiEditNotice")) : null,
						React.createElement("div", { className: "ssh-t-actions" },
							React.createElement(Btn, { primary: true, disabled: !!busy, onClick: function () {
								run("save", async function () {
									const payload = {
										id: form.id || undefined, name: form.name, host: form.host,
										port: Number(form.port) || 22, username: form.username, authType: form.authType,
										privateKeyPath: form.privateKeyPath,
									};
									if (form.password) payload.password = form.password;
									if (form.privateKeyPem) payload.privateKeyPem = form.privateKeyPem;
									if (form.passphrase) payload.passphrase = form.passphrase;
									await api("saveHost", { host: payload });
									setView("hosts");
								});
							} }, t("save")),
							React.createElement(Btn, { onClick: function () { setView("hosts"); } }, t("back")),
						),
					) : null,
					view === "tunnel" ? React.createElement("div", { className: "ssh-t-card" },
						React.createElement("label", { className: "ssh-t-check" },
							React.createElement("input", { type: "checkbox", checked: sftpOn, onChange: function (e) { setSftpOn(!!e.target.checked); } }),
							React.createElement("span", null, t("sftpOnConnect")),
						),
						React.createElement("div", { style: { fontWeight: 600, margin: "8px 0" } }, t("connectSection")),
						hosts.filter(function (h) { return granted.includes(h.id); }).map(function (h) {
							return React.createElement("div", { key: h.id, className: "ssh-t-row" },
								React.createElement("div", { className: "ssh-t-row-main" },
									React.createElement("div", { className: "ssh-t-name" }, h.name || h.id),
									React.createElement("div", { className: "ssh-t-endpoint", title: h.username + "@" + h.host + ":" + (h.port || 22) },
										h.username + "@" + h.host + ":" + (h.port || 22),
									),
								),
								React.createElement("div", { className: "ssh-t-actions" },
									React.createElement(Btn, { primary: true, disabled: !!busy || !projectPathKey, onClick: function () {
										run("connect", async function () {
											if (h.authType === "keyboardInteractive") {
												throw new Error(t("kbiUnsupported"));
											}
											try {
												await api("connect", {
													hostId: h.id, projectPathKey: projectPathKey,
													sftpEnabled: sftpOn, trustHostKey: false,
												});
											} catch (e) {
												// A host-key prompt arrives as ok:false + promptId
												// (HTTP 200): surface it and refresh the card. The
												// fallback copy covers hosts that omit `message`.
												if (e && e.data && e.data.promptId) {
													setMessage(e.data.message || t("needHostKey"));
													setPrompts((await api("listPrompts", { projectPathKey: projectPathKey })).prompts || []);
													return;
												}
												throw e;
											}
										});
									} }, t("connect")),
								),
							);
						}),
						React.createElement("div", { style: { fontWeight: 600, margin: "12px 0 6px" } }, t("sessionsSection")),
						sessions.length === 0
							? React.createElement("div", { className: "ssh-t-muted" }, t("noSessions"))
							: sessions.map(function (s) {
								const live = s.running && s.status === "connected";
								const reconnecting = s.status === "reconnecting";
								const statusLabel = reconnecting
									? t("reconnecting", { attempt: s.reconnect_attempt || 1, max: s.reconnect_max_attempts || 3 })
									: (live ? t("connected") : t("disconnected"));
								return React.createElement("div", { key: s.session_id, className: "ssh-t-row" },
									React.createElement("div", { className: "ssh-t-row-main" },
										React.createElement("div", { className: "ssh-t-name" }, s.title || s.session_id),
										React.createElement("div", { className: "ssh-t-endpoint" },
											(s.endpoint ? s.endpoint + " · " : "") + statusLabel + " · sftp=" + String(s.sftpEnabled),
										),
									),
									React.createElement("div", { className: "ssh-t-actions" },
										React.createElement(Btn, { primary: true, disabled: !live, onClick: function () { openCenter(s, "bash"); } }, t("terminal")),
										React.createElement(Btn, { disabled: !live || !s.sftpEnabled, onClick: function () { openCenter(s, "sftp"); } }, t("sftp")),
										!live && !reconnecting ? React.createElement(Btn, { primary: true, disabled: !!busy || !projectPathKey, onClick: function () {
											run("reconnect", async function () {
												try {
													await api("reconnect", { sessionId: s.session_id, projectPathKey: projectPathKey });
												} catch (e) {
													const msg = String(e && e.message ? e.message : e);
													if (e && e.data && e.data.promptId) {
														setMessage(e.data.message || t("needHostKey"));
														setPrompts((await api("listPrompts", { projectPathKey: projectPathKey })).prompts || []);
														return;
													}
													if (/keyboard-interactive/i.test(msg)) throw new Error(t("kbiUnsupported"));
													throw e;
												}
											});
										} }, t("reconnect")) : null,
										React.createElement(Btn, { danger: true, onClick: function () {
											run("disc", async function () {
												if (overlay && overlay.sessionId === s.session_id) setOverlay(null);
												await api("disconnect", { sessionId: s.session_id, projectPathKey: projectPathKey });
											});
										} }, live ? t("disconnect") : t("closeSession")),
									),
								);
							}),
					) : null,
					message ? React.createElement("div", { className: "ssh-t-ok" }, message) : null,
					error ? React.createElement("div", { className: "ssh-t-err" }, error) : null,
					React.createElement("div", { className: "ssh-t-muted" },
						t("footerHint"),
					),
					React.createElement(TextDialog, {
						open: !!dialog,
						token: dialog && dialog.token,
						mode: dialog && dialog.mode,
						title: dialog && dialog.title,
						description: dialog && dialog.description,
						confirmLabel: dialog && dialog.confirmLabel,
						danger: dialog && dialog.danger,
						onCancel: function () { finishDialog(null); },
						onConfirm: function (v) { finishDialog(v); },
					}),
				),
			);
		}

		function TunnelRoot(props) {
			const ctx = props.ctx;
			// Re-render on DSH locale switches (better-sidebar pattern).
			const localeKey = React.useSyncExternalStore(
				React.useCallback(function (cb) {
					if (!ctx.locale || typeof ctx.locale.subscribe !== "function") return function () {};
					return ctx.locale.subscribe(cb);
				}, [ctx]),
				React.useCallback(function () {
					try {
						return ctx.locale && ctx.locale.getSnapshot ? ctx.locale.getSnapshot().active : activeLocale();
					} catch (e) {
						return activeLocale();
					}
				}, [ctx]),
				function () { return "en"; },
			);
			return React.createElement(TunnelPanel, {
				key: "ssh-tunnel-" + String(localeKey || "en"),
				visible: props.visible,
				scope: props.scope,
			});
		}

		const inject = ["betterSidebar", "locale"];
		function apply(ctx) {
			ctx.effect(function () {
				return ensureStyles();
			}, "dsh-ssh-tunnel: styles");
			if (ctx.locale) {
				attachLocale(ctx.locale);
				ctx.effect(function () {
					const offZh = ctx.locale.register(LOCALE_NS, "zh", zh);
					const offEn = ctx.locale.register(LOCALE_NS, "en", en);
					return function () {
						try { offZh(); } catch (e) {}
						try { offEn(); } catch (e) {}
					};
				}, "dsh-ssh-tunnel: dictionaries");
			}
			if (!ctx.betterSidebar) return;
			ctx.effect(function () {
				return ctx.betterSidebar.registerTab({
					id: TAB_ID,
					title: function () { return t("tabTitle"); },
					icon: function (size) { return icon(size); },
					order: 44,
					single: true,
					component: function (p) {
						return React.createElement(TunnelRoot, {
							ctx: ctx,
							visible: p.visible,
							scope: p.scope,
						});
					},
				});
			}, "dsh-ssh-tunnel: register tab");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
