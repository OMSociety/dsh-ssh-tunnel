/**
 * In-memory SSH session registry: live / tombstone / close.
 * Transport connect (host-key prompts) is injected as connectClient.
 */
import { randomUUID } from 'node:crypto'
import { chunkFromBuffer } from './shared/shell-buffer.js'
import { normalizeProjectKey } from './shared/path.js'
import {
  SSH_STATUS_CONNECTED,
  SSH_STATUS_DISCONNECTED,
  findReusableLive,
  isLiveStatus,
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

function attachTransport(rec, client) {
  const onDrop = () => {
    if (rec.closing) return
    if (rec.client !== client) return
    tombstone(rec)
  }
  client.on('close', onDrop)
  client.on('end', onDrop)
  client.on('error', onDrop)
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

export function createSessionRegistry({ connectClient, loadSecrets, getPrompt }) {
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
      client = await connectClient(host, secrets, {
        trustHostKey: !!trustHostKey,
        keyboardHandler: kiHandler,
      })
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
    attachTransport(rec, client)
    sessions.set(id, rec)
    return { ok: true, session: sessionSummary(rec) }
  }

  function requireLiveSession(sessionId, projectPathKey) {
    const s = sessions.get(String(sessionId || ''))
    if (!s) throw new Error('session not found')
    if (projectPathKey) {
      const key = normalizeProjectKey(projectPathKey)
      if (key && s.projectPathKey !== key) throw new Error('session not in this project')
    }
    if (!isLiveStatus(s.status, s.running) || !s.client) throw new Error('session not running')
    return s
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

  function execOnSession(session, command, opts = {}) {
    return new Promise((resolve, reject) => {
      const timeoutMs = opts.timeoutMs || 60000
      const maxBytes = opts.maxBytes || 256 * 1024
      const client = session.client
      if (!isLiveStatus(session.status, session.running) || !client) {
        reject(new Error('session not running'))
        return
      }
      let timer = setTimeout(() => {
        reject(new Error('exec timeout'))
      }, timeoutMs)
      const cwd = opts.cwd
      const cmd =
        cwd && String(cwd).startsWith('/')
          ? `cd -- ${JSON.stringify(cwd)} && ${command}`
          : command
      client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(err)
          return
        }
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
        stream.on('close', (code, signal) => {
          clearTimeout(timer)
          resolve({ stdout, stderr, code: code ?? 0, signal: signal || null })
        })
      })
    })
  }

  async function ensureShell(session) {
    if (session.shellStream) return session.shellStream
    if (!session.client) throw new Error('session not running')
    return new Promise((resolve, reject) => {
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
    })
  }

  return {
    sessions,
    sessionSummary,
    listSessionsForProject,
    findReusableSession,
    createLiveSession,
    requireLiveSession,
    closeSession,
    execOnSession,
    ensureShell,
    openSftp,
    get(id) {
      return sessions.get(id)
    },
  }
}
