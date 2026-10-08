/**
 * Pure SSH session policy: timeouts, status invariant, reuse vs tombstone.
 * No ssh2, no I/O.
 */

export const SSH_KEEPALIVE_INTERVAL_MS = 30_000
export const SSH_KEEPALIVE_COUNT_MAX = 3
export const SSH_READY_TIMEOUT_MS = 20_000
export const SSH_RECONNECT_MAX_ATTEMPTS = 3
export const SSH_RECONNECT_DELAYS_MS = [5_000, 10_000, 10_000]
export const SSH_RECONNECT_ATTEMPT_TIMEOUT_MS = 20_000
export const SSH_TOOL_TIMEOUT_MS = 300_000
export const SSH_TIMEOUT_MIN_MS = 1_000
export const SSH_TIMEOUT_MAX_MS = 300_000
export const SSH_EXEC_DEFAULT_TIMEOUT_MS = 30_000
export const SSH_SFTP_META_TIMEOUT_MS = 30_000
export const SSH_SFTP_TRANSFER_TIMEOUT_MS = 120_000
export const SSH_SHELL_OPEN_TIMEOUT_MS = 10_000

export const SSH_STATUS_CONNECTED = 'connected'
export const SSH_STATUS_RECONNECTING = 'reconnecting'
export const SSH_STATUS_DISCONNECTED = 'disconnected'

export function clampTimeoutMs(value, fallback) {
  const n = Number(value)
  const base = Number.isFinite(n) && n > 0 ? n : fallback
  return Math.min(SSH_TIMEOUT_MAX_MS, Math.max(SSH_TIMEOUT_MIN_MS, Math.floor(base)))
}

export function defaultTimeoutMsForAction(action) {
  const a = String(action || '')
  if (a === 'exec') return SSH_EXEC_DEFAULT_TIMEOUT_MS
  if (a === 'sftp_read_text' || a === 'sftp_write_text' || a === 'sftp_upload' || a === 'sftp_download') {
    return SSH_SFTP_TRANSFER_TIMEOUT_MS
  }
  if (a.startsWith('sftp_')) return SSH_SFTP_META_TIMEOUT_MS
  if (a === 'read_session' || a === 'send_input' || a === 'resize_session') return SSH_SHELL_OPEN_TIMEOUT_MS
  return SSH_EXEC_DEFAULT_TIMEOUT_MS
}

export function isLiveStatus(status, running) {
  return status === SSH_STATUS_CONNECTED && running === true
}

export function findReusableLive(sessions, { projectPathKey, hostId, needsSftp }) {
  return sessions
    .filter((s) => {
      if (s.projectPathKey !== projectPathKey || s.hostId !== hostId) return false
      if (!isLiveStatus(s.status, s.running)) return false
      if (needsSftp && !s.sftpEnabled) return false
      return true
    })
    .sort((a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)))[0]
}

export function pickOldestTombstone(sessions, { projectPathKey, hostId, needsSftp }) {
  return sessions
    .filter((s) => {
      if (s.projectPathKey !== projectPathKey || s.hostId !== hostId) return false
      if (s.status !== SSH_STATUS_DISCONNECTED || s.running) return false
      if (needsSftp && !s.sftpEnabled) return false
      return true
    })
    .sort((a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)))[0]
}

export function disconnectedSessionError() {
  return 'SSH session is disconnected. Reconnect in the SSH Tunnel tab, or omit session_id to reuse_or_create.'
}

export function kbiReconnectError() {
  return 'keyboard-interactive auth is not supported; edit the host to password or private key.'
}

export function kbiUnsupportedError() {
  return 'keyboard-interactive auth is not supported; edit the host to password or private key.'
}

export function withTimeout(work, ms, { signal, onTimeout } = {}) {
  const timeoutMs = clampTimeoutMs(ms, SSH_EXEC_DEFAULT_TIMEOUT_MS)
  const run = typeof work === 'function' ? work() : work
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (kind, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (kind === 'ok') resolve(value)
      else reject(value)
    }
    const onAbort = () => {
      try {
        onTimeout?.()
      } catch {}
      const err = new Error('Cancelled')
      err.aborted = true
      finish('err', err)
    }
    const timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {}
      const err = new Error('timeout')
      err.timedOut = true
      finish('err', err)
    }, timeoutMs)
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    Promise.resolve(run).then(
      (v) => finish('ok', v),
      (e) => finish('err', e),
    )
  })
}

export const MAX_BYTES_MIN = 1_024
export const MAX_BYTES_MAX = 1_048_576
export const MAX_BYTES_EXEC_DEFAULT = 262_144
export const MAX_BYTES_SFTP_READ_DEFAULT = 524_288

export function clampMaxBytes(value, fallback) {
  const n = Number(value)
  const base = Number.isFinite(n) && n > 0 ? n : fallback
  return Math.min(MAX_BYTES_MAX, Math.max(MAX_BYTES_MIN, Math.floor(base)))
}

/** HTTP status for an API error code; anything unmapped stays a server fault. */
export const API_ERROR_STATUS = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  payload_too_large: 413,
}

export function sshError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

export function hostKeyPromptMessage() {
  return 'Connection needs your confirmation: complete the trust/MFA prompt in the SSH Tunnel tab, then retry.'
}
