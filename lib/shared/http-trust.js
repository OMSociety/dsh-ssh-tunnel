/**
 * Loopback / Origin checks for the local HTTP API.
 * 0.0.0.0 is NOT loopback (it is a bind-all address).
 */

export function isLoopbackHostname(hostname) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

function originHostPort(originHeader) {
  try {
    const u = new URL(String(originHeader))
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const port = u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '')
    return { host, port, hostHeaderLike: port ? `${host}:${port}` : host }
  } catch {
    return null
  }
}

/**
 * @param {object} req Node HTTP request
 * @param {string[]} trustedHosts
 */
export function isTrustedRequest(req, trustedHosts) {
  try {
    const hostHeader = req.headers?.host || req.headers?.Host
    if (!hostHeader) return false
    const url = new URL('http://' + hostHeader)
    const reqHost = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const list = Array.isArray(trustedHosts) ? trustedHosts : []
    const hostOk =
      isLoopbackHostname(reqHost) ||
      list.some((entry) => {
        const e = String(entry)
        return e === hostHeader || e === url.hostname || e === url.host
      })
    if (!hostOk) return false

    const origin = req.headers?.origin || req.headers?.Origin
    if (!origin) return true
    const parsed = originHostPort(origin)
    if (!parsed) return false
    if (isLoopbackHostname(parsed.host) && isLoopbackHostname(reqHost)) {
      const reqPort = url.port || '80'
      if (parsed.port && parsed.port !== reqPort) return false
      return true
    }
    return list.some((entry) => {
      const e = String(entry)
      return e === parsed.hostHeaderLike || e === parsed.host || e === origin
    })
  } catch {
    return false
  }
}

export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
