/** Credential presence without exposing secret material. */
export function hostCredentialConfigured(host, secrets) {
  if (!host) return false
  if (host.authType === 'keyboardInteractive') return false
  const sec = (secrets && secrets.byHostId && secrets.byHostId[host.id]) || {}
  if (host.authType === 'privateKey') {
    return !!(host.privateKeyPath || sec.privateKeyPem)
  }
  return !!sec.password
}

/** UI-safe host record (never includes password/PEM). */
export function publicHost(host, secrets) {
  const configured = hostCredentialConfigured(host, secrets)
  const sec = (secrets && secrets.byHostId && secrets.byHostId[host.id]) || {}
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    port: host.port || 22,
    username: host.username,
    authType: host.authType || 'privateKey',
    privateKeyPath: host.privateKeyPath || '',
    source: host.source || 'manual',
    updatedAt: host.updatedAt || 0,
    credentialConfigured: configured,
    credentialStatus:
      host.authType === 'keyboardInteractive'
        ? 'unsupported'
        : configured
          ? 'saved'
          : 'missing',
    passwordConfigured: !!sec.password,
    privateKeyConfigured: !!(host.privateKeyPath || sec.privateKeyPem),
  }
}

/** Model-facing summary: no paths to key files beyond endpoint metadata. */
export function modelHostSummary(host, secrets) {
  const p = publicHost(host, secrets)
  return {
    host_id: p.id,
    name: p.name,
    endpoint: `${p.username}@${p.host}:${p.port}`,
    username: p.username,
    host: p.host,
    port: p.port,
    authType: p.authType,
    credentialConfigured: p.credentialConfigured,
    credentialStatus: p.credentialStatus,
  }
}

/** Fail if object looks like it still carries raw secrets (for tests / asserts). */
export function assertNoSecretFields(obj, label = 'object') {
  const banned = ['password', 'privateKeyPem', 'privateKey', 'passphrase', 'secret']
  const stack = [{ value: obj, path: label }]
  while (stack.length) {
    const { value, path } = stack.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      value.forEach((v, i) => stack.push({ value: v, path: `${path}[${i}]` }))
      continue
    }
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase()
      if (banned.includes(key) && v) {
        throw new Error(`${path}.${k} must not carry secret material`)
      }
      // allow *Configured boolean flags
      if (typeof v === 'object' && v) stack.push({ value: v, path: `${path}.${k}` })
    }
  }
  return true
}
