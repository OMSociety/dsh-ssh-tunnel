/**
 * In-memory SSH session registry: live / tombstone / close.
 * Transport connect (host-key prompts) is injected as connectClient.
 */
import { randomUUID } from 'node:crypto'
import { chunkFromBuffer } from './shared/shell-buffer.js'
import { normalizeProjectKey } from './shared/path.js'
import {
  SSH_EXEC_DEFAULT_TIMEOUT_MS,
  SSH_READY_TIMEOUT_MS,
  SSH_RECONNECT_ATTEMPT_TIMEOUT_MS,
  SSH_RECONNECT_DELAYS_MS,
  SSH_RECONNECT_MAX_ATTEMPTS,
  SSH_SHELL_OPEN_TIMEOUT_MS,
  SSH_STATUS_CONNECTED,
  SSH_STATUS_DISCONNECTED,
  SSH_STATUS_RECONNECTING,
  clampTimeoutMs,
  findReusableLive,
  isLiveStatus,
  kbiReconnectError,
  withTimeout,
} from './shared/session-policy.js'

const MAX_OUT = 512 * 1024

async function openSftp(client) {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
  })
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
  const outputBuf = []
  let outputBytes = 0
  const rec = {
    id,
    hostId: host.id,
    projectPathKey: normalizeProjectKey(projectPathKey),
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
      outputBuf.push(s)
      outputBytes += Buffer.byteLength(s)
      rec.outputSeq = (rec.outputSeq || 0) + 1
      while (outputBytes > MAX_OUT && outputBuf.length > 1) {
        outputBytes -= Buffer.byteLength(outputBuf.shift())
      }
    },
    getOutputText() {
      return outputBuf.join('')
    },
    chunkFrom(since) {
      const full = outputBuf.join('')
      const sliced = chunkFromBuffer(full, since)
      return { full, chunk: sliced.chunk, length: sliced.length, since: sliced.since }
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
    const { host, projectPathKey, title, sftpEnabled, trustHostKey, interactiveAnswers } = params
    const secrets = loadSecrets()
    const id = randomUUID()
    const now = Date.now()
    const endpoint = `${host.username}@${host.host}:${host.port || 22}`

    if (host.authType === 'keyboardInteractive' && !params.allowInteractiveDial) {
      throw new Error(
        '该主机使用键盘交互登录，SSHManager 不会自行发起连接；请先在 SSH 隧道 Tab 建立连接，再复用运行中的会话。',
      )
    }

    let client
    try {
      const kiHandler =
        host.authType === 'keyboardInteractive'
          ? (name, instructions, prompts, finish) => {
              const answers = interactiveAnswers || []
              finish(prompts.map((p, i) => (answers[i] != null ? String(answers[i]) : '')))
            }
          : undefined
      client = await withTimeout(
        connectClient(host, secrets, {
          trustHostKey: !!trustHostKey,
          keyboardHandler: kiHandler,
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
          message: '请先在 SSH 隧道 Tab 手动完成连接/信任/MFA 后重试。',
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
    if (rec.projectPathKey && typeof isHostAuthorized === 'function' && !isHostAuthorized(rec.projectPathKey, rec.hostId)) {
      throw new Error('SSH session host is not authorized for the current project.')
    }
    const host = getHostById?.(rec.hostId)
    if (!host) throw new Error('host not found')
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
    const client = await withTimeout(
      connectClient(host, secrets, { trustHostKey: false }),
      SSH_RECONNECT_ATTEMPT_TIMEOUT_MS,
      { signal },
    )
    let sftp = null
    if (rec.sftpEnabled) {
      try {
        sftp = await openSftp(client)
      } catch {
        sftp = null
      }
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
    rec.reconnectRunner = true
    try {
      for (let attempt = 1; attempt <= SSH_RECONNECT_MAX_ATTEMPTS; attempt++) {
        if (rec.closing) return
        if (
          rec.projectPathKey &&
          typeof isHostAuthorized === 'function' &&
          !isHostAuthorized(rec.projectPathKey, rec.hostId)
        ) {
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
        } catch {
          // try next attempt
        }
      }
      tombstone(rec)
    } finally {
      rec.reconnectRunner = false
    }
  }

  function onTransportDrop(rec) {
    if (rec.closing) return
    void runAutoReconnect(rec)
  }

  async function reconnectSession(sessionId, { manual = true, signal, projectPathKey } = {}) {
    const rec = sessions.get(String(sessionId || ''))
    if (!rec) throw new Error('session not found')
    if (projectPathKey) {
      const key = normalizeProjectKey(projectPathKey)
      if (key && rec.projectPathKey !== key) throw new Error('session not in this project')
    }
    if (rec.closing) throw new Error('SSH session is closing')
    if (isLiveStatus(rec.status, rec.running) && rec.client) return { ok: true, session: sessionSummary(rec) }
    if (rec.reconnectRunner) throw new Error('SSH reconnect already in progress')
    const host = getHostById?.(rec.hostId)
    if (host && host.authType === 'keyboardInteractive') throw new Error(kbiReconnectError())
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
    if (!rec) return Promise.reject(new Error('session not found'))
    if (isLiveStatus(rec.status, rec.running) && rec.client) return Promise.resolve(rec)
    const deadline = Date.now() + (Number(timeoutMs) || SSH_RECONNECT_ATTEMPT_TIMEOUT_MS)
    return new Promise((resolve, reject) => {
      const tick = () => {
        const cur = sessions.get(String(sessionId || ''))
        if (!cur) {
          reject(new Error('session not found'))
          return
        }
        if (isLiveStatus(cur.status, cur.running) && cur.client) {
          resolve(cur)
          return
        }
        if (cur.status === SSH_STATUS_DISCONNECTED || Date.now() >= deadline) {
          reject(new Error('session not running'))
          return
        }
        setTimeout(tick, 100)
      }
      tick()
    })
  }

  function requireLiveSession(sessionId, projectPathKey) {
    const s = sessions.get(String(sessionId || ''))
    if (!s) throw new Error('session not found')
    if (projectPathKey) {
      const key = normalizeProjectKey(projectPathKey)
      if (key && s.projectPathKey !== key) throw new Error('session not in this project')
    }
    if (!isLiveStatus(s.status, s.running) || !s.client) throw new Error('session not running')
    // Grant revocation must take effect on established sessions, not only new
    // connections. The session is bound to one project; re-check it on every use.
    if (s.projectPathKey && typeof isHostAuthorized === 'function' && !isHostAuthorized(s.projectPathKey, s.hostId)) {
      throw new Error('SSH session host is not authorized for the current project.')
    }
    return s
  }

  function closeSessionsForHost(projectPathKey, hostId) {
    const key = normalizeProjectKey(projectPathKey)
    const closed = []
    for (const s of [...sessions.values()]) {
      if (s.projectPathKey === key && s.hostId === String(hostId) && !s.closing) {
        closeSession(s.id)
        closed.push(s.id)
      }
    }
    return { closed: closed.length, sessionIds: closed }
  }

  function closeSession(sessionId) {
    const s = sessions.get(sessionId)
    if (!s) return { ok: false, error: 'session not found' }
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
    const client = session.client
    if (!isLiveStatus(session.status, session.running) || !client) {
      throw new Error('session not running')
    }
    const timeoutMs = clampTimeoutMs(opts.timeoutMs, SSH_EXEC_DEFAULT_TIMEOUT_MS)
    const maxBytes = opts.maxBytes || 256 * 1024
    const cwd = opts.cwd
    const cmd =
      cwd && String(cwd).startsWith('/')
        ? `cd -- ${JSON.stringify(cwd)} && ${command}`
        : command
    let stream
    return withTimeout(
      new Promise((resolve, reject) => {
        client.exec(cmd, (err, st) => {
          if (err) {
            reject(err)
            return
          }
          stream = st
          let stdout = ''
          let stderr = ''
          stream.on('data', (d) => {
            stdout += d
            if (Buffer.byteLength(stdout) > maxBytes) stdout = stdout.slice(0, maxBytes)
          })
          stream.stderr.on('data', (d) => {
            stderr += d
            if (Buffer.byteLength(stderr) > maxBytes) stderr = stderr.slice(0, maxBytes)
          })
          stream.on('close', (code, sig) => {
            resolve({ stdout, stderr, code: code ?? 0, signal: sig || null })
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
    if (!session.client) throw new Error('session not running')
    const timeoutMs = clampTimeoutMs(opts.timeoutMs, SSH_SHELL_OPEN_TIMEOUT_MS)
    return withTimeout(
      new Promise((resolve, reject) => {
        session.client.shell({ term: 'xterm-color' }, (err, stream) => {
          if (err) return reject(err)
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
      { signal: opts.signal },
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
