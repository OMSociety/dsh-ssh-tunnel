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
			hostKeyFingerprint: "指纹",
			grantsHint: "勾选后，当前项目下的对话可通过 SSHManager 与隧道使用这些主机。连接前须先完成项目授权（不会在连接时自动授权）。",
			saveGrants: "保存项目授权",
			saving: "保存中…",
			noHostsYet: "还没有主机，请先到「主机库」添加。",
			newHost: "新建主机",
			scanOpenSsh: "扫描 OpenSSH",
			scanning: "扫描中…",
			edit: "编辑",
			delete: "删除",
			deleteHostConfirm: "确定删除主机「{name}」？此操作不可撤销。",
			import: "导入",
			scanResults: "扫描结果",
			name: "名称 / 别名",
			host: "Host",
			port: "Port",
			username: "Username",
			authType: "认证方式",
			authPrivateKey: "私钥",
			authPassword: "密码",
			authKeyboard: "键盘交互 (仅 UI 拨号)",
			privateKeyPath: "私钥路径",
			privateKeyPem: "或粘贴 PEM",
			passphrase: "私钥口令",
			password: "密码",
			save: "保存",
			back: "返回",
			editHost: "编辑主机",
			createHost: "新建主机",
			sftpOnConnect: "连接时启用 SFTP",
			connectSection: "连接",
			connect: "Connect",
			connecting: "连接中…",
			needHostKey: "需要在提示中信任 host key",
			sessionsSection: "会话（终端 / SFTP 在中央打开）",
			noSessions: "暂无会话",
			terminal: "终端",
			sftp: "SFTP",
			disconnect: "断开",
			footerHint: "连接与授权在此侧栏；终端与 SFTP 在中央面板打开。",
			bashTitle: "SSH 终端 · {name}",
			close: "关闭",
			bash: "Bash",
			bashStatusReady: "connected · 直接在终端内输入，Ctrl+C 等快捷键可用",
			bashStatusLoading: "loading",
			bashStatusError: "error",
			xtermLoadFailed: "无法加载 xterm",
			transferring: "传输中…",
			skipDir: "跳过目录 {name}",
			skipDirHint: "跳过目录 {name}（请先进入后多选文件）",
			transferDone: "",
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
			done: "完成",
			working: "工作中…",
			authLine: "{user}@{host}:{port} · {auth} · {cred}",
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
			hostKeyFingerprint: "Fingerprint",
			grantsHint: "Checked hosts can be used by SSHManager and the tunnel for this project. Grant access before connecting (connect does not auto-authorize).",
			saveGrants: "Save project access",
			saving: "Saving…",
			noHostsYet: "No hosts yet — add one under Hosts.",
			newHost: "New host",
			scanOpenSsh: "Scan OpenSSH",
			scanning: "Scanning…",
			edit: "Edit",
			delete: "Delete",
			deleteHostConfirm: "Delete host \"{name}\"? This cannot be undone.",
			import: "Import",
			scanResults: "Scan results",
			name: "Name / alias",
			host: "Host",
			port: "Port",
			username: "Username",
			authType: "Authentication",
			authPrivateKey: "Private key",
			authPassword: "Password",
			authKeyboard: "Keyboard-interactive (UI dial only)",
			privateKeyPath: "Private key path",
			privateKeyPem: "Or paste PEM",
			passphrase: "Key passphrase",
			password: "Password",
			save: "Save",
			back: "Back",
			editHost: "Edit host",
			createHost: "New host",
			sftpOnConnect: "Enable SFTP on connect",
			connectSection: "Connect",
			connect: "Connect",
			connecting: "Connecting…",
			needHostKey: "Trust the host key in the prompt first",
			sessionsSection: "Sessions (terminal / SFTP open in the center)",
			noSessions: "No sessions",
			terminal: "Terminal",
			sftp: "SFTP",
			disconnect: "Disconnect",
			footerHint: "Use this sidebar for connect and access; terminal and SFTP open in the center panel.",
			bashTitle: "SSH terminal · {name}",
			close: "Close",
			bash: "Bash",
			bashStatusReady: "connected · type directly in the terminal (Ctrl+C etc.)",
			bashStatusLoading: "loading",
			bashStatusError: "error",
			xtermLoadFailed: "Failed to load xterm",
			transferring: "Transferring…",
			skipDir: "Skipped directory {name}",
			skipDirHint: "Skipped directory {name} (enter it and multi-select files)",
			transferDone: "",
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
			done: "Done",
			working: "Working…",
			authLine: "{user}@{host}:{port} · {auth} · {cred}",
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
			if (!response.ok && data && data.error) throw new Error(String(data.error));
			if (!response.ok) throw new Error("HTTP " + response.status);
			return data;
		}

		function loadScript(src) {
			return new Promise(function (resolve, reject) {
				const s = document.createElement("script");
				s.src = src;
				s.async = true;
				s.onload = function () { resolve(); };
				s.onerror = function () { reject(new Error("load fail " + src)); };
				document.head.appendChild(s);
			});
		}
		function loadCss(href) {
			if (document.querySelector('link[data-ssh-t="' + href + '"]')) return;
			const l = document.createElement("link");
			l.rel = "stylesheet";
			l.href = href;
			l.setAttribute("data-ssh-t", href);
			document.head.appendChild(l);
		}
		let xtermPromise = null;
		function ensureXterm() {
			if (xtermPromise) return xtermPromise;
			xtermPromise = (async function () {
				let Terminal = null;
				let FitAddon = null;
				try {
					const xt = require("@xterm/xterm");
					Terminal = xt.Terminal || xt.default || xt;
				} catch (e) {}
				try {
					const fit = require("@xterm/addon-fit");
					FitAddon = fit.FitAddon || fit.default || fit;
				} catch (e) {}
				if (!Terminal && typeof window !== "undefined") {
					// Fallback only when bundler did not provide @xterm/xterm (needs network / CSP allowlist)
					loadCss("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css");
					if (!window.Terminal) {
						await loadScript("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js");
					}
					if (!window.FitAddon && !window.FitAddonNamespace) {
						try {
							await loadScript("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js");
						} catch (e) {}
					}
					Terminal = window.Terminal;
					FitAddon = (window.FitAddon && window.FitAddon.FitAddon) || window.FitAddon || null;
				} else {
					loadCss("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css");
				}
				return { Terminal: Terminal, FitAddon: FitAddon };
			})();
			return xtermPromise;
		}

		function icon(size) {
			const s = size || 16;
			return React.createElement("svg", {
				width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
				strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
			},
				React.createElement("path", { d: "M12 20h9" }),
				React.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }),
				React.createElement("path", { d: "M4 12v-2a8 8 0 0 1 14-5" }),
			);
		}

		function ensureStyles() {
			if (typeof document === "undefined") return;
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
		function parentOf(p) {
			if (!p || p === "/" ) return "/";
			const n = String(p).replace(/\/+$/, "");
			const i = n.lastIndexOf("/");
			if (i <= 0) return "/";
			return n.slice(0, i) || "/";
		}
		function joinPath(base, name) {
			if (!base || base === "/") return "/" + name;
			return String(base).replace(/\/+$/, "") + "/" + name;
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
			const sinceRef = React.useRef(0);
			const [err, setErr] = React.useState("");
			const [status, setStatus] = React.useState("loading");

			React.useEffect(function () {
				let cancelled = false;
				let timer = null;
				let ro = null;
				(async function () {
					try {
						const mods = await ensureXterm();
						if (cancelled || !hostRef.current) return;
						if (!mods.Terminal) throw new Error(t("xtermLoadFailed"));
						await api("shellOpen", { sessionId, projectPathKey });
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
						sinceRef.current = 0;
						// initial dump
						const first = await api("shellRead", { sessionId, projectPathKey, since: 0, full: true });
						const boot = first.output || first.chunk || "";
						if (boot) term.write(boot);
						sinceRef.current = first.length != null ? first.length : boot.length;
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
						setStatus("connected");
						timer = setInterval(async function () {
							if (cancelled || !termRef.current) return;
							try {
								const r = await api("shellRead", {
									sessionId, projectPathKey, since: sinceRef.current,
								});
								const chunk = r.chunk != null ? r.chunk : "";
								if (chunk) {
									termRef.current.write(chunk);
									sinceRef.current = r.length != null ? r.length : sinceRef.current + chunk.length;
								} else if (r.length != null) {
									sinceRef.current = r.length;
								}
							} catch (e) {}
						}, 120);
					} catch (e) {
						if (!cancelled) {
							setErr(String(e && e.message ? e.message : e));
							setStatus("error");
						}
					}
				})();
				return function () {
					cancelled = true;
					if (timer) clearInterval(timer);
					if (ro) try { ro.disconnect(); } catch (e) {}
					if (termRef.current) {
						if (termRef.current._onWin) window.removeEventListener("resize", termRef.current._onWin);
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
				React.createElement("div", { className: "ssh-status" }, (status === "connected" ? t("bashStatusReady") : status) + (err ? " · " + err : "")),
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
			const [localPath, setLocalPath] = React.useState(projectPathKey || "/workspace");
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
				refreshLocal(projectPathKey || "/workspace").catch(function (e) {
					setErr(String(e && e.message ? e.message : e));
				});
				refreshRemote("/").catch(function (e) {
					setErr(String(e && e.message ? e.message : e));
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
				try {
					for (let i = 0; i < paths.length; i++) {
						const src = paths[i];
						const name = src.split("/").filter(Boolean).pop();
						if (direction === "upload") {
							// skip dirs for v1 simple file upload
							const ent = localEntries.find(function (e) { return e.path === src; });
							if (ent && ent.isDirectory) {
								setStatus(t("skipDirHint", { name: name }));
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
								setStatus(t("skipDir", { name: name }));
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
					setStatus("");
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

			const cwdGuess = scope.cwd || scope.workspacePath || "";

			const refresh = React.useCallback(async () => {
				setError("");
				const ctx = await api("getProjectContext", {
					sessionId: scope.sessionId || sessionId || "",
					cwd: cwdGuess || undefined,
				});
				const key = ctx.projectPathKey || cwdGuess || "/workspace";
				setProjectPathKey(key);
				if (ctx.sessionId) setSessionId(ctx.sessionId);
				const [h, g, s, p] = await Promise.all([
					api("listHosts"),
					api("getGrants", { projectPathKey: key }),
					api("listSessions", { projectPathKey: key }),
					api("listPrompts"),
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
					api("listSessions", { projectPathKey: projectPathKey || cwdGuess || "/workspace" })
						.then(function (s) { setSessions(s.sessions || []); }).catch(function () {});
					api("listPrompts").then(function (p) { setPrompts(p.prompts || []); }).catch(function () {});
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
							const fpLabel = p.fingerprint
								? ((p.fingerprintAlgo || "SHA256") + ":" + String(p.fingerprint))
								: "";
							return React.createElement("div", { key: p.promptId, style: { marginBottom: 8 } },
								React.createElement("div", null, p.message || p.kind),
								fpLabel
									? React.createElement("div", {
										className: "ssh-t-muted",
										style: { marginTop: 6, wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 },
									}, t("hostKeyFingerprint") + ": " + fpLabel)
									: null,
								React.createElement("div", { className: "ssh-t-actions" },
									React.createElement(Btn, { primary: true, disabled: !!busy, onClick: function () {
										run("trust", async function () {
											const r = await api("answerPrompt", {
												promptId: p.promptId, trustHostKey: true, connectAfter: true,
												projectPathKey: projectPathKey, sftpEnabled: sftpOn,
											});
											if (r && r.connected === false && r.error) throw new Error(String(r.error));
										});
									} }, t("trustConnect")),
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
							React.createElement(Btn, { primary: true, disabled: !!busy, onClick: function () {
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
											username: h.username || "", authType: h.authType || "privateKey",
											privateKeyPath: h.privateKeyPath || "", password: "", privateKeyPem: "", passphrase: "",
										});
										setView("edit");
									} }, t("edit")),
									React.createElement(Btn, { danger: true, onClick: function () {
										if (!window.confirm(t("deleteHostConfirm", { name: h.name || h.id }))) return;
										run("del", async function () { await api("deleteHost", { id: h.id }); });
									} }, t("delete")),
								),
							);
						}),
						scan ? React.createElement("div", { style: { marginTop: 12 } },
							(scan.configs || []).map(function (c, i) {
								return React.createElement("div", { key: i, className: "ssh-t-row" },
									React.createElement("div", { className: "ssh-t-row-main" },
										React.createElement("div", { className: "ssh-t-name" }, c.name),
										React.createElement("div", { className: "ssh-t-endpoint", title: c.host }, "→ " + c.host),
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
							React.createElement("select", { className: "ssh-t-select", value: form.authType, onChange: function (e) { patchForm({ authType: e.target.value }); } },
								React.createElement("option", { value: "privateKey" }, t("authPrivateKey")),
								React.createElement("option", { value: "password" }, t("authPassword")),
								React.createElement("option", { value: "keyboardInteractive" }, t("authKeyboard")),
							),
						),
						form.authType === "privateKey" ? React.createElement(React.Fragment, null,
							React.createElement(Field, { label: t("privateKeyPath") }, React.createElement("input", { className: "ssh-t-input", value: form.privateKeyPath, onChange: function (e) { patchForm({ privateKeyPath: e.target.value }); } })),
							React.createElement(Field, { label: t("privateKeyPem") }, React.createElement("textarea", { className: "ssh-t-textarea", rows: 3, value: form.privateKeyPem, onChange: function (e) { patchForm({ privateKeyPem: e.target.value }); } })),
							React.createElement(Field, { label: t("passphrase") }, React.createElement("input", { className: "ssh-t-input", type: "password", value: form.passphrase, onChange: function (e) { patchForm({ passphrase: e.target.value }); } })),
						) : null,
						form.authType === "password" ? React.createElement(Field, { label: t("password") }, React.createElement("input", { className: "ssh-t-input", type: "password", value: form.password, onChange: function (e) { patchForm({ password: e.target.value }); } })) : null,
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
									React.createElement(Btn, { primary: true, disabled: !!busy, onClick: function () {
										run("connect", async function () {
											const r = await api("connect", {
												hostId: h.id, projectPathKey: projectPathKey,
												sftpEnabled: sftpOn, trustHostKey: false,
											});
											if (r && r.ok === false && r.promptId) {
												setMessage(r.message || t("needHostKey"));
												setPrompts((await api("listPrompts")).prompts || []);
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
								return React.createElement("div", { key: s.session_id, className: "ssh-t-row" },
									React.createElement("div", { className: "ssh-t-row-main" },
										React.createElement("div", { className: "ssh-t-name" }, s.title || s.session_id),
										React.createElement("div", { className: "ssh-t-endpoint" },
											(s.endpoint ? s.endpoint + " · " : "") + s.status + " · sftp=" + String(s.sftpEnabled),
										),
									),
									React.createElement("div", { className: "ssh-t-actions" },
										React.createElement(Btn, { primary: true, disabled: !s.running, onClick: function () { openCenter(s, "bash"); } }, t("terminal")),
										React.createElement(Btn, { disabled: !s.running || !s.sftpEnabled, onClick: function () { openCenter(s, "sftp"); } }, t("sftp")),
										React.createElement(Btn, { danger: true, onClick: function () {
											run("disc", async function () {
												if (overlay && overlay.sessionId === s.session_id) setOverlay(null);
												await api("disconnect", { sessionId: s.session_id });
											});
										} }, t("disconnect")),
									),
								);
							}),
					) : null,
					message ? React.createElement("div", { className: "ssh-t-ok" }, message) : null,
					error ? React.createElement("div", { className: "ssh-t-err" }, error) : null,
					React.createElement("div", { className: "ssh-t-muted" },
						t("footerHint"),
					),
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
			ensureStyles();
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
