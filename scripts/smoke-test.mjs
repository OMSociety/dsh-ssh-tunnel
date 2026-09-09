#!/usr/bin/env node
/**
 * Offline smoke tests (no SSH, no DSH process).
 * Run: node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict'
import { normalizeProjectKey, isPathInsideRoots, joinUnderRoot } from '../lib/shared/path.js'
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
} from '../lib/shared/session-policy.js'
import { createSessionRegistry } from '../lib/session.js'

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
  assert.equal(normalizeProjectKey('/workspace/DSH-plugin/'), '/workspace/DSH-plugin')
})

test('normalizeProjectKey empty', () => {
  assert.equal(normalizeProjectKey(''), '')
  assert.equal(normalizeProjectKey(null), '')
})

test('isPathInsideRoots allows children only', () => {
  assert.equal(isPathInsideRoots('/workspace/DSH-plugin/a', ['/workspace/DSH-plugin']), true)
  assert.equal(isPathInsideRoots('/workspace/other', ['/workspace/DSH-plugin']), false)
  assert.equal(isPathInsideRoots('/workspace/DSH-plugin', ['/workspace/DSH-plugin']), true)
})

test('joinUnderRoot rejects escape', () => {
  assert.throws(() => joinUnderRoot('/workspace/DSH-plugin', '../../etc/passwd'))
  const ok = joinUnderRoot('/workspace/DSH-plugin', 'sub/file.txt')
  assert.ok(ok.endsWith('/workspace/DSH-plugin/sub/file.txt') || ok.includes('DSH-plugin/sub/file.txt'))
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

test('interactive credential status', () => {
  const host = { id: 'h2', authType: 'keyboardInteractive', host: 'x', username: 'u' }
  const pub = publicHost(host, { byHostId: {} })
  assert.equal(pub.credentialStatus, 'interactive')
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
  const key = '/workspace/DSH-plugin'
  registry.sessions.set('s1', liveRec('s1', 'h-sg', key))
  // Shell / SFTP operations all go through requireLiveSession; a revoked host
  // must not be usable even though the session object is still live.
  assert.throws(() => registry.requireLiveSession('s1', key), /not authorized/)
})

test('granted host: requireLiveSession still allows use', () => {
  const registry = makeRegistry({ isHostAuthorized: () => true })
  const key = '/workspace/DSH-plugin'
  registry.sessions.set('s1', liveRec('s1', 'h-sg', key))
  assert.equal(registry.requireLiveSession('s1', key).id, 's1')
})

test('revoked host: reconnect refuses to resurrect the session', async () => {
  const registry = makeRegistry({ isHostAuthorized: () => false })
  const key = '/workspace/DSH-plugin'
  const rec = liveRec('s1', 'h-sg', key)
  rec.status = SSH_STATUS_DISCONNECTED
  rec.running = false
  registry.sessions.set('s1', rec)
  await assert.rejects(() => registry.reconnectSession('s1', { manual: true }), /not authorized/)
})

test('closeSessionsForHost terminates only the revoked host sessions in the project', () => {
  const registry = makeRegistry()
  const keyA = '/workspace/DSH-plugin'
  const keyB = '/workspace/other'
  registry.sessions.set('a1', liveRec('a1', 'h-sg', keyA)) // revoked host, this project
  registry.sessions.set('b1', liveRec('b1', 'h2', keyA)) // other host, same project
  registry.sessions.set('c1', liveRec('c1', 'h-sg', keyB)) // same host, other project
  const out = registry.closeSessionsForHost(keyA, 'h-sg')
  assert.equal(out.closed, 1)
  assert.equal(registry.sessions.has('a1'), false)
  assert.equal(registry.sessions.has('b1'), true)
  assert.equal(registry.sessions.has('c1'), true)
})

await Promise.all(pending)
if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall passed')
