#!/usr/bin/env node
/**
 * Offline smoke tests. No real SSH hosts and no DSH process: remote-behavior
 * cases dial an in-process ssh2.Server on 127.0.0.1 with a throwaway key.
 * Run: node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { normalizeProjectKey, isPathInsideRoots, constrainToWorkspace, workspaceRoot, workspaceRoots } from '../lib/shared/path.js'
import { requireString, stringOrDefault } from '../lib/shared/args.js'
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
  clampMaxBytes,
  defaultTimeoutMsForAction,
  findReusableLive,
  pickOldestTombstone,
  withTimeout,
  sshError,
  hostKeyPromptMessage,
  API_ERROR_STATUS,
  MAX_BYTES_MIN,
  MAX_BYTES_MAX,
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
import ssh2 from 'ssh2'
const { Server: SshServer, Client } = ssh2

// Hermetic workspace root for the path guard: point it at a throwaway directory
// so the suite runs on hosts whose real workspace is not `/workspace` (for
// example Windows drive paths). workspaceRoot() reads the variable at call time.
const tempDirs = []
function makeTempDir(prefix) {
  const d = join(tmpdir(), `${prefix}-${process.pid}`)
  mkdirSync(d, { recursive: true })
  tempDirs.push(d)
  return d
}
const WS_ROOT = makeTempDir('dsh-ssh-ws')
process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT = WS_ROOT
const wsPath = (...segs) => normalizeProjectKey(join(WS_ROOT, ...segs))
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let passed = 0
let failed = 0
let skipped = 0
const pending = []
class Skip extends Error {}
function skip(reason) {
  throw new Skip(reason)
}
function test(name, fn) {
  const run = () => {
    try {
      const result = fn()
      if (result && typeof result.then === 'function') {
        return result.then(
          () => {
            passed++
            console.log('ok  ', name)
          },
          (e) => {
            if (e instanceof Skip) {
              skipped++
              console.log('skip ', name)
              return
            }
            failed++
            console.error('FAIL', name, e && e.message ? e.message : e)
          },
        )
      }
      passed++
      console.log('ok  ', name)
    } catch (e) {
      if (e instanceof Skip) {
        skipped++
        console.log('skip ', name)
        return
      }
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

test('isPathInsideRoots accepts children of filesystem roots', () => {
  const root = normalizeProjectKey('/')
  assert.equal(isPathInsideRoots(normalizeProjectKey('/etc/passwd'), [root]), true)
  assert.equal(isPathInsideRoots(root, [root]), true)
})

test('constrainToWorkspace rejects lexical escape', () => {
  const re = new RegExp('must be under ' + escRe(workspaceRoot()))
  assert.throws(() => constrainToWorkspace('/home/node/.dsh/ssh-tunnel/secrets.json'), re)
  assert.throws(() => constrainToWorkspace('/tmp'), re)
})

// The guard used to know only `/workspace`, so on hosts whose project
// workspace is a Windows drive path every real local path was rejected and
// SFTP upload/download never started. The project workspace the host passes at
// call time is now an allowed root (the env override stays allowed too).
test('constrainToWorkspace accepts the project workspace root', () => {
  const project = join(realpathSync(WS_ROOT), 'DSH-project')
  mkdirSync(project, { recursive: true })
  const file = join(project, 'upload.txt')
  writeFileSync(file, 'probe', 'utf8')
  assert.equal(constrainToWorkspace(file, { root: project }), file)
  assert.equal(
    constrainToWorkspace(join('nested', 'child.txt'), { root: project }),
    join(project, 'nested', 'child.txt'),
  )
  assert.equal(constrainToWorkspace(wsPath('DSH-plugin', 'a'), { root: project }), wsPath('DSH-plugin', 'a'))
  assert.throws(
    () => constrainToWorkspace(join(tmpdir(), 'dsh-ssh-outside-probe.txt'), { root: project }),
    /must be under/,
  )
})

// No implicit fallback root: guessing one silently widens the trust boundary.
test('constrainToWorkspace fails closed with no root configured', () => {
  const saved = process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT
  delete process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT
  try {
    assert.throws(() => constrainToWorkspace('/tmp/whatever'), /no local workspace root configured/)
    assert.throws(() => constrainToWorkspace('/tmp/whatever', { root: '' }), /no local workspace root configured/)
  } finally {
    if (saved !== undefined) process.env.DSH_SSH_TUNNEL_WORKSPACE_ROOT = saved
  }
})

test('constrainToWorkspace tolerates a missing leaf inside the root', () => {
  const p = wsPath('DSH-plugin', 'not-yet-created', 'child.txt')
  assert.equal(constrainToWorkspace(p), p)
})

test('workspaceRoots lists the project workspace then the override', () => {
  const project = normalizeProjectKey(join(realpathSync(WS_ROOT), 'DSH-project'))
  assert.deepEqual(workspaceRoots(), [normalizeProjectKey(WS_ROOT)])
  assert.deepEqual(workspaceRoots(project), [project, normalizeProjectKey(WS_ROOT)])
  assert.equal(workspaceRoot(project), project)
})

test('requireString rejects missing and empty values', () => {
  assert.throws(() => requireString(undefined, 'path'), /path required/)
  assert.throws(() => requireString('', 'path'), /path required/)
  assert.throws(() => requireString('   ', 'path'), /path required/)
  assert.equal(requireString('x', 'path'), 'x')
  assert.equal(stringOrDefault(undefined, 'fb', 'path'), 'fb')
  assert.equal(stringOrDefault('', 'fb', 'path'), 'fb')
  assert.equal(stringOrDefault('a', 'fb', 'path'), 'a')
  assert.throws(() => stringOrDefault(undefined, '', 'path'), /path required/)
})

test('persist: corrupt json throws; atomic write replaces', () => {
  const dir = makeTempDir('dsh-ssh-persist')
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
        skip('symlink unavailable on this host/filesystem')
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

test('clampMaxBytes bounds and fallback', () => {
  assert.equal(clampMaxBytes(undefined, 262_144), 262_144)
  assert.equal(clampMaxBytes(0, 262_144), 262_144)
  assert.equal(clampMaxBytes(10, 262_144), MAX_BYTES_MIN)
  assert.equal(clampMaxBytes(999_999_999, 262_144), MAX_BYTES_MAX)
})

test('sshError carries an API code; the status map covers every code', () => {
  const e = sshError('not_found', 'nope')
  assert.equal(e.code, 'not_found')
  assert.equal(e.message, 'nope')
  for (const c of ['bad_request', 'forbidden', 'not_found', 'conflict', 'gone', 'payload_too_large']) {
    assert.equal(typeof API_ERROR_STATUS[c], 'number', c)
  }
  assert.match(hostKeyPromptMessage(), /SSH Tunnel tab/)
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

test('closeSession on a missing session reports not_found', () => {
  const registry = makeRegistry()
  assert.throws(() => registry.closeSession('missing', '/workspace'), (e) => e.code === 'not_found')
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
 * Shell output buffer: seq cursors survive ring eviction.             *
 * ------------------------------------------------------------------ */

function makeBufferRegistry() {
  return createSessionRegistry({
    connectClient: async () => ({ on() {}, end() {}, exec() {} }),
    loadSecrets: () => ({ byHostId: {} }),
    getPrompt: () => undefined,
    getHostById: (id) => ({ id, name: 'x', host: '1.2.3.4', port: 22, username: 'root', authType: 'password' }),
    isHostAuthorized: () => true,
  })
}

async function makeBufferSession() {
  const registry = makeBufferRegistry()
  const host = { id: 'h-buf', name: 'x', host: '1.2.3.4', port: 22, username: 'root', authType: 'password' }
  const created = await registry.createLiveSession({
    host,
    projectPathKey: normalizeProjectKey('/workspace/DSH-plugin'),
    sftpEnabled: false,
  })
  assert.equal(created.ok, true)
  return { registry, rec: registry.get(created.session.session_id) }
}

test('shell buffer: seq cursor delivers only unseen output', async () => {
  const { rec } = await makeBufferSession()
  rec.pushOutput('hello')
  rec.pushOutput(' world')
  let r = rec.chunkFrom(0)
  assert.equal(r.chunk, 'hello world')
  assert.equal(r.since, 2)
  assert.equal(r.seq, 2)
  assert.equal(r.dropped, false)
  assert.equal(r.chunkTruncated, false)
  r = rec.chunkFrom(r.since)
  assert.equal(r.chunk, '')
  rec.pushOutput('!')
  r = rec.chunkFrom(2)
  assert.equal(r.chunk, '!')
  assert.equal(r.seq, 3)
  // A cursor is never pinned to the buffer tail: since advances with the seq.
  assert.equal(rec.chunkFrom(99).dropped, false)
})

test('shell buffer: eviction advances baseSeq and flags dropped', async () => {
  const { rec } = await makeBufferSession()
  const big = 'x'.repeat(64 * 1024)
  for (let i = 0; i < 12; i++) rec.pushOutput(big) // 768 KiB > 512 KiB ring
  const fresh = rec.chunkFrom(0) // reader never read anything
  assert.equal(fresh.dropped, true)
  assert.ok(fresh.baseSeq > 1, 'baseSeq advanced past seq 1')
  const current = rec.chunkFrom(fresh.seq)
  assert.equal(current.dropped, false)
  // Per-response cap: 8 retained 64 KiB chunks come back in bounded slices.
  assert.ok(Buffer.byteLength(fresh.chunk) <= 256 * 1024 + 64 * 1024)
  assert.equal(fresh.chunkTruncated, true)
})

test('shell buffer: single over-cap chunk is delivered whole and flagged', async () => {
  const { rec } = await makeBufferSession()
  rec.pushOutput('y'.repeat(300 * 1024))
  const r = rec.chunkFrom(0)
  assert.equal(r.chunk.length, 300 * 1024)
  assert.equal(r.chunkTruncated, true)
  assert.equal(r.dropped, false)
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

test('result gate: custom message replaces the default on denial', () => {
  assert.throws(
    () =>
      assertSessionStillAuthorized(
        { projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' },
        () => false,
        'custom denial text',
      ),
    /custom denial text/,
  )
})

test('result gate: absent predicate is fail-closed', () => {
  assert.throws(
    () =>
      assertSessionStillAuthorized({ projectPathKey: '/workspace/DSH-plugin', hostId: 'h-sg' }, undefined),
    /predicate required/,
  )
})

test('result gate: empty project binding is denied (fail-closed)', () => {
  assert.throws(
    () => assertSessionStillAuthorized({ projectPathKey: '', hostId: 'h-sg' }, () => false),
    /not authorized/,
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

/* ------------------------------------------------------------------ *
 * Remote exec settlement semantics, driven against a real (local,     *
 * in-process) ssh2.Server: exit-status, exit-signal, connection cut,   *
 * UTF-8 split across data events, max_bytes, and cwd composition.     *
 * ------------------------------------------------------------------ */

const HOST_KEY_PEM = (() => {
  // ssh2's key parser wants classic PEM formats; PKCS#1 RSA parses reliably.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return privateKey
})()

async function startSshServer(onExec) {
  const server = new SshServer({ hostKeys: [HOST_KEY_PEM] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'user' && ctx.password === 'pass') ctx.accept()
      else ctx.reject()
    })
    client.on('session', (accept) => {
      const session = accept()
      session.on('exec', (acceptExec, rejectExec, info) => onExec(client, acceptExec, info))
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server
}

async function makeLiveSession(server) {
  const port = server.address().port
  const registry = createSessionRegistry({
    connectClient: () =>
      new Promise((resolve, reject) => {
        const c = new Client()
        c.on('ready', () => resolve(c))
        c.on('error', reject)
        c.connect({ host: '127.0.0.1', port, username: 'user', password: 'pass', readyTimeout: 5000 })
      }),
    loadSecrets: () => ({ byHostId: {} }),
    getPrompt: () => undefined,
    getHostById: (id) => ({ id, name: 't', host: '127.0.0.1', port, username: 'user', authType: 'password' }),
    isHostAuthorized: () => true,
  })
  const host = { id: 'h-ssh', name: 't', host: '127.0.0.1', port, username: 'user', authType: 'password' }
  const created = await registry.createLiveSession({
    host,
    projectPathKey: normalizeProjectKey('/workspace/DSH-plugin'),
    sftpEnabled: false,
  })
  assert.equal(created.ok, true)
  const rec = registry.get(created.session.session_id)
  return { registry, rec }
}

async function stopServer(server, registry) {
  for (const s of registry.sessions.values()) {
    try { s.client?.end() } catch {}
  }
  await new Promise((resolve) => server.close(resolve))
}

// One server + one live session per test; `run` receives an exec() bound to
// the session record, mirroring registry.execOnSession.
async function execFixture(onServerExec, run) {
  const server = await startSshServer(onServerExec)
  const { registry, rec } = await makeLiveSession(server)
  try {
    await run((command, opts) => registry.execOnSession(rec, command, opts))
  } finally {
    await stopServer(server, registry)
  }
}

test('exec: normal exit settles with exitKnown code and both streams', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      stream.write('out-ok')
      stream.stderr.write('err-line')
      stream.exit(3)
      stream.end()
    },
    async (exec) => {
      const r = await exec('any')
      assert.equal(r.exitKnown, true)
      assert.equal(r.code, 3)
      assert.equal(r.signal, null)
      assert.equal(r.connectionDropped, false)
      assert.equal(r.truncated, false)
      assert.equal(r.stdout, 'out-ok')
      assert.equal(r.stderr, 'err-line')
    },
  )
})

test('exec: signal death reports the signal, not exit 0', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      stream.write('partial')
      stream.exit('KILL') // exit-signal, no exit-status
      stream.close()
    },
    async (exec) => {
      const r = await exec('any')
      assert.equal(r.exitKnown, false)
      assert.equal(r.code, null)
      assert.equal(r.signal, 'SIGKILL')
      assert.equal(r.connectionDropped, false)
    },
  )
})

test('exec: connection cut reports connectionDropped, not exit 0', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      stream.write('half')
      setImmediate(() => {
        try { client.end() } catch {}
      })
    },
    async (exec) => {
      const r = await exec('any')
      assert.equal(r.exitKnown, false)
      assert.equal(r.code, null)
      assert.equal(r.signal, null)
      assert.equal(r.connectionDropped, true)
    },
  )
})

test('exec: command not found settles as exit 127', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      stream.stderr.write('command not found')
      stream.exit(127)
      stream.end()
    },
    async (exec) => {
      const r = await exec('nope')
      assert.equal(r.exitKnown, true)
      assert.equal(r.code, 127)
      assert.equal(r.stderr, 'command not found')
    },
  )
})

test('exec: UTF-8 split across data events survives (no U+FFFD)', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      const buf = Buffer.from('中文测试', 'utf8')
      stream.write(buf.subarray(0, 5))
      stream.write(buf.subarray(5))
      stream.exit(0)
      stream.end()
    },
    async (exec) => {
      const r = await exec('any')
      assert.equal(r.exitKnown, true)
      assert.equal(r.code, 0)
      assert.equal(r.stdout, '中文测试')
      assert.ok(!r.stdout.includes('\uFFFD'), 'no replacement characters')
    },
  )
})

test('exec: max_bytes truncates by byte and flags truncated', async () => {
  await execFixture(
    (client, accept) => {
      const stream = accept()
      stream.write('a'.repeat(5000))
      stream.exit(0)
      stream.end()
    },
    async (exec) => {
      const r = await exec('any', { maxBytes: 1024 })
      assert.equal(r.truncated, true)
      assert.equal(Buffer.byteLength(r.stdout), 1024)
      // Sub-floor values clamp to 1 KiB instead of trusting 10.
      const r2 = await exec('any', { maxBytes: 10 })
      assert.equal(Buffer.byteLength(r2.stdout), 1024)
    },
  )
})

test('exec: cwd is single-quote escaped and echoed; relative cwd rejects', async () => {
  const seen = []
  await execFixture(
    (client, accept, info) => {
      seen.push(info.command)
      const stream = accept()
      stream.exit(0)
      stream.end()
    },
    async (exec) => {
      await exec('echo hi', { cwd: "/tmp/it's" })
      assert.equal(seen[0], "cd -- '/tmp/it'\\''s' && echo hi")
      const r = await exec('echo hi', { cwd: '/tmp/plain' })
      assert.equal(seen[1], "cd -- '/tmp/plain' && echo hi")
      assert.equal(r.cwd, '/tmp/plain')
      await assert.rejects(
        () => exec('echo hi', { cwd: 'relative/path' }),
        /absolute POSIX path/,
      )
      assert.equal(seen.length, 2, 'relative cwd never dialed the remote')
    },
  )
})

await Promise.all(pending)
for (const d of tempDirs) {
  try { rmSync(d, { recursive: true, force: true }) } catch {}
}
console.log(`\n${passed} passed, ${skipped} skipped, ${failed} failed`)
if (failed) {
  process.exit(1)
}
console.log('all passed')
