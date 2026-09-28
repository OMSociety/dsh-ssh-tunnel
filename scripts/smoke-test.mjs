#!/usr/bin/env node
/**
 * Offline smoke tests (no SSH, no DSH process).
 * Run: node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { normalizeProjectKey, isPathInsideRoots, joinUnderRoot, constrainToWorkspace, workspaceRoot } from '../lib/shared/path.js'
import {
  hostCredentialConfigured,
  publicHost,
  modelHostSummary,
  assertNoSecretFields,
} from '../lib/shared/host-summary.js'
import { chunkFromBuffer } from '../lib/shared/shell-buffer.js'
import {
  fingerprintFromHostKey,
  formatHostFingerprint,
  isUsableHostFingerprint,
} from '../lib/shared/host-key.js'
import {
  clampTimeoutMs,
  defaultTimeoutMsForAction,
  findReusableLive,
  pickOldestTombstone,
  withTimeout,
  SSH_TIMEOUT_MIN_MS,
  SSH_TIMEOUT_MAX_MS,
  SSH_EXEC_DEFAULT_TIMEOUT_MS,
  SSH_SFTP_TRANSFER_TIMEOUT_MS,
  SSH_STATUS_CONNECTED,
  SSH_STATUS_DISCONNECTED,
  disconnectedSessionError,
  kbiUnsupportedError,
} from '../lib/shared/session-policy.js'
import { createSessionRegistry } from '../lib/session.js'
import { isLoopbackHostname, isTrustedRequest } from '../lib/shared/http-trust.js'
import {
  findExistingHostByEndpoint,
  readJsonFile,
  writeJsonAtomic,
} from '../lib/shared/persist.js'
import {
  assertSessionStillAuthorized,
  discardRevokedLocalFile,
} from '../lib/shared/session-auth.js'
import {
  VENDOR_ASSETS,
  isVendorAssetAllowed,
  resolveVendorAsset,
} from '../lib/shared/vendor.js'

// Hermetic workspace root for the path guard: point it at a throwaway directory
// so the suite runs on hosts whose real workspace is not `/workspace` (for
// example Windows drive paths). workspaceRoot() reads the variable at call time.
const WS_ROOT = join(tmpdir(), `dsh-ssh-ws-${process.pid}`)
mkdirSync(WS_ROOT, { recursive: true })
process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT = WS_ROOT
const wsPath = (...segs) => normalizeProjectKey(join(WS_ROOT, ...segs))
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let failed = 0
const pending = []
function test(name, fn) {
  const run = () => {
    try {
      const result = fn()
      if (result && typeof result.then === 'function') {
        return result.then(
          () => console.log('ok  ', name),
          (e) => {
            failed++
            console.error('FAIL', name, e && e.message ? e.message : e)
          },
        )
      }
      console.log('ok  ', name)
    } catch (e) {
      failed++
      console.error('FAIL', name, e && e.message ? e.message : e)
    }
  }
  const out = run()
  if (out && typeof out.then === 'function') pending.push(out)
}

test('normalizeProjectKey strips trailing slash', () => {
  const key = normalizeProjectKey(wsPath('DSH-plugin') + '/')
  assert.equal(key, wsPath('DSH-plugin'))
  assert.ok(!key.endsWith('/') && !key.endsWith('\\'), 'no trailing separator')
})

test('normalizeProjectKey empty', () => {
  assert.equal(normalizeProjectKey(''), '')
  assert.equal(normalizeProjectKey(null), '')
})

test('isPathInsideRoots allows children only', () => {
  const root = wsPath('DSH-plugin')
  assert.equal(isPathInsideRoots(wsPath('DSH-plugin', 'a'), [root]), true)
  assert.equal(isPathInsideRoots(wsPath('other'), [root]), false)
  assert.equal(isPathInsideRoots(root, [root]), true)
})

test('joinUnderRoot rejects escape', () => {
  const root = wsPath('DSH-plugin')
  assert.throws(() => joinUnderRoot(root, join('..', '..', 'etc', 'passwd')))
  const ok = joinUnderRoot(root, join('sub', 'file.txt'))
  assert.equal(ok, wsPath('DSH-plugin', 'sub', 'file.txt'))
})

test('constrainToWorkspace rejects lexical escape', () => {
  const re = new RegExp('must be under ' + escRe(workspaceRoot()))
  assert.throws(() => constrainToWorkspace('/home/node/.dsh/ssh-tunnel/secrets.json'), re)
  assert.throws(() => constrainToWorkspace('/tmp'), re)
})

test('persist: corrupt json throws; atomic write replaces', () => {
  const dir = join(tmpdir(), `dsh-ssh-persist-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'secrets.json')
  writeFileSync(p, '{not json', 'utf8')
  assert.throws(() => readJsonFile(p, { version: 1, byHostId: {} }), /corrupt json/)
  writeJsonAtomic(p, { version: 1, byHostId: { h1: { password: 'x' } } }, 0o600)
  const loaded = readJsonFile(p, null)
  assert.equal(loaded.byHostId.h1.password, 'x')
  assert.equal(existsSync(p + '.tmp'), false)
  assert.equal(findExistingHostByEndpoint(
    [{ host: 'a', port: 22, username: 'root', id: '1' }],
    'a',
    22,
    'root',
  )?.id, '1')
  assert.equal(findExistingHostByEndpoint(
    [{ host: 'a', port: 22, username: 'root', id: '1' }],
    'a',
    22,
    'other',
  ), undefined)
})

test('http-trust: 0.0.0.0 is not loopback; evil Origin is rejected', () => {
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('::1'), true)
  assert.equal(isLoopbackHostname('0.0.0.0'), false)
  const loopReq = { headers: { host: '127.0.0.1:3080' } }
  assert.equal(isTrustedRequest(loopReq, []), true)
  const zeroReq = { headers: { host: '0.0.0.0:3080' } }
  assert.equal(isTrustedRequest(zeroReq, []), false)
  const csrf = { headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' } }
  assert.equal(isTrustedRequest(csrf, []), false)
  const sameOrigin = { headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } }
  assert.equal(isTrustedRequest(sameOrigin, []), true)
})

test('constrainToWorkspace rejects outbound symlink', () => {
  const base = wsPath('DSH-plugin')
  const link = join(base, '.audit-path-guard-link')
  mkdirSync(base, { recursive: true })
  try {
    try { unlinkSync(link) } catch {}
    try {
      // The link target must exist for the realpath walk to observe the escape.
      symlinkSync(tmpdir(), link, 'dir')
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'ENOSYS')) {
        console.log('skip  constrainToWorkspace rejects outbound symlink (symlink unavailable)')
        return
      }
      throw e
    }
    assert.throws(
      () => constrainToWorkspace(join(link, 'ssh-tunnel', '_nope')),
      new RegExp('escapes ' + escRe(workspaceRoot()) + ' via symlink'),
    )
    const unlinked = constrainToWorkspace(link, { forUnlink: true })
    assert.equal(unlinked, normalizeProjectKey(link))
  } finally {
    try { unlinkSync(link) } catch {}
  }
})

test('credential + publicHost never leak secrets', () => {
  const host = {
    id: 'h1',
    name: 'n',
    host: '1.2.3.4',
    port: 22,
    username: 'root',
    authType: 'password',
  }
  const secrets = { byHostId: { h1: { password: 's3cret', privateKeyPem: 'BEGIN' } } }
  assert.equal(hostCredentialConfigured(host, secrets), true)
  const pub = publicHost(host, secrets)
  assert.equal(pub.passwordConfigured, true)
  assert.equal(pub.credentialStatus, 'saved')
  assert.equal('password' in pub, false)
  assert.equal('privateKeyPem' in pub, false)
  assertNoSecretFields(pub)
  const model = modelHostSummary(host, secrets)
  assertNoSecretFields(model)
  assert.equal(model.credentialStatus, 'saved')
})

test('retired keyboard-interactive is unsupported, not a usable credential', () => {
  const host = { id: 'h2', authType: 'keyboardInteractive', host: 'x', username: 'u' }
  const pub = publicHost(host, { byHostId: {} })
  assert.equal(pub.credentialStatus, 'unsupported')
  assert.equal(pub.credentialConfigured, false)
})

test('chunkFromBuffer incremental', () => {
  const a = chunkFromBuffer('hello', 0)
  assert.equal(a.chunk, 'hello')
  assert.equal(a.length, 5)
  const b = chunkFromBuffer('hello world', 5)
  assert.equal(b.chunk, ' world')
  assert.equal(b.since, 5)
})

test('host key fingerprint is stable sha256 hex (no UTF-8 collision)', () => {
  const prefix = Buffer.concat([
    Buffer.from([0, 0, 0, 11]),
    Buffer.from('ssh-ed25519'),
    Buffer.from([0, 0, 0, 32]),
  ])
  const k1 = Buffer.concat([prefix, Buffer.alloc(32, 0x80)])
  const k2 = Buffer.concat([prefix, Buffer.alloc(32, 0x81)])
  // Legacy bug: String(buf) collapsed different keys via U+FFFD.
  assert.equal(String(k1) === String(k2), true)
  const f1 = fingerprintFromHostKey(k1)
  const f2 = fingerprintFromHostKey(k2)
  assert.equal(isUsableHostFingerprint(f1), true)
  assert.equal(isUsableHostFingerprint(f2), true)
  assert.notEqual(f1, f2)
  // ssh2 hostHash path: already-hex digest is kept as-is (lowercased).
  assert.equal(fingerprintFromHostKey(f1.toUpperCase()), f1)
  assert.equal(formatHostFingerprint(f1), 'SHA256:' + f1)
  // Legacy binary stored strings are rejected as unusable.
  assert.equal(isUsableHostFingerprint(String(k1)), false)
  assert.equal(isUsableHostFingerprint('\u0000ssh-ed25519'), false)
})

test('clampTimeoutMs bounds and fallback', () => {
  assert.equal(clampTimeoutMs(undefined, 30_000), 30_000)
  assert.equal(clampTimeoutMs(0, 30_000), 30_000)
  assert.equal(clampTimeoutMs(500, 30_000), SSH_TIMEOUT_MIN_MS)
  assert.equal(clampTimeoutMs(999_999, 30_000), SSH_TIMEOUT_MAX_MS)
})

test('defaultTimeoutMsForAction', () => {
  assert.equal(defaultTimeoutMsForAction('exec'), SSH_EXEC_DEFAULT_TIMEOUT_MS)
  assert.equal(defaultTimeoutMsForAction('sftp_upload'), SSH_SFTP_TRANSFER_TIMEOUT_MS)
  assert.equal(defaultTimeoutMsForAction('sftp_list'), 30_000)
})

test('reuse live vs tombstone pick', () => {
  const key = '/workspace'
  const sessions = [
    { id: 'dead', hostId: 'h1', projectPathKey: key, status: 'disconnected', running: false, sftpEnabled: true, createdAt: 1 },
    { id: 'live', hostId: 'h1', projectPathKey: key, status: 'connected', running: true, sftpEnabled: true, createdAt: 2 },
  ]
  assert.equal(findReusableLive(sessions, { projectPathKey: key, hostId: 'h1', needsSftp: true }).id, 'live')
  assert.equal(pickOldestTombstone(sessions, { projectPathKey: key, hostId: 'h1', needsSftp: true }).id, 'dead')
  assert.equal(
    findReusableLive(
      sessions.filter((s) => s.id === 'dead'),
      { projectPathKey: key, hostId: 'h1', needsSftp: true },
    ),
    undefined,
  )
})

test('withTimeout rejects and calls onTimeout', async () => {
  let hit = false
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 1000, { onTimeout: () => { hit = true } }),
    (e) => e.timedOut === true && hit === true,
  )
})

test('disconnectedSessionError is stable English for the model', () => {
  assert.match(disconnectedSessionError(), /disconnected/i)
})

test('kbiUnsupportedError tells the model to switch auth', () => {
  assert.match(kbiUnsupportedError(), /not supported/i)
  assert.match(kbiUnsupportedError(), /password or private key/i)
})

/* ------------------------------------------------------------------ *
 * Security regression: revoking a host's project grant must make its  *
 * established tunnel sessions unusable AND unreconnectable, and revoke *
 * must terminate those sessions (DSH plugin upgrade audit 2026-09-08). *
 * ------------------------------------------------------------------ */

function makeRegistry({ isHostAuthorized = () => true } = {}) {
  return createSessionRegistry({
    connectClient: async () => {
      throw new Error('connectClient must not be used in offline tests')
    },
    loadSecrets: () => ({ byHostId: {} }),
    getPrompt: () => undefined,
    getHostById: (id) => ({
      id,
      name: 'x',
      host: '1.2.3.4',
      port: 22,
      username: 'root',
      authType: 'password',
    }),
    isHostAuthorized,
  })
}

function liveRec(id, hostId, projectPathKey) {
  return {
    id,
    hostId,
    projectPathKey,
    status: SSH_STATUS_CONNECTED,
    running: true,
    client: {},
    sftpEnabled: true,
    closing: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reconnectRunner: false,
    reconnectAttempt: 0,
    connectionGeneration: 1,
    title: `t-${id}`,
    endpoint: '',
  }
}

test('revoked host: requireLiveSession refuses use of established session', () => {
  const registry = makeRegistry({ isHostAuthorized: () => false })
  const key = normalizeProjectKey('/workspace/DSH-plugin')
  registry.sessions.set('s1', liveRec('s1', 'h-sg', key))
  // Shell / SFTP operations all go through requireLiveSession; a revoked host
  // must not be usable even though the session object is still live.
  assert.throws(() => registry.requireLiveSession('s1', key), /not authorized/)
})

test('granted host: requireLiveSession still allows use', () => {
  const registry = makeRegistry({ isHostAuthorized: () => true })
  const key = normalizeProjectKey('/workspace/DSH-plugin')
  registry.sessions.set('s1', liveRec('s1', 'h-sg', key))
  assert.equal(registry.requireLiveSession('s1', key).id, 's1')
})

test('revoked host: reconnect refuses to resurrect the session', async () => {
  const registry = makeRegistry({ isHostAuthorized: () => false })
  const key = normalizeProjectKey('/workspace/DSH-plugin')
  const rec = liveRec('s1', 'h-sg', key)
  rec.status = SSH_STATUS_DISCONNECTED
  rec.running = false
  registry.sessions.set('s1', rec)
  await assert.rejects(
    () => registry.reconnectSession('s1', { manual: true, projectPathKey: key }),
    /not authorized/,
  )
})

test('requireLiveSession and closeSession require projectPathKey', () => {
  const registry = makeRegistry()
  const key = normalizeProjectKey('/workspace/DSH-plugin')
  registry.sessions.set('s1', liveRec('s1', 'h-sg', key))
  assert.throws(() => registry.requireLiveSession('s1'), /projectPathKey required/)
  assert.throws(() => registry.requireLiveSession('s1', ''), /projectPathKey required/)
  assert.throws(() => registry.requireLiveSession('s1', normalizeProjectKey('/workspace/hk')), /not in this project/)
  assert.throws(() => registry.closeSession('s1'), /projectPathKey required/)
  assert.equal(registry.closeSession('s1', key).ok, true)
  assert.equal(registry.sessions.has('s1'), false)
})

test('closeSessionsForHost terminates only the revoked host sessions in the project', () => {
  const registry = makeRegistry()
  const keyA = normalizeProjectKey('/workspace/DSH-plugin')
  const keyB = normalizeProjectKey('/workspace/other')
  registry.sessions.set('a1', liveRec('a1', 'h-sg', keyA)) // revoked host, this project
  registry.sessions.set('b1', liveRec('b1', 'h2', keyA)) // other host, same project
  registry.sessions.set('c1', liveRec('c1', 'h-sg', keyB)) // same host, other project
  const out = registry.closeSessionsForHost(keyA, 'h-sg')
  assert.equal(out.closed, 1)
  assert.equal(registry.sessions.has('a1'), false)
  assert.equal(registry.sessions.has('b1'), true)
  assert.equal(registry.sessions.has('c1'), true)
})

/* ------------------------------------------------------------------ *
 * Security regression (v0.4.3): a tool result must not be delivered   *
 * after the host's grant is revoked mid-operation, and a downloaded    *
 * file must not survive a mid-transfer revocation.                     *
 * ------------------------------------------------------------------ */

test('result gate: revoked host denies tool result delivery', () => {
  assert.throws(
    () =>
      assertSessionStillAuthorized(
        { projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' },
        () => false,
      ),
    /not authorized/,
  )
})

test('result gate: granted host still delivers tool results', () => {
  assert.doesNotThrow(() =>
    assertSessionStillAuthorized({ projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' }, () => true),
  )
})

test('result gate: absent predicate is fail-closed', () => {
  assert.throws(
    () =>
      assertSessionStillAuthorized({ projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' }, undefined),
    /predicate required/,
  )
})

test('download discard: revoked host removes the local file', () => {
  const p = join(tmpdir(), `dsh-ssh-tunnel-revoke-${process.pid}.txt`)
  writeFileSync(p, 'secret data', 'utf8')
  const discarded = discardRevokedLocalFile(
    { projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' },
    p,
    () => false,
  )
  assert.equal(discarded, true)
  assert.equal(existsSync(p), false)
})

test('download discard: granted host keeps the local file', () => {
  const p = join(tmpdir(), `dsh-ssh-tunnel-grant-${process.pid}.txt`)
  writeFileSync(p, 'data', 'utf8')
  try {
    const discarded = discardRevokedLocalFile(
      { projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' },
      p,
      () => true,
    )
    assert.equal(discarded, false)
    assert.equal(existsSync(p), true)
  } finally {
    try {
      unlinkSync(p)
    } catch {}
  }
})

test('vendor: allowlist resolves the three xterm assets to existing files', () => {
  assert.deepEqual(Object.keys(VENDOR_ASSETS).sort(), ['addon-fit.js', 'xterm.css', 'xterm.js'])
  for (const [name, entry] of Object.entries(VENDOR_ASSETS)) {
    assert.equal(isVendorAssetAllowed(name), true, name)
    const r = resolveVendorAsset(name)
    assert.equal(existsSync(r.path), true, `${name} -> ${r.path}`)
    assert.equal(typeof r.type, 'string')
  }
})

test('vendor: unknown or traversing names are rejected', () => {
  assert.equal(isVendorAssetAllowed('../../etc/passwd'), false)
  assert.equal(isVendorAssetAllowed('xterm.js?x=1'), false)
  assert.equal(isVendorAssetAllowed('xterm.js/../'), false)
  assert.throws(() => resolveVendorAsset('../../etc/passwd'), /not allowed/)
  assert.throws(() => resolveVendorAsset(''), /not allowed/)
})

await Promise.all(pending)
if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall passed')
