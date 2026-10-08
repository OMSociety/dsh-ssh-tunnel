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
 *
 * v0.4.4: missing predicate is fail-closed (never a silent no-op). HTTP and
 * write actions re-check the same gate.
 *
 * A session without a project binding is also denied: every creation path
 * normalizes projectPathKey, so an empty binding means corrupted state, and
 * skipping the comparison would silently authorize it.
 */
import { unlinkSync } from 'node:fs'

export function assertSessionStillAuthorized(session, isHostAuthorized, deniedMessage) {
  if (!session) throw new Error('SSH session missing')
  if (typeof isHostAuthorized !== 'function') {
    throw new Error('SSH authorization predicate required')
  }
  if (!isHostAuthorized(session.projectPathKey, session.hostId)) {
    throw new Error(
      typeof deniedMessage === 'string' && deniedMessage
        ? deniedMessage
        : 'SSH session host is not authorized for the current project.',
    )
  }
}

export function discardRevokedLocalFile(session, localPath, isHostAuthorized) {
  if (!session) return false
  if (typeof isHostAuthorized !== 'function') {
    throw new Error('SSH authorization predicate required')
  }
  if (!isHostAuthorized(session.projectPathKey, session.hostId)) {
    try {
      unlinkSync(localPath)
    } catch {}
    return true
  }
  return false
}
