// Dev probe: load lib/client.js under a mock __ModuleLoader__, apply() it against
// a mock cordis ctx, and renderToString the registered tab component tree.
//
// The probe needs a real react/react-dom. Not every DSH install ships them as
// resolvable packages (the web frontend bundles its own copy), so it tries a list
// of candidate roots and skips cleanly — the same graceful-skip convention the
// smoke tests use for unavailable symlinks — instead of failing on a hard-coded
// absolute path.
//
// Candidates: $DSH_RUNTIME_ROOT, the profile dir ($DSH_PROFILE_DIR or
// $DSH_HOME/profiles/${DSH_PROFILE:-web}), then the usual global install roots.
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

function reactFrom(root) {
	if (!root) return null;
	try {
		const req = createRequire(path.join(path.resolve(root), "package.json"));
		return {
			React: req("react"),
			ReactDOM: req("react-dom"),
			renderToString: req("react-dom/server").renderToString,
		};
	} catch {
		return null;
	}
}

const profileDir =
	process.env.DSH_PROFILE_DIR ||
	path.join(
		process.env.DSH_HOME || path.join(os.homedir(), ".dsh"),
		"profiles",
		process.env.DSH_PROFILE || "web",
	);

const candidates = [
	process.env.DSH_RUNTIME_ROOT,
	profileDir,
	"/usr/local/lib/node_modules/@deepseek-ai/dsh",
	"/usr/lib/node_modules/@deepseek-ai/dsh",
	process.env.APPDATA
		? path.join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai", "dsh")
		: "",
];

let real = null;
for (const root of candidates) {
	real = reactFrom(root);
	if (real) break;
}
if (!real) {
	console.log("portal probe skipped: no resolvable react/react-dom package.");
	console.log("  tried:", candidates.filter(Boolean).join(", "));
	console.log("  set DSH_RUNTIME_ROOT to a root whose node_modules holds react to run it.");
	process.exit(0);
}
const { React, ReactDOM, renderToString } = real;

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

// zh/en dictionaries register only when ctx.locale exists — the title factory must
// still return a string through the built-in fallback.
if (!captured.tab.title || typeof captured.tab.title() !== "string") throw new Error("title fn broken");

const el = captured.tab.component({ visible: true, scope: {} });
const html = renderToString(el);

// Markers are the class names the tab tree actually renders (lib/client.js).
for (const marker of ["ssh-t-root", "ssh-t-head"]) {
	if (!html.includes(marker)) throw new Error("missing sidebar markup: " + marker);
}
console.log("probe OK: tab tree renders, length =", html.length);
console.log("portal available:", typeof ReactDOM.createPortal === "function");
