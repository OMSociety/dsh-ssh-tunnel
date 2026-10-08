/**
 * In-memory SSH session registry: live / tombstone / close.
 * Transport connect (host-key prompts) is injected as connectClient.
 */
import { randomUUID } from 'node:crypto'
import { normalizeProjectKey } from './shared/path.js'
import {
  MAX_BYTES_EXEC_DEFAULT,
  SSH_EXEC_DEFAULT_TIMEOUT_MS,
  SSH_READY_TIMEOUT_MS,
  SSH_RECONNECT_ATTEMPT_TIMEOUT_MS,
  SSH_RECONNECT_DELAYS_MS,
  SSH_RECONNECT_MAX_ATTEMPTS,
  SSH_SFTP_META_TIMEOUT_MS,
  SSH_SHELL_OPEN_TIMEOUT_MS,
  SSH_STATUS_CONNECTED,
  SSH_STATUS_DISCONNECTED,
  SSH_STATUS_RECONNECTING,
  clampMaxBytes,
  clampTimeoutMs,
  findReusableLive,
  hostKeyPromptMessage,
  isLiveStatus,
  kbiReconnectError,
  kbiUnsupportedError,
  sshError,
  withTimeout,
} from './shared/session-policy.js'

const MAX_OUT = 512 * 1024
// Per-shellRead response cap. A client that falls behind reads in bounded
// slices and keeps advancing its cursor instead of one unbounded dump.
const SHELL_READ_CHUNK_MAX = 256 * 1024

async function openSftp(client, opts = {}) {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    }),
    opts.timeoutMs ?? SSH_SFTP_META_TIMEOUT_MS,
    { signal: opts.signal },
  )
}

function applyStatus(rec, status) {
  rec.status = status
  rec.running = status === SSH_STATUS_CONNECTED
  rec.updatedAt = Date.now()
}

function tombstone(rec) {
  if (rec.closing) return
  applyStatus(rec, SSH_STATUS_DISCONNECTED)
  try {
    rec.shellStream?.close()
  } catch {}
  rec.shellStream = null
  rec.sftp = null
  rec.client = null
}

function attachTransport(rec, client, onDrop) {
  const handle = () => {
    if (rec.closing) return
    if (rec.client !== client) return
    onDrop(rec, client)
  }
  client.on('close', handle)
  client.on('end', handle)
  client.on('error', handle)
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const err = new Error('Cancelled')
      err.aborted = true
      reject(err)
    }
    if (!signal) return
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function sessionSummary(s) {
  return {
    session_id: s.id,
    host_id: s.hostId,
    projectPathKey: s.projectPathKey,
    status: s.status,
    sftpEnabled: !!s.sftpEnabled,
    title: s.title,
    running: !!s.running,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    endpoint: s.endpoint || '',
    reconnect_attempt: s.reconnectAttempt || 0,
    reconnect_max_attempts: SSH_RECONNECT_MAX_ATTEMPTS,
  }
}

function makeRecord({ id, host, projectPathKey, title, endpoint, client, sftp, now }) {
  const key = normalizeProjectKey(projectPathKey)
  if (!key) throw new Error('projectPathKey required')
  // Each retained chunk carries its push order (seq). Clients cursor by seq,
  // so ring eviction can no longer pin their read position to the buffer tail:
  // after eviction the reader sees baseSeq jump forward and `dropped: true`.
  const outputBuf = []
  let outputBytes = 0
  let outputSeq = 0
  const rec = {
    id,
    hostId: host.id,
    projectPathKey: key,
    status: SSH_STATUS_CONNECTED,
    sftpEnabled: !!sftp,
    title: title || `SSH: ${host.name || host.host}`,
    running: true,
    createdAt: now,
    updatedAt: now,
    endpoint,
    client,
    sftp,
    shellStream: null,
    closing: false,
    reconnectRunner: false,
    reconnectAttempt: 0,
    connectionGeneration: 0,
    outputBuf,
    outputSeq: 0,
    pushOutput(chunk) {
      const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      outputBuf.push({ text: s, seq: ++outputSeq })
      rec.outputSeq = outputSeq
      outputBytes += Buffer.byteLength(s)
      while (outputBytes > MAX_OUT && outputBuf.length > 1) {
        outputBytes -= Buffer.byteLength(outputBuf.shift().text)
      }
    },
    getOutputText() {
      return outputBuf.map((c) => c.text).join('')
    },
    /**
     * `since` is the last seq the reader has already seen. Returns everything
     * newer, capped at SHELL_READ_CHUNK_MAX bytes per call.
     */
    chunkFrom(since) {
      const last = Number.isFinite(Number(since)) && Number(since) >= 0 ? Math.floor(Number(since)) : 0
      const base = outputBuf.length ? outputBuf[0].seq : outputSeq + 1
      const dropped = outputSeq > 0 && base > last + 1
      const parts = []
      let bytes = 0
      let upto = last
      let chunkTruncated = false
      for (const c of outputBuf) {
        if (c.seq <= last) continue
        const b = Buffer.byteLength(c.text)
        if (parts.length && bytes + b > SHELL_READ_CHUNK_MAX) {
          chunkTruncated = true
          break
        }
        parts.push(c.text)
        bytes += b
        upto = c.seq
        if (bytes > SHELL_READ_CHUNK_MAX) chunkTruncated = true
      }
      return {
        full: parts.join(''),
        chunk: parts.join(''),
        length: bytes,
        since: upto,
        seq: outputSeq,
        baseSeq: base,
        dropped,
        chunkTruncated,
      }
    },
  }
  return rec
}

export function createSessionRegistry({
  connectClient,
  loadSecrets,
  getPrompt,
  getHostById,
  isHostAuthorized,
}) {
  const sessions = new Map()

  function listSessionsForProject(projectPathKey) {
    const key = normalizeProjectKey(projectPathKey)
    return [...sessions.values()].filter((s) => s.projectPathKey === key).map(sessionSummary)
  }

  function findReusableSession(projectPathKey, hostId, needsSftp) {
    return findReusableLive([...sessions.values()], {
      projectPathKey: normalizeProjectKey(projectPathKey),
      hostId,
      needsSftp,
    })
  }

  async function createLiveSession(params) {
    const { host, projectPathKey, title, sftpEnabled, trustHostKey } = params
    const secrets = loadSecrets()
    const id = randomUUID()
    const now = Date.now()
    const endpoint = `${host.username}@${host.host}:${host.port || 22}`

    if (host.authType === 'keyboardInteractive') {
      throw sshError('bad_request', kbiUnsupportedError())
    }

    let client
    try {
      client = await withTimeout(
        connectClient(host, secrets, {
          trustHostKey: !!trustHostKey,
          projectPathKey,
        }),
        SSH_READY_TIMEOUT_MS,
        { signal: params.signal },
      )
    } catch (e) {
      if (e && e.message === 'SSH_PROMPT') {
        return {
          ok: false,
          sshPrompt: getPrompt?.(e.promptId),
          promptId: e.promptId,
          message: hostKeyPromptMessage(),
        }
      }
      throw e
    }

    let sftp = null
    if (sftpEnabled !== false) {
      try {
        sftp = await openSftp(client)
      } catch {
        sftp = null
      }
    }

    const rec = makeRecord({ id, host, projectPathKey, title, endpoint, client, sftp, now })
    rec.connectionGeneration += 1
    attachTransport(rec, client, onTransportDrop)
    sessions.set(id, rec)
    return { ok: true, session: sessionSummary(rec) }
  }

  function markReconnecting(rec, attempt) {
    rec.reconnectAttempt = attempt
    applyStatus(rec, SSH_STATUS_RECONNECTING)
    rec.sftp = null
    rec.shellStream = null
  }

  async function reconnectOnce(rec, { signal } = {}) {
    if (typeof isHostAuthorized === 'function' && !isHostAuthorized(rec.projectPathKey, rec.hostId)) {
      throw sshError('forbidden', 'SSH session host is not authorized for the current project.')
    }
    const host = getHostById?.(rec.hostId)
    if (!host) throw sshError('not_found', 'host not found')
    if (host.authType === 'keyboardInteractive') throw new Error(kbiReconnectError())
    const secrets = loadSecrets()
    try {
      rec.shellStream?.close()
    } catch {}
    rec.shellStream = null
    const oldClient = rec.client
    rec.client = null
    try {
      oldClient?.end()
    } catch {}
    let client
    try {
      client = await withTimeout(
        connectClient(host, secrets, { trustHostKey: false, projectPathKey: rec.projectPathKey }),
        SSH_RECONNECT_ATTEMPT_TIMEOUT_MS,
        { signal },
      )
    } catch (e) {
      if (e && e.message === 'SSH_PROMPT') {
        // Same shape the create path maps for the tab UI; without this the
        // reconnect path loses the promptId in a generic 500.
        const err = sshError('conflict', hostKeyPromptMessage())
        err.isPromptError = true
        err.promptId = e.promptId
        throw err
      }
      throw e
    }
    if (rec.closing) {
      try { client.end() } catch {}
      throw sshError('conflict', 'SSH session is closing')
    }
    let sftp = null
    if (rec.sftpEnabled) {
      try {
        sftp = await openSftp(client)
      } catch {
        sftp = null
      }
    }
    if (rec.closing) {
      try { client.end() } catch {}
      throw sshError('conflict', 'SSH session is closing')
    }
    rec.client = client
    rec.sftp = sftp
    rec.connectionGeneration += 1
    rec.reconnectAttempt = 0
    applyStatus(rec, SSH_STATUS_CONNECTED)
    attachTransport(rec, client, onTransportDrop)
    return sessionSummary(rec)
  }

  async function runAutoReconnect(rec) {
    if (rec.closing || rec.reconnectRunner) return
    const host = getHostById?.(rec.hostId)
    if (host && host.authType === 'keyboardInteractive') {
      tombstone(rec)
      return
    }
    rec.reconnectRunner = true
    try {
      for (let attempt = 1; attempt <= SSH_RECONNECT_MAX_ATTEMPTS; attempt++) {
        if (rec.closing) return
        if (typeof isHostAuthorized === 'function' && !isHostAuthorized(rec.projectPathKey, rec.hostId)) {
          // Host was revoked while disconnected: tombstone it, never resurrect.
          tombstone(rec)
          return
        }
        markReconnecting(rec, attempt)
        const delay = SSH_RECONNECT_DELAYS_MS[attempt - 1] || SSH_RECONNECT_DELAYS_MS[SSH_RECONNECT_DELAYS_MS.length - 1]
        try {
          await sleep(delay)
        } catch {
          return
        }
        if (rec.closing) return
        try {
          await reconnectOnce(rec)
          return
        } catch (e) {
          // A host-key/MFA prompt cannot self-resolve by retrying: park the
          // session and wait for the manual reconnect after confirmation.
          if (e && e.isPromptError) {
            tombstone(rec)
            return
          }
        }
      }
      tombstone(rec)
    } finally {
      rec.reconnectRunner = false
    }
  }

  function onTransportDrop(rec) {
    if (rec.closing) return
    const host = getHostById?.(rec.hostId)
    if (host && host.authType === 'keyboardInteractive') {
      tombstone(rec)
      return
    }
    void runAutoReconnect(rec)
  }

  async function reconnectSession(sessionId, { manual = true, signal, projectPathKey } = {}) {
    const rec = sessions.get(String(sessionId || ''))
    if (!rec) throw sshError('not_found', 'session not found')
    const key = normalizeProjectKey(projectPathKey)
    if (!key) throw sshError('bad_request', 'projectPathKey required')
    if (rec.projectPathKey !== key) throw sshError('forbidden', 'session not in this project')
    if (rec.closing) throw sshError('conflict', 'SSH session is closing')
    if (isLiveStatus(rec.status, rec.running) && rec.client) return { ok: true, session: sessionSummary(rec) }
    if (rec.reconnectRunner) throw sshError('conflict', 'SSH reconnect already in progress')
    const host = getHostById?.(rec.hostId)
    if (host && host.authType === 'keyboardInteractive') throw sshError('bad_request', kbiReconnectError())
    rec.reconnectRunner = true
    try {
      markReconnecting(rec, 1)
      const session = await reconnectOnce(rec, { signal })
      return { ok: true, session }
    } catch (e) {
      tombstone(rec)
      throw e
    } finally {
      rec.reconnectRunner = false
    }
  }

  function waitForLive(sessionId, timeoutMs) {
    const rec = sessions.get(String(sessionId || ''))
    if (!rec) return Promise.reject(sshError('not_found', 'session not found'))
    if (isLiveStatus(rec.status, rec.running) && rec.client) return Promise.resolve(rec)
    const deadline = Date.now() + (Number(timeoutMs) || SSH_RECONNECT_ATTEMPT_TIMEOUT_MS)
    return new Promise((resolve, reject) => {
      const tick = () => {
        const cur = sessions.get(String(sessionId || ''))
        if (!cur) {
          reject(sshError('not_found', 'session not found'))
          return
        }
        if (isLiveStatus(cur.status, cur.running) && cur.client) {
          resolve(cur)
          return
        }
        if (cur.status === SSH_STATUS_DISCONNECTED || Date.now() >= deadline) {
          reject(sshError('conflict', 'session not running'))
          return
        }
        setTimeout(tick, 100)
      }
      tick()
    })
  }

  function requireLiveSession(sessionId, projectPathKey) {
    const s = sessions.get(String(sessionId || ''))
    if (!s) throw sshError('not_found', 'session not found')
    const key = normalizeProjectKey(projectPathKey)
    if (!key) throw sshError('bad_request', 'projectPathKey required')
    if (s.projectPathKey !== key) throw sshError('forbidden', 'session not in this project')
    if (!isLiveStatus(s.status, s.running) || !s.client) throw sshError('conflict', 'session not running')
    // Grant revocation must take effect on established sessions, not only new
    // connections. The session is bound to one project; re-check it on every use.
    if (typeof isHostAuthorized === 'function' && !isHostAuthorized(s.projectPathKey, s.hostId)) {
      throw sshError('forbidden', 'SSH session host is not authorized for the current project.')
    }
    return s
  }

  function closeSessionsForHost(projectPathKey, hostId) {
    const key = normalizeProjectKey(projectPathKey)
    const closed = []
    for (const s of [...sessions.values()]) {
      if (s.projectPathKey === key && s.hostId === String(hostId) && !s.closing) {
        closeSession(s.id, s.projectPathKey, { force: true })
        closed.push(s.id)
      }
    }
    return { closed: closed.length, sessionIds: closed }
  }

  function closeSession(sessionId, projectPathKey, { force = false } = {}) {
    const s = sessions.get(sessionId)
    if (!s) throw sshError('not_found', 'session not found')
    if (!force) {
      const key = normalizeProjectKey(projectPathKey)
      if (!key) throw sshError('bad_request', 'projectPathKey required')
      if (s.projectPathKey !== key) throw sshError('forbidden', 'session not in this project')
    }
    s.closing = true
    try {
      if (s.shellStream) s.shellStream.close()
    } catch {}
    try {
      s.client?.end()
    } catch {}
    applyStatus(s, SSH_STATUS_DISCONNECTED)
    sessions.delete(sessionId)
    return { ok: true }
  }

  async function execOnSession(session, command, opts = {}) {
    // Check before dialing, not only when the result comes back: the remote
    // side must not see a single byte of work from a revoked host.
    if (typeof isHostAuthorized === 'function' && !isHostAuthorized(session.projectPathKey, session.hostId)) {
      throw sshError('forbidden', 'SSH session host is not authorized for the current project.')
    }
    const client = session.client
    if (!isLiveStatus(session.status, session.running) || !client) {
      throw sshError('conflict', 'session not running')
    }
    const timeoutMs = clampTimeoutMs(opts.timeoutMs, SSH_EXEC_DEFAULT_TIMEOUT_MS)
    const maxBytes = clampMaxBytes(opts.maxBytes, MAX_BYTES_EXEC_DEFAULT)
    const cwd = opts.cwd ? String(opts.cwd).trim() : ''
    if (cwd && !cwd.startsWith('/')) {
      throw sshError('bad_request', 'cwd must be an absolute POSIX path on the remote host')
    }
    const cmd = cwd ? `cd -- '${cwd.replace(/'/g, `'\\''`)}' && ${command}` : command
    let stream
    return withTimeout(
      new Promise((resolve, reject) => {
        client.exec(cmd, (err, st) => {
          if (err) {
            reject(err)
            return
          }
          stream = st
          // Aggregate raw bytes and decode once at the end: a multi-byte UTF-8
          // sequence split across data events must not become U+FFFD.
          const outParts = []
          const errParts = []
          let outTotal = 0
          let errTotal = 0
          let outKept = 0
          let errKept = 0
          stream.on('data', (d) => {
            outTotal += d.length
            if (outKept < maxBytes) {
              outParts.push(d)
              outKept += d.length
            }
          })
          stream.stderr.on('data', (d) => {
            errTotal += d.length
            if (errKept < maxBytes) {
              errParts.push(d)
              errKept += d.length
            }
          })
          stream.on('close', (code, sig) => {
            const toText = (parts) => {
              let buf = Buffer.concat(parts)
              if (buf.length > maxBytes) buf = buf.subarray(0, maxBytes)
              return buf.toString('utf8')
            }
            const exitKnown = typeof code === 'number'
            resolve({
              stdout: toText(outParts),
              stderr: toText(errParts),
              exitKnown,
              code: exitKnown ? code : null,
              signal: exitKnown ? null : sig || null,
              // ssh2 sends exit-status on normal exit and exit-signal on signal
              // death. Neither arrives when the connection itself was cut.
              connectionDropped: !exitKnown && !sig,
              truncated: outTotal > maxBytes || errTotal > maxBytes,
              cwd: cwd || null,
            })
          })
          stream.on('error', reject)
        })
      }),
      timeoutMs,
      {
        signal: opts.signal,
        onTimeout: () => {
          try {
            stream?.close()
          } catch {}
          try {
            stream?.destroy?.()
          } catch {}
        },
      },
    )
  }

  async function ensureShell(session, opts = {}) {
    if (session.shellStream) return session.shellStream
    if (!session.client) throw sshError('conflict', 'session not running')
    const timeoutMs = clampTimeoutMs(opts.timeoutMs, SSH_SHELL_OPEN_TIMEOUT_MS)
    let opened
    let cancelled = false
    return withTimeout(
      new Promise((resolve, reject) => {
        session.client.shell({ term: 'xterm-color' }, (err, stream) => {
          if (cancelled) {
            try { stream?.close() } catch {}
            return
          }
          if (err) return reject(err)
          opened = stream
          session.shellStream = stream
          stream.on('data', (d) => session.pushOutput(d))
          stream.stderr?.on?.('data', (d) => session.pushOutput(d))
          stream.on('close', () => {
            session.shellStream = null
          })
          resolve(stream)
        })
      }),
      timeoutMs,
      {
        signal: opts.signal,
        onTimeout: () => {
          cancelled = true
          try { opened?.close() } catch {}
          try { opened?.destroy?.() } catch {}
          if (session.shellStream === opened) session.shellStream = null
        },
      },
    )
  }

  return {
    sessions,
    sessionSummary,
    listSessionsForProject,
    findReusableSession,
    createLiveSession,
    requireLiveSession,
    closeSession,
    closeSessionsForHost,
    execOnSession,
    ensureShell,
    openSftp,
    reconnectSession,
    waitForLive,
    get(id) {
      return sessions.get(id)
    },
  }
}
