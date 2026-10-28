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

/**
 * Wildcard bind addresses (`dsh web --host` rejects them, so a wildcard here
 * means the value came from somewhere unexpected) — never trust them.
 */
export function isWildcardHost(host) {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase()
  return h === '0.0.0.0' || h === '::'
}

/**
 * Trust list derived from the web profile's startup flags (the `webStartup`
 * service): its explicit `trustedHosts`, plus the concrete `--host` bind
 * address (port-less, so it matches on any port like the host's own fence).
 * @param {object|undefined} webStartup value of ctx.get('webStartup', true)
 * @returns {string[]} entries for isTrustedRequest
 */
export function trustedHostsFromStartup(webStartup) {
  if (!webStartup || typeof webStartup !== 'object') return []
  const list = Array.isArray(webStartup.trustedHosts)
    ? webStartup.trustedHosts.map((e) => String(e)).filter(Boolean)
    : []
  const host = typeof webStartup.host === 'string' ? webStartup.host.trim() : ''
  if (host && !isWildcardHost(host) && !list.includes(host)) list.push(host)
  return list
}

/**
 * One API request against the host's trust chain:
 *   1. `connection` service (0.2.x web profile) — its requestRejection applies
 *      the host's own Host/Origin fence plus browser-session authentication;
 *      when the service answers, its verdict is final (hard switch).
 *   2. `webStartup` service — self-managed check against the startup flags.
 *   3. Neither present (e.g. desktop profile) — loopback only.
 * @param {object} req Node HTTP request
 * @param {object} services `{ connection?, webStartup? }` snapshots
 * @returns {{ allowed: boolean, status: number }} status to send when not allowed
 */
export function apiTrustDecision(req, services = {}) {
  const connection = services.connection
  if (connection && typeof connection.requestRejection === 'function') {
    const rejection = connection.requestRejection(req)
    if (rejection === undefined || rejection === null) return { allowed: true, status: 200 }
    const status = Number(rejection)
    return { allowed: false, status: status === 401 || status === 403 ? status : 403 }
  }
  if (services.webStartup) {
    return isTrustedRequest(req, trustedHostsFromStartup(services.webStartup))
      ? { allowed: true, status: 200 }
      : { allowed: false, status: 403 }
  }
  return isTrustedRequest(req, [])
    ? { allowed: true, status: 200 }
    : { allowed: false, status: 403 }
}
