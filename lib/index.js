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
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, resolve as pathResolve } from 'node:path'
import { Client } from 'ssh2'
import {
  normalizeProjectKey,
  isPathInsideRoots,
  joinUnderRoot,
} from './shared/path.js'
import {
  hostCredentialConfigured,
  publicHost,
  modelHostSummary,
} from './shared/host-summary.js'
import { chunkFromBuffer } from './shared/shell-buffer.js'
import {
  fingerprintFromHostKey,
  formatHostFingerprint,
  isUsableHostFingerprint,
} from './shared/host-key.js'
import {
  SSH_KEEPALIVE_COUNT_MAX,
  SSH_KEEPALIVE_INTERVAL_MS,
  SSH_READY_TIMEOUT_MS,
  disconnectedSessionError,
  isLiveStatus,
} from './shared/session-policy.js'
import { createSessionRegistry } from './session.js'

// Out-of-tree plugins cannot reliably resolve @deepseek-ai/dsh-tools (see modlens).
// Register a raw JSON-Schema tool definition via ctx.tools.register instead of defineTool.
const requireSelf = createRequire(import.meta.url)

let PLUGIN_VERSION = '0.0.0'
try {
  PLUGIN_VERSION = String(requireSelf('../package.json').version || PLUGIN_VERSION)
} catch {}

export const name = 'dsh-ssh-tunnel'
export const inject = ['webServer', 'sessions', 'tools', 'webRuntime']

/** Set true after SSHManager successfully enters the tools registry. */
let sshManagerRegistered = false

const DATA_DIR = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'ssh-tunnel')
  : join(homedir(), '.dsh/ssh-tunnel')
const HOSTS_PATH = join(DATA_DIR, 'hosts.json')
const SECRETS_PATH = join(DATA_DIR, 'secrets.json')
const GRANTS_PATH = join(DATA_DIR, 'grants.json')
const KNOWN_PATH = join(DATA_DIR, 'known_hosts.json')

const WORKSPACE_ROOTS = ['/workspace']

function rmLocalRecursive(abs) {
  const st = statSync(abs)
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) {
      rmLocalRecursive(join(abs, name))
    }
    rmdirSync(abs)
  } else {
    unlinkSync(abs)
  }
}

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true })
  try { chmodSync(DATA_DIR, 0o700) } catch {}
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonFile(path, data, mode = 0o600) {
  ensureDataDir()
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode })
  try { chmodSync(path, mode) } catch {}
}


function sessionCwdOf(ctx, sessionId, clientCwd) {
  try {
    const headerCwd = ctx.sessions?.get?.(sessionId)?.header?.cwd
    if (headerCwd) return normalizeProjectKey(headerCwd)
  } catch {}
  if (clientCwd) return normalizeProjectKey(clientCwd)
  return normalizeProjectKey(process.cwd()) || '/workspace'
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
  const grants = loadGrants()
  for (const key of Object.keys(grants.projects || {})) {
    const g = grants.projects[key]
    if (g && Array.isArray(g.hostIds)) {
      g.hostIds = g.hostIds.filter((x) => x !== id)
      g.updatedAt = Date.now()
    }
  }
  saveGrants(grants)
  return { ok: true }
}

function scanOpenSsh() {
  const dirs = [join(homedir(), '.ssh'), '/workspace/.ssh']
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
  const keyFiles = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.pub') || name === 'config' || name === 'known_hosts' || name === 'authorized_keys') continue
        const p = join(dir, name)
        try {
          if (statSync(p).isFile()) keyFiles.push(p)
        } catch {}
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
  return upsertHostRecord({
    name: entry.name || entry.host,
    host: entry.host,
    port: entry.port || 22,
    username: entry.username || 'root',
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
  if (!key) throw new Error('projectPathKey required')
  const grants = loadGrants()
  const ids = [...new Set((hostIds || []).map((x) => String(x).trim()).filter(Boolean))]
  grants.projects[key] = { hostIds: ids, updatedAt: Date.now() }
  saveGrants(grants)
  return getProjectGrants(key)
}

/* ---------------- Sessions ---------------- */

/** @type {Map<string, any>} */
const pendingPrompts = new Map()

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
    // UI-only dial path sets keyboardInteractive handler
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
        const promptId = randomUUID()
        pendingPrompts.set(promptId, {
          kind: 'host_key',
          hostId: host.id,
          host: host.host,
          port: host.port || 22,
          fingerprint: fp,
          fingerprintAlgo: 'SHA256',
          message: `Unknown host key for ${host.host}:${host.port || 22} (${formatHostFingerprint(fp)})`,
        })
        finishErr(Object.assign(new Error('SSH_PROMPT'), { promptId, kind: 'host_key' }))
        return decide(false)
      }
      if (storedFp !== fp) {
        const promptId = randomUUID()
        pendingPrompts.set(promptId, {
          kind: 'host_key_changed',
          hostId: host.id,
          host: host.host,
          port: host.port || 22,
          fingerprint: fp,
          fingerprintAlgo: 'SHA256',
          previous: storedFp,
          message: `Host key changed for ${host.host}:${host.port || 22} (new ${formatHostFingerprint(fp)})`,
        })
        finishErr(Object.assign(new Error('SSH_PROMPT'), { promptId, kind: 'host_key_changed' }))
        return decide(false)
      }
      return decide(true)
    }

    if (host.authType === 'keyboardInteractive' && options.keyboardHandler) {
      opts.tryKeyboard = true
      client.on('keyboard-interactive', options.keyboardHandler)
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
})

/* ---------------- SFTP helpers ---------------- */

function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, st) => (err ? reject(err) : resolve(st)))
  })
}

function sftpReaddir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => (err ? reject(err) : resolve(list || [])))
  })
}

function sftpReadFile(sftp, remotePath, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    const rs = sftp.createReadStream(remotePath)
    rs.on('data', (c) => {
      total += c.length
      if (total <= maxBytes) chunks.push(c)
    })
    rs.on('error', reject)
    rs.on('end', () => {
      const buf = Buffer.concat(chunks)
      resolve({ content: buf.toString('utf8'), truncated: total > maxBytes, size: total })
    })
  })
}

function sftpWriteFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath)
    ws.on('error', reject)
    ws.on('close', () => resolve({ ok: true }))
    ws.end(content)
  })
}

function sftpMkdir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function sftpRename(sftp, from, to) {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function sftpUnlink(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function sftpRmdir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function sftpFastGet(sftp, remote, local) {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remote, local, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function sftpFastPut(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve({ ok: true })))
  })
}

function assertWorkspaceLocal(localPath) {
  const abs = pathResolve(localPath)
  if (!isPathInsideRoots(abs, WORKSPACE_ROOTS)) {
    throw new Error('local path must be under /workspace')
  }
  return abs
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

async function resolveSession(args, projectPathKey, needsSftp) {
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
    if (!isLiveStatus(s.status, s.running) || !s.client) {
      throw new Error(s.status === 'disconnected' ? disconnectedSessionError() : 'session not running')
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
    if (strategy === 'require_existing') {
      throw new Error('No reusable SSH session exists for this host in the current project.')
    }
  }

  if (host.authType === 'keyboardInteractive') {
    throw new Error(
      '该主机使用键盘交互登录，SSHManager 不会自行发起连接；请先在 SSH 隧道 Tab 建立连接，再复用运行中的会话。',
    )
  }

  const created = await registry.createLiveSession({
    host,
    projectPathKey,
    title: args.title || `SSHManager: ${host.name || host.host}`,
    sftpEnabled: true,
    trustHostKey: false,
    allowInteractiveDial: false,
  })
  if (!created.ok) {
    throw new Error(created.message || '请先在 SSH 隧道 Tab 手动完成连接/信任/MFA 后重试。')
  }
  const s = registry.get(created.session.session_id)
  return { session: s, reused: false, created: true, strategy }
}

/* ---------------- HTTP helpers ---------------- */

function isLoopbackHostname(hostname) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0'
}

function isTrusted(req, trustedHosts) {
  try {
    const hostHeader = req.headers?.host || req.headers?.Host
    if (!hostHeader) return false
    const url = new URL('http://' + hostHeader)
    if (isLoopbackHostname(url.hostname)) return true
    const list = Array.isArray(trustedHosts) ? trustedHosts : []
    return list.some((entry) => {
      const e = String(entry)
      return e === hostHeader || e === url.hostname || e === url.host
    })
  } catch {
    return false
  }
}

function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
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
    if (!host) throw new Error('host not found')
    const projectPathKey = normalizeProjectKey(body.projectPathKey || body.cwd || '')
    if (!projectPathKey) throw new Error('projectPathKey required')
    // Project access is explicit (Grants tab / setGrants). Connect must not silently expand it.
    const grants = getProjectGrants(projectPathKey)
    if (!grants.hostIds.includes(host.id)) {
      throw new Error(
        'host is not authorized for this project; grant access under Project access before connecting',
      )
    }
    const result = await registry.createLiveSession({
      host,
      projectPathKey,
      title: body.title,
      sftpEnabled: body.sftpEnabled !== false,
      trustHostKey: !!body.trustHostKey,
      allowInteractiveDial: host.authType === 'keyboardInteractive',
      interactiveAnswers: body.interactiveAnswers || [],
    })
    return result
  }

  if (method === 'disconnect') {
    return registry.closeSession(String(body.sessionId || body.session_id || ''))
  }

  if (method === 'reconnect') {
    return registry.reconnectSession(String(body.sessionId || body.session_id || ''), {
      manual: true,
      projectPathKey: body.projectPathKey,
    })
  }

  if (method === 'answerPrompt') {
    const promptId = String(body.promptId || '')
    const p = pendingPrompts.get(promptId)
    if (!p) throw new Error('prompt not found')
    if (body.trustHostKey && (p.kind === 'host_key' || p.kind === 'host_key_changed')) {
      const fp = fingerprintFromHostKey(p.fingerprint)
      if (!isUsableHostFingerprint(fp)) {
        throw new Error('invalid host key fingerprint in prompt')
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
          allowInteractiveDial: host.authType === 'keyboardInteractive',
          interactiveAnswers: body.interactiveAnswers || [],
        })
      }
      return { ok: true, trusted: true }
    }
    pendingPrompts.delete(promptId)
    return { ok: true }
  }

  if (method === 'listPrompts') {
    return {
      prompts: [...pendingPrompts.entries()].map(([id, p]) => Object.assign({ promptId: id }, p)),
    }
  }

  if (method === 'shellOpen') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    await registry.ensureShell(s)
    return {
      ok: true,
      session_id: s.id,
      output: s.getOutputText ? s.getOutputText() : s.outputBuf.join(''),
      seq: s.outputSeq || 0,
    }
  }

  if (method === 'shellRead') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.shellStream) await registry.ensureShell(s)
    const since = body.since != null ? Number(body.since) : 0
    const sliced = s.chunkFrom
      ? s.chunkFrom(since)
      : (() => {
          const full = s.outputBuf.join('')
          const c = chunkFromBuffer(full, since)
          return { full, chunk: c.chunk, length: c.length, since: c.since }
        })()
    const out = {
      ok: true,
      session_id: s.id,
      chunk: sliced.chunk,
      length: sliced.length,
      since: sliced.since,
      seq: s.outputSeq || 0,
      running: !!s.running,
    }
    // Only include full buffer when explicitly requested (debug / first paint helpers)
    if (body.full === true) out.output = sliced.full
    return out
  }

  if (method === 'shellWrite') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    const stream = await registry.ensureShell(s)
    const data = body.data != null ? String(body.data) : ''
    if (!data) throw new Error('data required')
    stream.write(data)
    s.updatedAt = Date.now()
    return { ok: true }
  }

  if (method === 'shellResize') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    const stream = await registry.ensureShell(s)
    const cols = Number(body.cols) || 80
    const rows = Number(body.rows) || 24
    if (typeof stream.setWindow === 'function') stream.setWindow(rows, cols, 0, 0)
    return { ok: true, cols, rows }
  }

  if (method === 'sftpList') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
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
    return { ok: true, path: remotePath, entries }
  }

  if (method === 'sftpReadText') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const remotePath = String(body.path || '')
    const r = await sftpReadFile(s.sftp, remotePath, body.maxBytes || 512 * 1024)
    return { ok: true, path: remotePath, ...r }
  }

  if (method === 'sftpWriteText') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const remotePath = String(body.path || '')
    await sftpWriteFile(s.sftp, remotePath, String(body.content ?? ''))
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpMkdir') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const remotePath = String(body.path || '')
    await sftpMkdir(s.sftp, remotePath)
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpDelete') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const remotePath = String(body.path || '')
    try {
      await sftpUnlink(s.sftp, remotePath)
    } catch {
      await sftpRmdir(s.sftp, remotePath)
    }
    return { ok: true, path: remotePath }
  }

  if (method === 'sftpRename') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    await sftpRename(s.sftp, String(body.from_path || body.from), String(body.to_path || body.to))
    return { ok: true }
  }

  if (method === 'sftpDownload') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const remote = String(body.remote_path || body.path)
    const local = assertWorkspaceLocal(String(body.local_path || body.to_path))
    mkdirSync(dirname(local), { recursive: true })
    await sftpFastGet(s.sftp, remote, local)
    return { ok: true, remote, local }
  }

  if (method === 'sftpUpload') {
    const s = registry.requireLiveSession(body.sessionId || body.session_id, body.projectPathKey)
    if (!s.sftp) throw new Error('SFTP not enabled on this session')
    const local = assertWorkspaceLocal(String(body.local_path || body.path))
    const remote = String(body.remote_path || body.to_path)
    await sftpFastPut(s.sftp, local, remote)
    return { ok: true, local, remote }
  }


  if (method === 'localList') {
    const root = normalizeProjectKey(body.projectPathKey || body.cwd || '/workspace') || '/workspace'
    let rel = String(body.path || root || '/')
    if (!isAbsolute(rel)) rel = join(root, rel)
    const abs = pathResolve(rel)
    const allowed = abs === root || abs.startsWith(root + '/') || abs === '/workspace' || abs.startsWith('/workspace/')
    if (!allowed) throw new Error('local path outside project')
    let names
    try {
      names = readdirSync(abs)
    } catch (e) {
      throw new Error('cannot list: ' + (e && e.message ? e.message : e))
    }
    const entries = []
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = join(abs, name)
      let st
      try { st = statSync(full) } catch { continue }
      entries.push({
        name,
        path: full,
        isDirectory: st.isDirectory(),
        size: st.size || 0,
        mtime: Math.floor((st.mtimeMs || 0) / 1000),
      })
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { ok: true, path: abs, root, entries }
  }

  if (method === 'localMkdir') {
    const root = normalizeProjectKey(body.projectPathKey || body.cwd || '/workspace') || '/workspace'
    let abs = String(body.path || '')
    if (!isAbsolute(abs)) abs = join(root, abs)
    abs = pathResolve(abs)
    if (!(abs === root || abs.startsWith(root + '/') || abs.startsWith('/workspace/'))) throw new Error('local path outside project')
    mkdirSync(abs, { recursive: true })
    return { ok: true, path: abs }
  }

  if (method === 'localDelete') {
    const root = normalizeProjectKey(body.projectPathKey || body.cwd || '/workspace') || '/workspace'
    const abs = pathResolve(String(body.path || ''))
    if (!(abs.startsWith(root + '/') || abs.startsWith('/workspace/'))) throw new Error('local path outside project')
    rmLocalRecursive(abs)
    return { ok: true, path: abs }
  }

  if (method === 'localRename') {
    const root = normalizeProjectKey(body.projectPathKey || body.cwd || '/workspace') || '/workspace'
    const from = pathResolve(String(body.from_path || body.from))
    const to = pathResolve(String(body.to_path || body.to))
    for (const abs of [from, to]) {
      if (!(abs.startsWith(root + '/') || abs.startsWith('/workspace/') || abs === root)) throw new Error('local path outside project')
    }
    renameSync(from, to)
    return { ok: true, from, to }
  }

  if (method === 'migrateDraft') {
    return migrateOldDraft()
  }

  throw new Error('unknown method: ' + method)
}

function migrateOldDraft() {
  const draftPath = join(
    process.env.DSH_HOME || join(homedir(), '.dsh'),
    'profiles/web/dsh-ssh-ui.draft.json',
  )
  if (!existsSync(draftPath)) return { ok: true, migrated: 0 }
  let raw
  try {
    raw = JSON.parse(readFileSync(draftPath, 'utf8'))
  } catch {
    return { ok: false, error: 'bad draft' }
  }
  const profiles =
    raw.version === 2 && Array.isArray(raw.profiles)
      ? raw.profiles
      : [raw]
  let n = 0
  for (const p of profiles) {
    if (!p || !p.host) continue
    upsertHostRecord({
      name: p.alias || `${p.username || 'user'}@${p.host}`,
      host: p.host,
      port: p.port || 22,
      username: p.username || 'root',
      authType: p.authMode || p.authType || 'privateKey',
      privateKeyPath: p.privateKey && !String(p.privateKey).includes('BEGIN') ? p.privateKey : '',
      privateKeyPem: p.privateKey && String(p.privateKey).includes('BEGIN') ? p.privateKey : '',
      password: p.password || '',
      passphrase: p.passphrase || '',
      source: 'migrated-draft',
    })
    n++
  }
  return { ok: true, migrated: n }
}

function registerSshManagerTool(ctx) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    console.error('[dsh-ssh-tunnel] tools service unavailable; SSHManager tool not registered')
    return () => {}
  }
  // Raw tool definition (JSON Schema parameters) — same pattern as @liustack/modlens.
  // Do not import defineTool from @deepseek-ai/dsh-tools; out-of-tree resolution is unreliable.
  const tool = {
    name: 'SSHManager',
    description:
      'Manage SSH sessions and remote SFTP for hosts associated with the current project. Use host_id from list_hosts. credential=saved means secrets are stored—do not ask user to paste them. credential=interactive means keyboard-interactive: never dial yourself; only reuse a session the user opened in the SSH Tunnel tab. Default session_strategy is reuse_or_create. Host key / MFA prompts must be completed in the SSH Tunnel tab.',
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
        timeout_ms: { type: 'number' },
        max_bytes: { type: 'number' },
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
          registry.closeSession(id)
          return ok(`closed ${id}`)
        }

        if (action === 'exec') {
          const command = String(args.command || '')
          if (!command) throw new Error('command required')
          const resolved = await resolveSession(args, projectPathKey, false)
          const result = await registry.execOnSession(resolved.session, command, {
            cwd: args.cwd,
            timeoutMs: args.timeout_ms,
            maxBytes: args.max_bytes,
          })
          resolved.session.updatedAt = Date.now()
          return ok(
            [
              `session_id: ${resolved.session.id}`,
              `host_id: ${resolved.session.hostId}`,
              `reused: ${resolved.reused}`,
              `exit: ${result.code}`,
              '--- stdout ---',
              result.stdout || '(empty)',
              '--- stderr ---',
              result.stderr || '(empty)',
            ].join('\n'),
          )
        }

        if (action === 'read_session') {
          const resolved = await resolveSession(args, projectPathKey, false)
          await registry.ensureShell(resolved.session)
          const out = resolved.session.outputBuf.join('')
          return ok(`session_id: ${resolved.session.id}\n\n${out || '(empty)'}`)
        }

        if (action === 'send_input') {
          const data = String(args.data || '')
          if (!data) throw new Error('data required')
          const resolved = await resolveSession(args, projectPathKey, false)
          const stream = await registry.ensureShell(resolved.session)
          stream.write(data)
          return ok(`sent ${data.length} chars to ${resolved.session.id}`)
        }

        if (action === 'resize_session') {
          const resolved = await resolveSession(args, projectPathKey, false)
          const stream = await registry.ensureShell(resolved.session)
          const cols = Number(args.cols) || 80
          const rows = Number(args.rows) || 24
          if (typeof stream.setWindow === 'function') stream.setWindow(rows, cols, 0, 0)
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
          const resolved = await resolveSession(args, projectPathKey, true)
          const sftp = resolved.session.sftp
          if (!sftp) throw new Error('SFTP not available on session')
          const remotePath = String(args.path || args.remote_path || '')

          if (action === 'sftp_list') {
            const list = await sftpReaddir(sftp, remotePath || '.')
            const lines = list.map((e) => e.longname || e.filename)
            return ok(`session_id: ${resolved.session.id}\n` + lines.join('\n'))
          }
          if (action === 'sftp_stat') {
            const st = await sftpStat(sftp, remotePath)
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
            const r = await sftpReadFile(sftp, remotePath, args.max_bytes || 512 * 1024)
            return ok(
              `session_id: ${resolved.session.id}\ntruncated: ${r.truncated}\nsize: ${r.size}\n\n${r.content}`,
            )
          }
          if (action === 'sftp_write_text') {
            await sftpWriteFile(sftp, remotePath, String(args.content ?? ''))
            return ok(`wrote ${remotePath}`)
          }
          if (action === 'sftp_mkdir') {
            await sftpMkdir(sftp, remotePath)
            return ok(`mkdir ${remotePath}`)
          }
          if (action === 'sftp_rename') {
            await sftpRename(sftp, String(args.from_path), String(args.to_path))
            return ok(`renamed ${args.from_path} -> ${args.to_path}`)
          }
          if (action === 'sftp_delete') {
            try {
              await sftpUnlink(sftp, remotePath)
            } catch {
              await sftpRmdir(sftp, remotePath)
            }
            return ok(`deleted ${remotePath}`)
          }
          if (action === 'sftp_upload') {
            const local = assertWorkspaceLocal(String(args.local_path || args.path))
            const remote = String(args.remote_path || args.to_path)
            await sftpFastPut(sftp, local, remote)
            return ok(`uploaded ${local} -> ${remote}`)
          }
          if (action === 'sftp_download') {
            const remote = String(args.remote_path || args.path)
            const local = assertWorkspaceLocal(String(args.local_path || args.to_path))
            mkdirSync(dirname(local), { recursive: true })
            await sftpFastGet(sftp, remote, local)
            return ok(`downloaded ${remote} -> ${local}`)
          }
        }

        throw new Error('SSHManager.action is invalid: ' + action)
      } catch (e) {
        const msg = e && e.message ? e.message : String(e)
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
      return ctx.webRuntime?.trustedHosts || []
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
          if (!isTrusted(req, trustedHosts())) {
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
            writeJson(res, 500, {
              ok: false,
              error: String(error && error.message ? error.message : error),
            })
          }
        },
      }),
    'dsh-ssh-tunnel: api',
  )

  ctx.effect(() => registerSshManagerTool(ctx), 'dsh-ssh-tunnel: SSHManager tool')
}
