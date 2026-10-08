/**
 * dsh-ssh-tunnel — host half
 * LiveAgent-style multi-host SSH + project-scoped grants + SSHManager tool.
 */
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Client } from 'ssh2'
import {
  normalizeProjectKey,
  constrainToWorkspace,
} from './shared/path.js'
import {
  hostCredentialConfigured,
  publicHost,
  modelHostSummary,
} from './shared/host-summary.js'
import { requireString, stringOrDefault } from './shared/args.js'
import {
  fingerprintFromHostKey,
  formatHostFingerprint,
  isUsableHostFingerprint,
} from './shared/host-key.js'
import {
  API_ERROR_STATUS,
  MAX_BYTES_SFTP_READ_DEFAULT,
  SSH_KEEPALIVE_COUNT_MAX,
  SSH_KEEPALIVE_INTERVAL_MS,
  SSH_READY_TIMEOUT_MS,
  SSH_RECONNECT_ATTEMPT_TIMEOUT_MS,
  SSH_STATUS_DISCONNECTED,
  SSH_STATUS_RECONNECTING,
  clampMaxBytes,
  disconnectedSessionError,
  hostKeyPromptMessage,
  isLiveStatus,
  kbiReconnectError,
  kbiUnsupportedError,
  pickOldestTombstone,
  defaultTimeoutMsForAction,
  SSH_TOOL_TIMEOUT_MS,
  sshError,
  withTimeout,
} from './shared/session-policy.js'
import { createSessionRegistry } from './session.js'
import {
  assertSessionStillAuthorized,
  discardRevokedLocalFile,
} from './shared/session-auth.js'
import { isTrustedRequest, MAX_JSON_BODY_BYTES } from './shared/http-trust.js'
import {
  findExistingHostByEndpoint,
  migrateMarkerPath,
  readJsonFile,
  writeJsonAtomic,
} from './shared/persist.js'
import { resolveVendorAsset } from './shared/vendor.js'

// Out-of-tree plugins cannot reliably resolve @deepseek-ai/dsh-tools (see modlens).
// Register a raw JSON-Schema tool definition via ctx.tools.register instead of defineTool.
const requireSelf = createRequire(import.meta.url)

let PLUGIN_VERSION = '0.0.0'
try {
  PLUGIN_VERSION = String(requireSelf('../package.json').version || PLUGIN_VERSION)
} catch {}

export const name = 'dsh-ssh-tunnel'
// webRuntime is deliberately NOT injected: it belongs to the web-app bundle row
// and is optional here. Reading it without inject requires ctx.get(name, true) —
// a bare ctx.webRuntime throws when the service is not injected.
export const inject = ['webServer', 'sessions', 'tools']

/** Set true after SSHManager successfully enters the tools registry. */
let sshManagerRegistered = false

const DATA_DIR = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'ssh-tunnel')
  : join(homedir(), '.dsh/ssh-tunnel')
const HOSTS_PATH = join(DATA_DIR, 'hosts.json')
const SECRETS_PATH = join(DATA_DIR, 'secrets.json')
const GRANTS_PATH = join(DATA_DIR, 'grants.json')
const KNOWN_PATH = join(DATA_DIR, 'known_hosts.json')

function rmLocalRecursive(abs) {
  const st = lstatSync(abs)
  if (st.isSymbolicLink() || st.isFile()) {
    unlinkSync(abs)
    return
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) {
      rmLocalRecursive(join(abs, name))
    }
    rmdirSync(abs)
    return
  }
  unlinkSync(abs)
}

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true })
  try { chmodSync(DATA_DIR, 0o700) } catch {}
}

function readJson(path, fallback) {
  return readJsonFile(path, fallback)
}

function writeJsonFile(path, data, mode = 0o600) {
  ensureDataDir()
  writeJsonAtomic(path, data, mode)
}


function sessionCwdOf(ctx, sessionId, clientCwd) {
  try {
    const headerCwd = ctx.sessions?.get?.(sessionId)?.header?.cwd
    if (headerCwd) return normalizeProjectKey(headerCwd)
  } catch {}
  if (clientCwd) return normalizeProjectKey(clientCwd)
  return ''
}

/* ---------------- Host store ---------------- */

function emptyHosts() {
  return { version: 1, hosts: [] }
}

function loadHosts() {
  const data = readJson(HOSTS_PATH, emptyHosts())
  if (!Array.isArray(data.hosts)) data.hosts = []
  data.version = 1
  return data
}

function saveHosts(data) {
  writeJsonFile(HOSTS_PATH, { version: 1, hosts: data.hosts || [] }, 0o600)
}

function loadSecrets() {
  return readJson(SECRETS_PATH, { version: 1, byHostId: {} })
}

function saveSecrets(data) {
  writeJsonFile(SECRETS_PATH, { version: 1, byHostId: data.byHostId || {} }, 0o600)
}

function loadGrants() {
  return readJson(GRANTS_PATH, { version: 1, projects: {} })
}

function saveGrants(data) {
  writeJsonFile(GRANTS_PATH, { version: 1, projects: data.projects || {} }, 0o600)
}

function loadKnown() {
  return readJson(KNOWN_PATH, { version: 1, keys: {} })
}

function saveKnown(data) {
  writeJsonFile(KNOWN_PATH, { version: 1, keys: data.keys || {} }, 0o600)
}




function upsertHostRecord(input) {
  const hostsDoc = loadHosts()
  const secrets = loadSecrets()
  const id = (input.id && String(input.id).trim()) || randomUUID()
  const existing = hostsDoc.hosts.find((h) => h.id === id)
  const authType = input.authType || existing?.authType || 'privateKey'
  if (authType === 'keyboardInteractive') {
    throw new Error(kbiUnsupportedError())
  }
  const record = {
    id,
    name: String(input.name || existing?.name || input.host || 'host').trim() || 'host',
    host: String(input.host || existing?.host || '').trim(),
    port: Number(input.port != null ? input.port : existing?.port) || 22,
    username: String(input.username || existing?.username || '').trim(),
    authType,
    privateKeyPath:
      input.privateKeyPath !== undefined
        ? String(input.privateKeyPath || '')
        : existing?.privateKeyPath || '',
    source: input.source || existing?.source || 'manual',
    updatedAt: Date.now(),
  }
  if (!record.host || !record.username) {
    throw new Error('host and username are required')
  }
  const sec = Object.assign({}, secrets.byHostId[id] || {})
  if (input.password !== undefined) {
    if (input.password === '' || input.password == null) delete sec.password
    else sec.password = String(input.password)
  }
  if (input.privateKeyPem !== undefined) {
    if (input.privateKeyPem === '' || input.privateKeyPem == null) delete sec.privateKeyPem
    else sec.privateKeyPem = String(input.privateKeyPem)
  }
  if (input.passphrase !== undefined) {
    if (input.passphrase === '' || input.passphrase == null) delete sec.passphrase
    else sec.passphrase = String(input.passphrase)
  }
  if (Object.keys(sec).length) secrets.byHostId[id] = sec
  else delete secrets.byHostId[id]

  if (existing) {
    hostsDoc.hosts = hostsDoc.hosts.map((h) => (h.id === id ? record : h))
  } else {
    hostsDoc.hosts.push(record)
  }
  saveHosts(hostsDoc)
  saveSecrets(secrets)
  return publicHost(record, secrets)
}

function deleteHostRecord(id) {
  const hostsDoc = loadHosts()
  hostsDoc.hosts = hostsDoc.hosts.filter((h) => h.id !== id)
  saveHosts(hostsDoc)
  const secrets = loadSecrets()
  delete secrets.byHostId[id]
  saveSecrets(secrets)
  // Prompts pointing at a deleted host can never be answered usefully.
  for (const [promptId, p] of pendingPrompts) {
    if (String(p.hostId) === String(id)) pendingPrompts.delete(promptId)
  }
  const grants = loadGrants()
  for (const key of Object.keys(grants.projects || {})) {
    const g = grants.projects[key]
    if (g && Array.isArray(g.hostIds)) {
      const had = new Set(g.hostIds).has(id)
      g.hostIds = g.hostIds.filter((x) => x !== id)
      g.updatedAt = Date.now()
      if (had) registry.closeSessionsForHost(key, id)
    }
  }
  saveGrants(grants)
  return { ok: true }
}

function scanOpenSsh() {
  // Only the user's real ~/.ssh: a fixed /workspace path assumed a mount that
  // other hosts do not have.
  const dirs = [join(homedir(), '.ssh')]
  const found = []
  const configPaths = dirs.map((d) => join(d, 'config'))
  for (const cfgPath of configPaths) {
    if (!existsSync(cfgPath)) continue
    let text = ''
    try { text = readFileSync(cfgPath, 'utf8') } catch { continue }
    let current = null
    const flush = () => {
      if (current && current.patterns.length) found.push(current)
      current = null
    }
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const m = /^(Host|HostName|User|Port|IdentityFile)\s+(.+)$/i.exec(t)
      if (!m) continue
      const key = m[1].toLowerCase()
      const val = m[2].trim().replace(/^"|"$/g, '')
      if (key === 'host') {
        flush()
        const patterns = val.split(/\s+/).filter((p) => p && p !== '*')
        current = { patterns, hostName: '', user: '', port: 22, identityFile: '' }
      } else if (current) {
        if (key === 'hostname') current.hostName = val
        if (key === 'user') current.user = val
        if (key === 'port') current.port = Number(val) || 22
        if (key === 'identityfile') current.identityFile = val.replace(/^~(?=\/)/, homedir())
      }
    }
    flush()
  }
  // Only files that actually carry a private key header: without this the scan
  // reported config backups, known_hosts.old, allowed_signers etc. as keys.
  const keyHeader = /^-----BEGIN [A-Z ]*PRIVATE KEY-----/
  const keyFiles = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        let head = ''
        try {
          if (!statSync(p).isFile()) continue
          const fd = readFileSync(p, { encoding: 'utf8', flag: 'r' })
          head = fd.split(/\r?\n/, 1)[0] || ''
        } catch { continue }
        if (keyHeader.test(head.trim())) keyFiles.push(p)
      }
    } catch {}
  }
  return {
    configs: found.map((c) => ({
      name: c.patterns[0],
      patterns: c.patterns,
      host: c.hostName || c.patterns[0],
      username: c.user || '',
      port: c.port || 22,
      privateKeyPath: c.identityFile || '',
      authType: 'privateKey',
    })),
    privateKeys: keyFiles,
  }
}

function importScanEntry(entry) {
  // No implicit "root": a scan entry without User must be completed by the
  // user, not silently saved as root (upsert rejects the empty username).
  return upsertHostRecord({
    name: entry.name || entry.host,
    host: entry.host,
    port: entry.port || 22,
    username: String(entry.username || '').trim(),
    authType: 'privateKey',
    privateKeyPath: entry.privateKeyPath || '',
    source: 'openssh-scan',
  })
}

/* ---------------- Grants ---------------- */

function getProjectGrants(projectPathKey) {
  const key = normalizeProjectKey(projectPathKey)
  const grants = loadGrants()
  const g = grants.projects[key] || { hostIds: [], updatedAt: 0 }
  return { projectPathKey: key, hostIds: [...(g.hostIds || [])], updatedAt: g.updatedAt || 0 }
}

function setProjectGrants(projectPathKey, hostIds) {
  const key = normalizeProjectKey(projectPathKey)
  if (!key) throw sshError('bad_request', 'projectPathKey required')
  const grants = loadGrants()
  const ids = [...new Set((hostIds || []).map((x) => String(x).trim()).filter(Boolean))]
  const prev = new Set((grants.projects[key]?.hostIds) || [])
  grants.projects[key] = { hostIds: ids, updatedAt: Date.now() }
  saveGrants(grants)
  // Security: removing a host from a project grant must terminate its live
  // sessions in this project, not just block new connections.
  for (const removed of prev) {
    if (!ids.includes(String(removed))) registry.closeSessionsForHost(key, String(removed))
  }
  return getProjectGrants(key)
}

/**
 * Authorization predicate for using an SSH session: the host must still exist
 * and be granted to the session's own project at use time. Re-evaluated on
 * every session use / reconnect so a grant revocation takes effect immediately.
 */
function isHostAuthorized(projectPathKey, hostId) {
  const key = normalizeProjectKey(projectPathKey)
  if (!key || !hostId) return false
  const { hostIds } = getProjectGrants(key)
  return hostIds.includes(String(hostId)) && !!getHostById(String(hostId))
}

/* ---------------- Sessions ---------------- */

/** @type {Map<string, any>} */
const pendingPrompts = new Map()

// Prompts are one-shot UI state, not durable data: untrusted prompts must not
// accumulate forever (a client that never answers would otherwise pin them).
const PROMPT_TTL_MS = 5 * 60_000
const PROMPT_MAX = 50

function setPendingPrompt(prompt) {
  const now = Date.now()
  for (const [id, p] of pendingPrompts) {
    if (p.expiresAt <= now) pendingPrompts.delete(id)
  }
  while (pendingPrompts.size >= PROMPT_MAX) {
    let oldestId = ''
    let oldestAt = Infinity
    for (const [id, p] of pendingPrompts) {
      if ((p.createdAt || 0) < oldestAt) {
        oldestAt = p.createdAt || 0
        oldestId = id
      }
    }
    if (!oldestId) break
    pendingPrompts.delete(oldestId)
  }
  const promptId = randomUUID()
  pendingPrompts.set(promptId, { ...prompt, createdAt: now, expiresAt: now + PROMPT_TTL_MS })
  return promptId
}

// A mutating action that already reached the remote host before the grant was
// revoked must not be reported as if nothing happened.
const REVOKED_AFTER_RUN =
  'The operation already ran on the remote host, but the host lost project access before the result could be returned; the change stands remotely and the result is withheld.'
const DOWNLOAD_DISCARDED =
  "The host's project access was revoked during the transfer; the partially downloaded file was discarded and nothing was delivered."

function loadPrivateKeyMaterial(host, secrets) {
  const sec = secrets.byHostId[host.id] || {}
  if (sec.privateKeyPem) return Buffer.from(sec.privateKeyPem)
  if (host.privateKeyPath) {
    const p = String(host.privateKeyPath).replace(/^~(?=\/)/, homedir())
    if (!existsSync(p)) throw new Error('Cannot read private key: ' + p)
    return readFileSync(p)
  }
  throw new Error('No private key configured')
}

function buildConnectOpts(host, secrets) {
  const opts = {
    host: host.host,
    port: host.port || 22,
    username: host.username,
    readyTimeout: SSH_READY_TIMEOUT_MS,
    keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
    // Pass a hex digest into hostVerifier (not a raw key Buffer).
    hostHash: 'sha256',
  }
  const sec = secrets.byHostId[host.id] || {}
  if (host.authType === 'password') {
    if (!sec.password) throw new Error('password not configured')
    opts.password = sec.password
  } else if (host.authType === 'keyboardInteractive') {
    throw new Error(kbiUnsupportedError())
  } else {
    opts.privateKey = loadPrivateKeyMaterial(host, secrets)
    if (sec.passphrase) opts.passphrase = sec.passphrase
  }
  return opts
}

function knownKeyId(host, port) {
  return `${host}:${port || 22}`
}

function connectSsh(host, secrets, options = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const opts = buildConnectOpts(host, secrets)
    const known = loadKnown()
    const kid = knownKeyId(host.host, host.port)
    let settled = false

    const finishErr = (e) => {
      if (settled) return
      settled = true
      try { client.end() } catch {}
      reject(e instanceof Error ? e : new Error(String(e)))
    }
    const finishOk = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    // ssh2 hostVerifier: with hostHash, key is sha256 hex; otherwise Buffer (we still normalize).
    opts.hostVerifier = (hashedKey, callback) => {
      const fp = fingerprintFromHostKey(hashedKey)
      const stored = known.keys[kid]
      const storedFp = stored && isUsableHostFingerprint(stored.fingerprint)
        ? String(stored.fingerprint).trim().toLowerCase()
        : ''
      const decide = (ok) => {
        if (typeof callback === 'function') {
          try { callback(ok) } catch {}
          return
        }
        return ok
      }
      const remember = () => {
        known.keys[kid] = {
          fingerprint: fp,
          algo: 'sha256',
          trustedAt: Date.now(),
        }
        saveKnown(known)
      }
      // Missing, legacy binary String(Buffer), or unusable entries → re-prompt (safe migration).
      if (!stored || !storedFp) {
        if (options.trustHostKey) {
          remember()
          return decide(true)
        }
        const promptId = setPendingPrompt({
          kind: 'host_key',
          hostId: host.id,
          host: host.host,
          port: host.port || 22,
          fingerprint: fp,
          fingerprintAlgo: 'SHA256',
          projectPathKey: normalizeProjectKey(options.projectPathKey || ''),
          message: `Unknown host key for ${host.host}:${host.port || 22} (${formatHostFingerprint(fp)})`,
        })
        finishErr(Object.assign(new Error('SSH_PROMPT'), { promptId, kind: 'host_key' }))
        return decide(false)
      }
      if (storedFp !== fp) {
        const promptId = setPendingPrompt({
          kind: 'host_key_changed',
          hostId: host.id,
          host: host.host,
          port: host.port || 22,
          fingerprint: fp,
          fingerprintAlgo: 'SHA256',
          previous: storedFp,
          projectPathKey: normalizeProjectKey(options.projectPathKey || ''),
          message: `Host key changed for ${host.host}:${host.port || 22} (new ${formatHostFingerprint(fp)})`,
        })
        finishErr(Object.assign(new Error('SSH_PROMPT'), { promptId, kind: 'host_key_changed' }))
        return decide(false)
      }
      return decide(true)
    }

    client.on('ready', () => finishOk(client))
    client.on('error', finishErr)
    try {
      client.connect(opts)
    } catch (e) {
      finishErr(e)
    }
  })
}

const registry = createSessionRegistry({
  connectClient: (host, secrets, options) => connectSsh(host, secrets, options),
  loadSecrets,
  getPrompt: (promptId) => pendingPrompts.get(promptId),
  getHostById,
  isHostAuthorized,
})

/* ---------------- SFTP helpers ---------------- */

function sftpTimed(action, work, opts = {}, onTimeout) {
  return withTimeout(typeof work === 'function' ? work() : work, opts.timeoutMs ?? defaultTimeoutMsForAction(action), {
    signal: opts.signal,
    onTimeout,
  })
}

function sftpStat(sftp, remotePath, opts = {}) {
  return sftpTimed(
    'sftp_stat',
    () => new Promise((resolve, reject) => {
      sftp.stat(remotePath, (err, st) => (err ? reject(err) : resolve(st)))
    }),
    opts,
  )
}

function sftpReaddir(sftp, remotePath, opts = {}) {
  return sftpTimed(
    'sftp_list',
    () => new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => (err ? reject(err) : resolve(list || [])))
    }),
    opts,
  )
}

function sftpReadFile(sftp, remotePath, maxBytes = 512 * 1024, opts = {}) {
  let rs
  return sftpTimed(
    'sftp_read_text',
    () => new Promise((resolve, reject) => {
      const chunks = []
      let total = 0
      rs = sftp.createReadStream(remotePath)
      rs.on('data', (c) => {
        total += c.length
        if (total <= maxBytes) chunks.push(c)
      })
      rs.on('error', reject)
      rs.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({ content: buf.toString('utf8'), truncated: total > maxBytes, size: total })
      })
    }),
    opts,
    () => {
      try { rs?.destroy?.() } catch {}
    },
  )
}

function sftpWriteFile(sftp, remotePath, content, opts = {}) {
  let ws
  return sftpTimed(
    'sftp_write_text',
    () => new Promise((resolve, reject) => {
      ws = sftp.createWriteStream(remotePath)
      ws.on('error', reject)
      ws.on('close', () => resolve({ ok: true }))
      ws.end(content)
    }),
    opts,
    () => {
      try { ws?.destroy?.() } catch {}
    },
  )
}

function sftpMkdir(sftp, remotePath, opts = {}) {
  return sftpTimed(
    'sftp_mkdir',
    () => new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

function sftpRename(sftp, from, to, opts = {}) {
  return sftpTimed(
    'sftp_rename',
    () => new Promise((resolve, reject) => {
      sftp.rename(from, to, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

function sftpUnlink(sftp, remotePath, opts = {}) {
  return sftpTimed(
    'sftp_delete',
    () => new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

function sftpRmdir(sftp, remotePath, opts = {}) {
  return sftpTimed(
    'sftp_delete',
    () => new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

function sftpFastGet(sftp, remote, local, opts = {}) {
  return sftpTimed(
    'sftp_download',
    () => new Promise((resolve, reject) => {
      sftp.fastGet(remote, local, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

function sftpFastPut(sftp, local, remote, opts = {}) {
  return sftpTimed(
    'sftp_upload',
    () => new Promise((resolve, reject) => {
      sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve({ ok: true })))
    }),
    opts,
  )
}

/**
 * Local root for sidebar file operations: the project workspace it displays.
 * The client already sends this key, so the guard can use the real workspace
 * instead of a hard-coded `/workspace`.
 */
function localProjectRoot(body) {
  const src = body || {}
  return normalizeProjectKey(src.projectPathKey || src.cwd || '')
}

/**
 * Guard a local path against the project workspace the user opened rather than
 * a fixed `/workspace`: on hosts whose workspace is a Windows drive path the
 * fixed root rejects every real local path, which breaks SFTP upload/download
 * and local file browsing.
 */
function assertWorkspaceLocal(localPath, projectPathKey = '') {
  return constrainToWorkspace(localPath, { root: projectPathKey })
}

/* ---------------- Resolve session for tools ---------------- */

function getHostById(id) {
  return loadHosts().hosts.find((h) => h.id === id)
}

function allowedHostMap(projectPathKey) {
  const { hostIds } = getProjectGrants(projectPathKey)
  const secrets = loadSecrets()
  const map = new Map()
  for (const id of hostIds) {
    const h = getHostById(id)
    if (h) map.set(id, h)
  }
  return { map, secrets, hostIds }
}

async function resolveSession(args, projectPathKey, needsSftp, signal) {
  const strategy = args.session_strategy || 'reuse_or_create'
  if (!['reuse_or_create', 'new', 'require_existing'].includes(strategy)) {
    throw new Error('SSHManager.session_strategy is invalid.')
  }
  const sessionId = args.session_id ? String(args.session_id).trim() : ''
  const { map: allowed, hostIds } = allowedHostMap(projectPathKey)
  if (!hostIds.length) throw new Error('No SSH hosts are associated with the current project.')

  if (sessionId) {
    if (strategy === 'new') throw new Error('SSHManager.session_strategy=new cannot be combined with session_id.')
    const s = registry.get(sessionId)
    if (!s || s.projectPathKey !== normalizeProjectKey(projectPathKey)) {
      throw new Error('SSH session not found in the current project.')
    }
    if (!allowed.has(s.hostId)) throw new Error('SSH session host is not authorized for the current project.')
    if (needsSftp && !s.sftpEnabled) {
      throw new Error('SSH session does not have SFTP enabled. Use host_id to reuse or create an SFTP-enabled session.')
    }
    if (s.status === SSH_STATUS_DISCONNECTED) {
      throw new Error(disconnectedSessionError())
    }
    if (s.status === SSH_STATUS_RECONNECTING) {
      const live = await registry.waitForLive(sessionId, SSH_RECONNECT_ATTEMPT_TIMEOUT_MS)
      if (needsSftp && !live.sftpEnabled) {
        throw new Error('SSH session does not have SFTP enabled. Use host_id to reuse or create an SFTP-enabled session.')
      }
      return { session: live, reused: true, created: false, strategy: 'session_id' }
    }
    if (!isLiveStatus(s.status, s.running) || !s.client) {
      throw new Error('session not running')
    }
    return { session: s, reused: true, created: false, strategy: 'session_id' }
  }

  const hostId = String(args.host_id || '').trim()
  if (!hostId) throw new Error('SSHManager.host_id is required.')
  const host = allowed.get(hostId)
  if (!host) throw new Error('SSH host is not associated with the current project.')

  if (strategy !== 'new') {
    const reusable = registry.findReusableSession(projectPathKey, hostId, !!needsSftp)
    if (reusable) {
      return { session: reusable, reused: true, created: false, strategy }
    }
    if (strategy === 'reuse_or_create') {
      const tomb = pickOldestTombstone([...registry.sessions.values()], {
        projectPathKey: normalizeProjectKey(projectPathKey),
        hostId,
        needsSftp: !!needsSftp,
      })
      if (tomb) {
        if (host.authType === 'keyboardInteractive') throw new Error(kbiUnsupportedError())
        await registry.reconnectSession(tomb.id, {
          manual: true,
          signal,
          projectPathKey,
        })
        const revived = registry.get(tomb.id)
        if (!revived || !isLiveStatus(revived.status, revived.running)) {
          throw new Error('SSH reconnect failed; session left disconnected.')
        }
        return { session: revived, reused: true, created: false, revived: true, strategy }
      }
    }
    if (strategy === 'require_existing') {
      throw new Error('No reusable SSH session exists for this host in the current project.')
    }
  }

  if (host.authType === 'keyboardInteractive') {
    throw new Error(kbiUnsupportedError())
  }

  const created = await registry.createLiveSession({
    host,
    projectPathKey,
    title: args.title || `SSHManager: ${host.name || host.host}`,
    sftpEnabled: true,
    trustHostKey: false,
  })
  if (!created.ok) {
    throw new Error(created.message || hostKeyPromptMessage())
  }
  const s = registry.get(created.session.session_id)
  return { session: s, reused: false, created: true, strategy }
}

/* ---------------- HTTP helpers ---------------- */

function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Serve an allowlisted vendor asset (browser terminal UMD/CSS) same-origin. */
async function serveVendor(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(req.url || '/', 'http://dsh.internal').pathname
    const prefix = '/dsh-ssh-tunnel/vendor/'
    if (!pathname.startsWith(prefix)) {
      res.writeHead(404)
      res.end()
      return
    }
    const name = pathname.slice(prefix.length)
    // allowlist only: the resolver throws for anything else (incl. traversal)
    const { path: filePath, type } = resolveVendorAsset(name)
    const body = readFileSync(filePath)
    res.statusCode = 200
    res.setHeader('content-type', type)
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    res.setHeader('x-content-type-options', 'nosniff')
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    res.writeHead(404)
    res.end()
  }
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_JSON_BODY_BYTES) {
      throw sshError('payload_too_large', 'request body too large')
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

/* ---------------- API + Tool ---------------- */

async function handleApi(method, body, ctx) {
  if (method === 'health') {
    return {
      ok: true,
      version: PLUGIN_VERSION,
      name: 'dsh-ssh-tunnel',
      sshManagerRegistered,
    }
  }

  if (method === 'getProjectContext') {
    const sessionId = body.sessionId || ''
    const projectPathKey = sessionCwdOf(ctx, sessionId, body.cwd)
    return { sessionId, projectPathKey, hasProject: !!projectPathKey }
  }

  if (method === 'listHosts') {
    const secrets = loadSecrets()
    return { hosts: loadHosts().hosts.map((h) => publicHost(h, secrets)) }
  }

  if (method === 'saveHost') {
    return { ok: true, host: upsertHostRecord(body.host || body) }
  }

  if (method === 'deleteHost') {
    return deleteHostRecord(String(body.id || ''))
  }

  if (method === 'scanOpenSsh') {
    return scanOpenSsh()
  }

  if (method === 'importScan') {
    const host = importScanEntry(body.entry || body)
    return { ok: true, host }
  }

  if (method === 'getGrants') {
    const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
    return getProjectGrants(projectPathKey)
  }

  if (method === 'setGrants') {
    return setProjectGrants(body.projectPathKey || body.cwd, body.hostIds || [])
  }

  if (method === 'listSessions') {
    const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
    return { sessions: registry.listSessionsForProject(projectPathKey) }
  }

  if (method === 'connect') {
    const host = getHostById(body.hostId || body.host_id)
    if (!host) throw sshError('not_found', 'host not found')
    const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
    if (!projectPathKey) throw sshError('bad_request', 'projectPathKey required')
    // Project access is explicit (Grants tab / setGrants). Connect must not silently expand it.
    const grants = getProjectGrants(projectPathKey)
    if (!grants.hostIds.includes(host.id)) {
      throw sshError(
        'forbidden',
        'host is not authorized for this project; grant access under Project access before connecting',
      )
    }
    const result = await registry.createLiveSession({
      host,
      projectPathKey,
      title: body.title,
      sftpEnabled: body.sftpEnabled !== false,
      trustHostKey: !!body.trustHostKey,
    })
    return result
  }

  if (method === 'disconnect') {
    return registry.closeSession(String(body.sessionId || body.session_id || ''), body.projectPathKey)
  }

  if (method === 'reconnect') {
    try {
      return await registry.reconnectSession(String(body.sessionId || body.session_id || ''), {
        manual: true,
        projectPathKey: body.projectPathKey,
      })
    } catch (e) {
      // Same shape as connect: a host-key prompt must reach the tab UI with
      // its promptId, not die as a generic error.
      if (e && e.isPromptError) {
        return {
          ok: false,
          sshPrompt: pendingPrompts.get(e.promptId),
          promptId: e.promptId,
          message: hostKeyPromptMessage(),
        }
      }
      throw e
    }
  }

  if (method === 'answerPrompt') {
    const promptId = String(body.promptId || '')
    const p = pendingPrompts.get(promptId)
    if (!p) throw sshError('not_found', 'prompt not found')
    if (p.expiresAt <= Date.now()) {
      pendingPrompts.delete(promptId)
      throw sshError('gone', 'prompt expired; reconnect to raise a fresh prompt')
    }
    if (body.trustHostKey && (p.kind === 'host_key' || p.kind === 'host_key_changed')) {
      // Trusting a key for a host that no longer exists is pointless and hides
      // the failure from the tab UI.
      if (!getHostById(p.hostId)) {
        pendingPrompts.delete(promptId)
        throw sshError('not_found', 'host no longer exists')
      }
      const fp = fingerprintFromHostKey(p.fingerprint)
      if (!isUsableHostFingerprint(fp)) {
        throw sshError('bad_request', 'invalid host key fingerprint in prompt')
      }
      const known = loadKnown()
      known.keys[knownKeyId(p.host, p.port)] = {
        fingerprint: fp,
        algo: 'sha256',
        trustedAt: Date.now(),
      }
      saveKnown(known)
      pendingPrompts.delete(promptId)
      if (body.connectAfter) {
        const host = getHostById(p.hostId)
        if (!host) return { ok: true, trusted: true }
        const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
        if (!projectPathKey) return { ok: true, trusted: true, connected: false, error: 'projectPathKey required' }
        const grants = getProjectGrants(projectPathKey)
        if (!grants.hostIds.includes(host.id)) {
          return {
            ok: true,
            trusted: true,
            connected: false,
            error:
              'host is not authorized for this project; grant access under Project access before connecting',
          }
        }
        return registry.createLiveSession({
          host,
          projectPathKey,
          title: body.title,
          sftpEnabled: body.sftpEnabled !== false,
          trustHostKey: true,
        })
      }
      return { ok: true, trusted: true }
    }
    pendingPrompts.delete(promptId)
    return { ok: true }
  }

  if (method === 'listPrompts') {
    const now = Date.now()
    const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
    const prompts = []
    for (const [id, p] of pendingPrompts) {
      if (p.expiresAt <= now) {
        pendingPrompts.delete(id)
        continue
      }
      // Optional filter: the tab UI passes its project and only sees its own
      // prompts; unfiltered callers keep seeing everything.
      if (projectPathKey && p.projectPathKey && p.projectPathKey !== projectPathKey) continue
      prompts.push(Object.assign({ promptId: id }, p))
    }
    return { prompts }
  }

  if (method === 'shellOpen') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    await registry.ensureShell(s)
    assertSessionStillAuthorized(s, isHostAuthorized)
    return {
      ok: true,
      session_id: s.id,
      output: s.getOutputText(),
      seq: s.outputSeq || 0,
    }
  }

  if (method === 'shellRead') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.shellStream) await registry.ensureShell(s)
    // since = last seq the reader has seen; baseSeq/dropped report ring-buffer
    // eviction so the client can refetch instead of silently skipping output.
    const sliced = s.chunkFrom(Number(body.since) || 0)
    assertSessionStillAuthorized(s, isHostAuthorized)
    return {
      ok: true,
      session_id: s.id,
      chunk: sliced.chunk,
      length: sliced.length,
      since: sliced.since,
      seq: sliced.seq,
      baseSeq: sliced.baseSeq,
      dropped: sliced.dropped,
      chunkTruncated: sliced.chunkTruncated,
      running: !!s.running,
    }
  }

  if (method === 'shellWrite') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    const stream = await registry.ensureShell(s)
    const data = body.data != null ? String(body.data) : ''
    if (!data) throw sshError('bad_request', 'data required')
    stream.write(data)
    s.updatedAt = Date.now()
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true }
  }

  if (method === 'shellResize') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    const stream = await registry.ensureShell(s)
    const cols = Number(body.cols) || 80
    const rows = Number(body.rows) || 24
    if (typeof stream.setWindow === 'function') stream.setWindow(rows, cols, 0, 0)
    assertSessionStillAuthorized(s, isHostAuthorized)
    return { ok: true, cols, rows }
  }

  if (method === 'sftpList') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remotePath = String(body.path || '.')
    const list = await sftpReaddir(s.sftp, remotePath)
    const entries = []
    for (const e of list) {
      const name = e.filename
      if (!name || name === '.') continue
      const attrs = e.attrs || {}
      let isDir = false
      try {
        if (typeof attrs.isDirectory === 'function') isDir = attrs.isDirectory()
        else if (attrs.mode != null) isDir = (attrs.mode & 0o170000) === 0o040000
      } catch {}
      entries.push({
        name,
        path: remotePath === '/' ? '/' + name : (remotePath.replace(/\/$/, '') + '/' + name),
        isDirectory: isDir,
        size: attrs.size || 0,
        mtime: attrs.mtime || 0,
        longname: e.longname || name,
      })
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    assertSessionStillAuthorized(s, isHostAuthorized)
    return { ok: true, path: remotePath, entries }
  }

  if (method === 'sftpReadText') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remotePath = requireString(body.path, 'path')
    const r = await sftpReadFile(s.sftp, remotePath, clampMaxBytes(body.maxBytes, MAX_BYTES_SFTP_READ_DEFAULT))
    assertSessionStillAuthorized(s, isHostAuthorized)
    return { ok: true, path: remotePath, ...r }
  }

  if (method === 'sftpWriteText') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remotePath = requireString(body.path, 'path')
    await sftpWriteFile(s.sftp, remotePath, String(body.content ?? ''))
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpMkdir') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remotePath = requireString(body.path, 'path')
    await sftpMkdir(s.sftp, remotePath)
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpDelete') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remotePath = requireString(body.path, 'path')
    try {
      await sftpUnlink(s.sftp, remotePath)
    } catch {
      await sftpRmdir(s.sftp, remotePath)
    }
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpRename') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const from = stringOrDefault(body.from_path, body.from, 'from_path')
    const to = stringOrDefault(body.to_path, body.to, 'to_path')
    await sftpRename(s.sftp, from, to)
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true }
  }

  if (method === 'sftpDownload') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const remote = requireString(body.remote_path ?? body.path, 'remote_path')
    const local = assertWorkspaceLocal(stringOrDefault(body.local_path, body.to_path, 'local_path'), localProjectRoot(body))
    mkdirSync(dirname(local), { recursive: true })
    try {
      await sftpFastGet(s.sftp, remote, local)
    } catch (e) {
      if (discardRevokedLocalFile(s, local, isHostAuthorized)) {
        throw sshError('forbidden', DOWNLOAD_DISCARDED)
      }
      throw e
    }
    if (discardRevokedLocalFile(s, local, isHostAuthorized)) {
      throw sshError('forbidden', DOWNLOAD_DISCARDED)
    }
    return { ok: true, remote, local }
  }

  if (method === 'sftpUpload') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw sshError('conflict', 'SFTP not enabled on this session')
    const local = assertWorkspaceLocal(stringOrDefault(body.local_path, body.path, 'local_path'), localProjectRoot(body))
    const remote = requireString(body.remote_path ?? body.to_path, 'remote_path')
    await sftpFastPut(s.sftp, local, remote)
    assertSessionStillAuthorized(s, isHostAuthorized, REVOKED_AFTER_RUN)
    return { ok: true, local, remote }
  }


  if (method === 'localList') {
    const localRoot = localProjectRoot(body)
    const abs = constrainToWorkspace(body.path || localRoot, { root: localRoot })
    let names
    try {
      names = readdirSync(abs)
    } catch (e) {
      throw sshError('bad_request', 'cannot list: ' + (e && e.message ? e.message : e))
    }
    const entries = []
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = join(abs, name)
      try {
        constrainToWorkspace(full, { root: localRoot })
      } catch {
        continue
      }
      let st
      try { st = lstatSync(full) } catch { continue }
      const isDir = st.isDirectory()
      entries.push({
        name,
        path: full,
        isDirectory: isDir,
        size: st.size || 0,
        mtime: Math.floor((st.mtimeMs || 0) / 1000),
      })
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { ok: true, path: abs, root: localRoot, entries }
  }

  if (method === 'localMkdir') {
    const localRoot = localProjectRoot(body)
    const abs = constrainToWorkspace(body.path || localRoot, { root: localRoot })
    mkdirSync(abs, { recursive: true })
    return { ok: true, path: abs }
  }

  if (method === 'localDelete') {
    const abs = constrainToWorkspace(requireString(body.path, 'path'), { forUnlink: true, root: localProjectRoot(body) })
    rmLocalRecursive(abs)
    return { ok: true, path: abs }
  }

  if (method === 'localRename') {
    const localRoot = localProjectRoot(body)
    const from = constrainToWorkspace(stringOrDefault(body.from_path, body.from, 'from_path'), { forUnlink: true, root: localRoot })
    const to = constrainToWorkspace(stringOrDefault(body.to_path, body.to, 'to_path'), { root: localRoot })
    renameSync(from, to)
    return { ok: true, from, to }
  }

  if (method === 'migrateDraft') {
    return migrateOldDraft()
  }

  throw sshError('not_found', 'unknown method: ' + method)
}

function migrateOldDraft() {
  const marker = migrateMarkerPath(DATA_DIR)
  if (existsSync(marker)) return { ok: true, migrated: 0, skipped: true }
  // Old drafts may live under any profile name; scanning beats hard-coding web.
  const profilesDir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles')
  let draftPaths = []
  try {
    draftPaths = readdirSync(profilesDir)
      .filter((n) => n && !n.startsWith('.'))
      .map((n) => join(profilesDir, n, 'dsh-ssh-ui.draft.json'))
      .filter((p) => existsSync(p))
  } catch {
    draftPaths = []
  }
  if (!draftPaths.length) {
    writeFileSync(marker, String(Date.now()) + '\n', { mode: 0o600 })
    return { ok: true, migrated: 0 }
  }
  let n = 0
  for (const draftPath of draftPaths) {
    let raw
    try {
      raw = JSON.parse(readFileSync(draftPath, 'utf8'))
    } catch {
      continue
    }
    const profiles =
      raw.version === 2 && Array.isArray(raw.profiles)
        ? raw.profiles
        : [raw]
    for (const p of profiles) {
      if (!p || !p.host) continue
      const existing = findExistingHostByEndpoint(
        loadHosts().hosts,
        p.host,
        p.port || 22,
        p.username || 'root',
      )
      if (existing) continue
      const migratedAuth = p.authMode || p.authType || 'privateKey'
      if (migratedAuth === 'keyboardInteractive') continue
      upsertHostRecord({
        name: p.alias || `${p.username || 'user'}@${p.host}`,
        host: p.host,
        port: p.port || 22,
        username: p.username || 'root',
        authType: migratedAuth,
        privateKeyPath: p.privateKey && !String(p.privateKey).includes('BEGIN') ? p.privateKey : '',
        privateKeyPem: p.privateKey && String(p.privateKey).includes('BEGIN') ? p.privateKey : '',
        password: p.password || '',
        passphrase: p.passphrase || '',
        source: 'migrated-draft',
      })
      n++
    }
  }
  writeFileSync(marker, String(Date.now()) + '\n', { mode: 0o600 })
  return { ok: true, migrated: n }
}

function registerSshManagerTool(ctx) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    console.error('[dsh-ssh-tunnel] tools service unavailable; SSHManager tool not registered')
    return () => {}
  }
  // Read-only actions can run in parallel (e.g. next to a 300s exec); anything
  // that mutates sessions, the remote host, or the PTY stays exclusive.
  const READ_ONLY_ACTIONS = new Set([
    'list_hosts',
    'list_sessions',
    'read_session',
    'sftp_list',
    'sftp_stat',
    'sftp_read_text',
  ])
  // Raw tool definition (JSON Schema parameters) — same pattern as @liustack/modlens.
  // Do not import defineTool from @deepseek-ai/dsh-tools; out-of-tree resolution is unreliable.
  const tool = {
    name: 'SSHManager',
    timeoutMs: SSH_TOOL_TIMEOUT_MS,
    isConcurrencySafe: (args) => READ_ONLY_ACTIONS.has(String(args?.action || '').trim()),
    description:
      'Manage SSH sessions and remote SFTP for hosts associated with the current project. Use host_id from list_hosts. credential=saved means secrets are stored—do not ask user to paste them. credential=unsupported means the host uses retired keyboard-interactive auth: edit it to password or private key; never dial. Default session_strategy is reuse_or_create (revives a disconnected session for that host instead of opening another). Host-key prompts must be completed in the SSH Tunnel tab. exec defaults to 30s; SFTP metadata 30s; SFTP transfer 120s. Pass timeout_ms (1s–300s) to override. Stop cancels in-flight SSH/SFTP.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description:
            'list_hosts|list_sessions|create_session|close_session|exec|sftp_list|sftp_stat|sftp_read_text|sftp_write_text|sftp_mkdir|sftp_rename|sftp_delete|sftp_upload|sftp_download|read_session|send_input|resize_session',
        },
        host_id: { type: 'string', description: 'Authorized host id from list_hosts' },
        session_id: { type: 'string', description: 'Existing session id' },
        session_strategy: {
          type: 'string',
          description: 'reuse_or_create|new|require_existing',
        },
        title: { type: 'string' },
        command: { type: 'string', description: 'Remote command for exec' },
        cwd: { type: 'string', description: 'Remote cwd for exec' },
        path: { type: 'string' },
        from_path: { type: 'string' },
        to_path: { type: 'string' },
        content: { type: 'string' },
        local_path: { type: 'string' },
        remote_path: { type: 'string' },
        data: { type: 'string', description: 'PTY input' },
        cols: { type: 'number' },
        rows: { type: 'number' },
        timeout_ms: {
          type: 'number',
          description:
            'Operation timeout in milliseconds for exec, SFTP, and shell actions. Default 30000 for exec/SFTP metadata, 120000 for SFTP transfer. Clamped to 1000–300000. The whole SSHManager call also has a 300s host ceiling.',
        },
        max_bytes: {
          type: 'number',
          description:
            'Maximum output size in bytes for exec and sftp_read_text. Clamped to 1024–1048576; defaults 262144 (exec) and 524288 (sftp_read_text). When cut, the result sets truncated: true and contains only the first bytes.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          isError: { type: 'boolean' },
        },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const action = String(args.action || '').trim()
      const agent = exec.agent
      if (!agent) throw new Error('SSHManager requires an initiating agent')
      const sessionId = agent.session.id
      const projectPathKey = sessionCwdOf(ctx, sessionId)
      if (!projectPathKey) throw new Error('Select/open a project workspace first.')
      exec.signal?.throwIfAborted?.()
      const opOpts = { timeoutMs: args.timeout_ms, signal: exec.signal }

      const ok = (t) => ({ text: t, isError: false })
      const fail = (t) => ({ text: `SSHManager failed: ${t}`, isError: true })
      const textify = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2))

      try {
        if (action === 'list_hosts') {
          const { map, secrets } = allowedHostMap(projectPathKey)
          const lines = [...map.values()].map((h) => {
            const s = modelHostSummary(h, secrets)
            return `- ${s.host_id} · ${s.name || s.endpoint} · ${s.endpoint} · auth=${s.authType} · credential=${s.credentialStatus}`
          })
          return ok(
            lines.length > 0
              ? `project: ${projectPathKey}\n` + lines.join('\n')
              : `project: ${projectPathKey}\nNo authorized SSH hosts.`,
          )
        }

        if (action === 'list_sessions') {
          const { hostIds } = getProjectGrants(projectPathKey)
          const list = registry.listSessionsForProject(projectPathKey).filter((s) => hostIds.includes(s.host_id))
          const lines = list.map(
            (s) =>
              `- ${s.session_id} · host=${s.host_id} · ${s.status} · sftp=${s.sftpEnabled} · running=${s.running} · ${s.title}`,
          )
          return ok(lines.length ? lines.join('\n') : 'No SSH sessions in this project.')
        }

        if (action === 'create_session') {
          const resolved = await resolveSession(
            { host_id: args.host_id, session_strategy: 'new', title: args.title },
            projectPathKey,
            true,
            exec.signal,
          )
          return ok(
            textify({
              session_id: resolved.session.id,
              host_id: resolved.session.hostId,
              created: resolved.created,
              reused: resolved.reused,
              sftpEnabled: resolved.session.sftpEnabled,
            }),
          )
        }

        if (action === 'close_session') {
          const id = String(args.session_id || '')
          const s = registry.get(id)
          if (!s || s.projectPathKey !== normalizeProjectKey(projectPathKey)) {
            throw new Error('SSH session not found in the current project.')
          }
          registry.closeSession(id, projectPathKey)
          return ok(`closed ${id}`)
        }

        if (action === 'exec') {
          const command = requireString(args.command, 'command')
          const resolved = await resolveSession(args, projectPathKey, false, exec.signal)
          const result = await registry.execOnSession(resolved.session, command, {
            cwd: args.cwd,
            timeoutMs: args.timeout_ms,
            maxBytes: args.max_bytes,
            signal: exec.signal,
          })
          resolved.session.updatedAt = Date.now()
          // Result gate: the grant may have been revoked while the command
          // ran; never deliver remote output past the boundary.
          assertSessionStillAuthorized(resolved.session, isHostAuthorized)
          // ssh2 delivers exit-status on normal exit and exit-signal on signal
          // death; neither arrives when the connection itself was cut — that
          // must not read as a clean exit 0.
          const exitLine = result.exitKnown
            ? `exit: ${result.code}`
            : result.signal
              ? `exit: killed by signal ${result.signal} (no exit-status)`
              : 'exit: unknown (connection closed before the command finished; output may be partial)'
          const lines = [
            `session_id: ${resolved.session.id}`,
            `host_id: ${resolved.session.hostId}`,
            `reused: ${resolved.reused}`,
          ]
          if (result.cwd) lines.push(`cwd: ${result.cwd}`)
          if (result.truncated) lines.push('truncated: true (output limited to max_bytes)')
          lines.push(exitLine, '--- stdout ---', result.stdout || '(empty)', '--- stderr ---', result.stderr || '(empty)')
          return { text: lines.join('\n'), isError: !(result.exitKnown && result.code === 0) }
        }

        if (action === 'read_session') {
          const resolved = await resolveSession(args, projectPathKey, false, exec.signal)
          await registry.ensureShell(resolved.session, opOpts)
          const out = resolved.session.getOutputText()
          assertSessionStillAuthorized(resolved.session, isHostAuthorized)
          return ok(`session_id: ${resolved.session.id}\n\n${out || '(empty)'}`)
        }

        if (action === 'send_input') {
          const data = requireString(args.data, 'data')
          const resolved = await resolveSession(args, projectPathKey, false, exec.signal)
          const stream = await registry.ensureShell(resolved.session, opOpts)
          stream.write(data)
          assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
          return ok(`sent ${data.length} chars to ${resolved.session.id}`)
        }

        if (action === 'resize_session') {
          const resolved = await resolveSession(args, projectPathKey, false, exec.signal)
          const stream = await registry.ensureShell(resolved.session, opOpts)
          const cols = Number(args.cols) || 80
          const rows = Number(args.rows) || 24
          if (typeof stream.setWindow === 'function') stream.setWindow(rows, cols, 0, 0)
          assertSessionStillAuthorized(resolved.session, isHostAuthorized)
          return ok(`resized ${resolved.session.id} to ${cols}x${rows}`)
        }

        const sftpActions = new Set([
          'sftp_list',
          'sftp_stat',
          'sftp_read_text',
          'sftp_write_text',
          'sftp_mkdir',
          'sftp_rename',
          'sftp_delete',
          'sftp_upload',
          'sftp_download',
        ])
        if (sftpActions.has(action)) {
          const resolved = await resolveSession(args, projectPathKey, true, exec.signal)
          const sftp = resolved.session.sftp
          if (!sftp) throw new Error('SFTP not available on session')
          const remotePath = args.path != null ? String(args.path) : String(args.remote_path ?? '')

          if (action === 'sftp_list') {
            const list = await sftpReaddir(sftp, remotePath || '.', opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized)
            const lines = list.map((e) => e.longname || e.filename)
            return ok(`session_id: ${resolved.session.id}\n` + lines.join('\n'))
          }
          if (action === 'sftp_stat') {
            const st = await sftpStat(sftp, requireString(remotePath, 'path'), opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized)
            return ok(
              textify({
                path: remotePath,
                size: st.size,
                mode: st.mode,
                isDirectory: st.isDirectory?.() ?? false,
                isFile: st.isFile?.() ?? false,
              }),
            )
          }
          if (action === 'sftp_read_text') {
            const r = await sftpReadFile(
              sftp,
              requireString(remotePath, 'path'),
              clampMaxBytes(args.max_bytes, MAX_BYTES_SFTP_READ_DEFAULT),
              opOpts,
            )
            assertSessionStillAuthorized(resolved.session, isHostAuthorized)
            return ok(
              `session_id: ${resolved.session.id}\ntruncated: ${r.truncated}\nsize: ${r.size}\n\n${r.content}`,
            )
          }
          if (action === 'sftp_write_text') {
            await sftpWriteFile(sftp, requireString(remotePath, 'path'), String(args.content ?? ''), opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
            return ok(`wrote ${remotePath}`)
          }
          if (action === 'sftp_mkdir') {
            await sftpMkdir(sftp, requireString(remotePath, 'path'), opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
            return ok(`mkdir ${remotePath}`)
          }
          if (action === 'sftp_rename') {
            const from = requireString(args.from_path, 'from_path')
            const to = requireString(args.to_path, 'to_path')
            await sftpRename(sftp, from, to, opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
            return ok(`renamed ${from} -> ${to}`)
          }
          if (action === 'sftp_delete') {
            try {
              await sftpUnlink(sftp, requireString(remotePath, 'path'), opOpts)
            } catch {
              await sftpRmdir(sftp, remotePath, opOpts)
            }
            assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
            return ok(`deleted ${remotePath}`)
          }
          if (action === 'sftp_upload') {
            const local = assertWorkspaceLocal(stringOrDefault(args.local_path, args.path, 'local_path'), projectPathKey)
            const remote = requireString(args.remote_path ?? args.to_path, 'remote_path')
            await sftpFastPut(sftp, local, remote, opOpts)
            assertSessionStillAuthorized(resolved.session, isHostAuthorized, REVOKED_AFTER_RUN)
            return ok(`uploaded ${local} -> ${remote}`)
          }
          if (action === 'sftp_download') {
            const remote = requireString(args.remote_path ?? args.path, 'remote_path')
            const local = assertWorkspaceLocal(stringOrDefault(args.local_path, args.to_path, 'local_path'), projectPathKey)
            mkdirSync(dirname(local), { recursive: true })
            try {
              await sftpFastGet(sftp, remote, local, opOpts)
            } catch (e) {
              // Mid-transfer revocation (or any failure): never leave a pull
              // from a revoked host on disk.
              if (discardRevokedLocalFile(resolved.session, local, isHostAuthorized)) {
                throw new Error(DOWNLOAD_DISCARDED)
              }
              throw e
            }
            // Result gate: the transfer may have finished in the same tick as
            // the revocation — remove the file and refuse delivery.
            if (discardRevokedLocalFile(resolved.session, local, isHostAuthorized)) {
              throw new Error(DOWNLOAD_DISCARDED)
            }
            return ok(`downloaded ${remote} -> ${local}`)
          }
        }

        throw new Error('SSHManager.action is invalid: ' + action)
      } catch (e) {
        if (e && (e.aborted || e.name === 'AbortError')) return fail('Cancelled')
        const msg = e && e.message ? e.message : String(e)
        if (e && e.timedOut) return fail(`timed_out: true\n${msg}`)
        return fail(msg)
      }
    },
  }

  try {
    const dispose = ctx.tools.register(tool)
    sshManagerRegistered = true
    return () => {
      sshManagerRegistered = false
      try {
        dispose()
      } catch {}
    }
  } catch (error) {
    sshManagerRegistered = false
    console.error(
      '[dsh-ssh-tunnel] SSHManager registration failed:',
      error && error.message ? error.message : error,
    )
    return () => {}
  }
}

export function apply(ctx) {
  ensureDataDir()
  // best-effort migrate once
  try {
    migrateOldDraft()
  } catch (e) {
    console.warn('[dsh-ssh-tunnel] migrate draft skipped', e && e.message ? e.message : e)
  }

  const trustedHosts = () => {
    try {
      // Not injected (see `inject`): read optionally, or the missing service
      // would throw instead of degrading to an empty trust list.
      return ctx.get('webRuntime', true)?.trustedHosts || []
    } catch {
      return []
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-ssh-tunnel/api',
        handler: async (req, res) => {
          if (!isTrustedRequest(req, trustedHosts())) {
            writeJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          const pathname = new URL(req.url || '/', 'http://dsh.internal').pathname
          const prefix = '/dsh-ssh-tunnel/api/'
          if (!pathname.startsWith(prefix)) {
            writeJson(res, 404, { ok: false, error: 'not found' })
            return
          }
          const method = pathname.slice(prefix.length)
          if (!method || method.includes('/')) {
            writeJson(res, 404, { ok: false, error: 'not found' })
            return
          }
          try {
            const body = await readJsonBody(req)
            const result = await handleApi(method, body, ctx)
            writeJson(res, 200, result)
          } catch (error) {
            // Errors carrying a code map to its HTTP status; everything else
            // stays a server fault instead of a blanket 500.
            const code = error && typeof error.code === 'string' ? error.code : ''
            const status = API_ERROR_STATUS[code] || 500
            writeJson(res, status, {
              ok: false,
              error: String(error && error.message ? error.message : error),
              ...(code ? { code } : {}),
            })
          }
        },
      }),
    'dsh-ssh-tunnel: api',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-ssh-tunnel/vendor',
        handler: serveVendor,
      }),
    'dsh-ssh-tunnel: vendor assets',
  )

  ctx.effect(() => registerSshManagerTool(ctx), 'dsh-ssh-tunnel: SSHManager tool')
}
