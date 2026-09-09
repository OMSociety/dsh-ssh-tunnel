import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve as pathResolve } from 'node:path'

export const WORKSPACE_ROOT = '/workspace'

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
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/**
 * Whether abs is inside one of the allowed roots (lexical, after resolve).
 * Does not follow symlinks — use constrainToWorkspace for FS operations.
 */
export function isPathInsideRoots(absPath, roots) {
  const abs = normalizeProjectKey(absPath)
  if (!abs) return false
  const list = (roots || []).map(normalizeProjectKey).filter(Boolean)
  for (const root of list) {
    if (abs === root || abs.startsWith(root + '/')) return true
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
 * /workspace both lexically and after following existing symlinks.
 *
 * `{ forUnlink: true }` allows deleting a symlink whose *lexical* path is
 * under /workspace without following it (unlink the link, never the target).
 */
export function constrainToWorkspace(inputPath, { forUnlink = false } = {}) {
  if (inputPath == null || String(inputPath).trim() === '') {
    throw new Error('local path required')
  }
  let abs = String(inputPath)
  if (!isAbsolute(abs)) abs = join(WORKSPACE_ROOT, abs)
  abs = pathResolve(abs)
  abs = normalize(abs)
  if (abs.length > 1 && abs.endsWith('/')) abs = abs.slice(0, -1)
  if (!isPathInsideRoots(abs, [WORKSPACE_ROOT])) {
    throw new Error('local path must be under /workspace')
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
  if (real && !isPathInsideRoots(real, [WORKSPACE_ROOT])) {
    throw new Error('local path escapes /workspace via symlink')
  }
  return abs
}

export function joinUnderRoot(root, relOrAbs) {
  const r = normalizeProjectKey(root) || WORKSPACE_ROOT
  let abs = String(relOrAbs || r)
  if (!isAbsolute(abs)) abs = join(r, abs)
  abs = pathResolve(abs)
  if (!isPathInsideRoots(abs, [r, WORKSPACE_ROOT])) {
    throw new Error('path outside allowed roots')
  }
  return constrainToWorkspace(abs)
}

export { isAbsolute, join, normalize, pathResolve }
