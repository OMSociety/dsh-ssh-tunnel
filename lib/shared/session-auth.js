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
