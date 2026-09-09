/**
 * Result-delivery authorization gates for SSH session operations (security).
 * Pure helpers kept in shared/ so they are testable without an ssh2 install.
 *
 * Background (v0.4.3): a host grant can be revoked while an SSHManager
 * operation is already in flight. Closing the session stops the transport,
 * but a command can complete and a file can be pulled in the same tick as the
 * revocation. These gates are the *second* boundary: even if the transport
 * work finished, nothing from the revoked host may be delivered to the agent
 * (and no downloaded file may remain on disk).
 */
import { unlinkSync } from 'node:fs'

/**
 * Throw when the session's host is no longer granted to the session's own
 * project. Call this immediately before delivering a tool result (exec,
 * read_session, sftp_list / stat / read_text, ...). `isHostAuthorized` is
 * injected so this module stays pure and offline-testable.
 */
export function assertSessionStillAuthorized(session, isHostAuthorized) {
  if (!session || typeof isHostAuthorized !== 'function') return
  if (session.projectPathKey && !isHostAuthorized(session.projectPathKey, session.hostId)) {
    throw new Error('SSH session host is not authorized for the current project.')
  }
}

/**
 * When the host's grant was revoked (checked against the session's own
 * project), remove the locally written download file so a pull that raced
 * with the revocation does not leave data on disk. Returns true when the file
 * was discarded. Safe to call in a finally-style path (tolerates ENOENT).
 */
export function discardRevokedLocalFile(session, localPath, isHostAuthorized) {
  if (!session || typeof isHostAuthorized !== 'function') return false
  if (session.projectPathKey && !isHostAuthorized(session.projectPathKey, session.hostId)) {
    try {
      unlinkSync(localPath)
    } catch {}
    return true
  }
  return false
}