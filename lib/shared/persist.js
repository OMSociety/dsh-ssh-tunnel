import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Missing file → fallback. Corrupt JSON → throw (never treat as empty store).
 */
export function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error('cannot read ' + path + ': ' + (e && e.message ? e.message : e))
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('corrupt json: ' + path)
  }
}

export function writeJsonAtomic(path, data, mode = 0o600) {
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode })
  try { chmodSync(tmp, mode) } catch {}
  renameSync(tmp, path)
  try { chmodSync(path, mode) } catch {}
}

export function migrateMarkerPath(dataDir) {
  return join(dataDir, '.migrated-draft')
}

export function hostEndpointKey(host, port, username) {
  return `${String(username || '').trim()}@${String(host || '').trim()}:${Number(port) || 22}`
}

export function findExistingHostByEndpoint(hosts, host, port, username) {
  const key = hostEndpointKey(host, port, username)
  return (hosts || []).find((h) => hostEndpointKey(h.host, h.port, h.username) === key)
}
