/**
 * Same-origin static assets for the browser client.
 *
 * `dsh-ssh-tunnel/lib/client.js` is a raw browser bundle executed by the DSH
 * client module system; its `require()` only answers platform seeds and
 * registered plugin rows, so `@xterm/xterm` is NOT resolvable there. Instead
 * of the removed jsDelivr fallback we serve the UMD builds from our own web
 * route (`/dsh-ssh-tunnel/vendor/*`) and load them with plain <script>/<link>
 * tags. This module is the host-side allowlist + resolver (Node only).
 */

import { createRequire } from 'node:module'

const requireHost = createRequire(import.meta.url)

/** name -> { spec (resolved from this plugin's deps), content-type } */
export const VENDOR_ASSETS = {
  'xterm.js': {
    spec: '@xterm/xterm/lib/xterm.js',
    type: 'text/javascript; charset=utf-8',
  },
  'xterm.css': {
    spec: '@xterm/xterm/css/xterm.css',
    type: 'text/css; charset=utf-8',
  },
  'addon-fit.js': {
    spec: '@xterm/addon-fit/lib/addon-fit.js',
    type: 'text/javascript; charset=utf-8',
  },
}

/**
 * Resolve an allowlisted vendor asset to an absolute file path.
 * Anything not in the allowlist throws — callers must treat that as 404 and
 * must not interpolate user input into the file lookup.
 * @param {string} name exact basename from the allowlist
 * @returns {{ path: string, type: string }}
 */
export function resolveVendorAsset(name) {
  const entry = VENDOR_ASSETS[name]
  if (!entry) {
    throw new Error(`dsh-ssh-tunnel: vendor asset not allowed: ${String(name)}`)
  }
  return { path: requireHost.resolve(entry.spec), type: entry.type }
}

/** @param {string} name checked against the allowlist only */
export function isVendorAssetAllowed(name) {
  return Object.prototype.hasOwnProperty.call(VENDOR_ASSETS, name)
}