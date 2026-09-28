import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve as pathResolve } from 'node:path'

export const WORKSPACE_ROOT = '/workspace'

/**
 * Effective workspace root for the path guard. Defaults to `/workspace`;
 * operators on hosts whose real workspace lives elsewhere (e.g. Windows drive
 * paths) can point it at the real workspace with `DSH_SSH_TUNNEL_WORKSPACE_ROOT`.
 * Read at call time so hosts and tests can set it after module load.
 */
export function workspaceRoot() {
  const env = process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT
  return env && String(env).trim() ? String(env).trim() : WORKSPACE_ROOT
}

/** Normalize a project path key (absolute, no trailing slash except root). */
export function normalizeProjectKey(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let p = raw.trim()
  if (!p) return ''
  try {
    p = pathResolve(p)
  } catch {
    return ''
  }
  p = normalize(p)
  while (p.length > 1 && (p.endsWith('/') || p.endsWith('\\'))) {
    const next = p.slice(0, -1)
    if (/^[A-Za-z]:$/.test(next)) break
    p = next
  }
  return p
}

/**
 * Comparison form for containment checks: unified separators, and on Windows
 * case-insensitive (Win32 paths are case-insensitive; keys are stored in
 * platform-native form, so string equality alone would misjudge containment).
 */
function comparablePath(p) {
  const s = p.replace(/\\/g, '/')
  return process.platform === 'win32' ? s.toLowerCase() : s
}

/**
 * Whether abs is inside one of the allowed roots (lexical, after resolve).
 * Does not follow symlinks — use constrainToWorkspace for FS operations.
 */
export function isPathInsideRoots(absPath, roots) {
  const abs = normalizeProjectKey(absPath)
  if (!abs) return false
  const list = (roots || []).map(normalizeProjectKey).filter(Boolean)
  const cAbs = comparablePath(abs)
  for (const root of list) {
    const cRoot = comparablePath(root)
    if (cAbs === cRoot) return true
    const prefix = cRoot === '/' ? '/' : cRoot + '/'
    if (cAbs.startsWith(prefix)) return true
  }
  return false
}

function realExisting(abs) {
  let probe = abs
  while (true) {
    try {
      return realpathSync(probe)
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        const parent = dirname(probe)
        if (!parent || parent === probe) return ''
        probe = parent
        continue
      }
      throw e
    }
  }
}

/**
 * Resolve a user-supplied local path and reject anything that is not under
 * the workspace root (`workspaceRoot()`) both lexically and after following
 * existing symlinks.
 *
 * `{ forUnlink: true }` allows deleting a symlink whose *lexical* path is
 * under the workspace root without following it (unlink the link, never the
 * target).
 */
export function constrainToWorkspace(inputPath, { forUnlink = false } = {}) {
  if (inputPath == null || String(inputPath).trim() === '') {
    throw new Error('local path required')
  }
  const root = workspaceRoot()
  let abs = String(inputPath)
  if (!isAbsolute(abs)) abs = join(root, abs)
  abs = pathResolve(abs)
  abs = normalize(abs)
  if (abs.length > 1 && (abs.endsWith('/') || abs.endsWith('\\'))) abs = abs.slice(0, -1)
  if (!isPathInsideRoots(abs, [root])) {
    throw new Error('local path must be under ' + root)
  }
  if (forUnlink) {
    try {
      const st = lstatSync(abs)
      if (st.isSymbolicLink()) return abs
    } catch (e) {
      if (!(e && e.code === 'ENOENT')) throw e
    }
  }
  const real = realExisting(abs)
  if (real && !isPathInsideRoots(real, [root])) {
    throw new Error('local path escapes ' + root + ' via symlink')
  }
  return abs
}

export function joinUnderRoot(root, relOrAbs) {
  const wsRoot = workspaceRoot()
  const r = normalizeProjectKey(root) || wsRoot
  let abs = String(relOrAbs || r)
  if (!isAbsolute(abs)) abs = join(r, abs)
  abs = pathResolve(abs)
  if (!isPathInsideRoots(abs, [r, wsRoot])) {
    throw new Error('path outside allowed roots')
  }
  return constrainToWorkspace(abs)
}

export { isAbsolute, join, normalize, pathResolve }
