// One-shot probe: load lib/client.js under a mock __ModuleLoader__ with REAL
// react/react-dom from the DSH web profile, apply() it against a mock cordis
// ctx, and renderToString the registered tab component tree.
import vm from "node:vm";
import fs from "node:fs";
import { createRequire } from "node:module";

const req = createRequire("/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-trajectory/index.js");
const React = req("react");
const ReactDOM = req("react-dom");
const { renderToString } = req("react-dom/server");

let loaded = null;
const sandbox = {
	window: { __ModuleLoader__: { load(def) { loaded = def; } } },
	console,
	setTimeout,
	clearTimeout,
	setInterval,
	clearInterval,
};
sandbox.require = (name) => {
	if (name === "react") return React;
	if (name === "react-dom") return ReactDOM;
	throw new Error("unexpected require in probe: " + name);
};
vm.createContext(sandbox);
const src = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
vm.runInContext(src, sandbox, { filename: "client.js" });

if (!loaded || loaded.id !== "dsh-ssh-tunnel") throw new Error("module did not register");
const mod = loaded.factory(sandbox.require);
if (typeof mod.apply !== "function" || !Array.isArray(mod.inject)) throw new Error("bad exports");

const captured = {};
const ctx = {
	locale: null,
	betterSidebar: { registerTab: (d) => { captured.tab = d; return () => {}; } },
	effect(fn) { return fn(); },
};
mod.apply(ctx);
if (!captured.tab || typeof captured.tab.component !== "function") throw new Error("tab not registered");

// zh/en dictionaries registered only when ctx.locale exists — call them directly to smoke the path
if (!captured.tab.title || typeof captured.tab.title() !== "string") throw new Error("title fn broken");

const el = captured.tab.component({ visible: true, scope: {} });
const html = renderToString(el);

for (const marker of ["ssh-t-root", "SSH Tunnel", "ssh-t-head"]) {
	if (!html.includes(marker)) throw new Error("missing sidebar markup: " + marker);
}
console.log("probe OK: tab tree renders, length =", html.length);
console.log("portal available:", typeof ReactDOM.createPortal === "function");
