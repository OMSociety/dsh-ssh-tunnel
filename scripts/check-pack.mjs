#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Compare declarations with npm's member list, not with the source checkout.
function inspect(pkg, members) {
  const problems = []
  const paths = new Set(members.map(p => p.replaceAll('\\', '/')))
  function need(entry, source, directory = false) {
    if (typeof entry !== 'string' || !entry) {
      problems.push(`${source}: missing path`)
      return
    }
    const path = entry.replace(/^\.\//, '').replace(/\/$/, '')
    const pattern = path.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
    const match = new RegExp(`^${pattern}$`)
    if (![...paths].some(p => match.test(p) || (directory && p.startsWith(path + '/')))) {
      problems.push(`${source}: missing ${path}`)
    }
  }
  function checkExport(target) {
    if (typeof target === 'string') need(target, 'exports')
    else if (target && typeof target === 'object') Object.values(target).forEach(checkExport)
  }
  need(pkg.main, 'main')
  need(pkg.icon, 'icon')
  need(pkg.dsh?.bundle?.patch, 'dsh.bundle.patch')
  for (const file of ['package.json', 'locale/en.json', 'locale/zh.json']) need(file, 'bundle')
  checkExport(pkg.exports)
  for (const entry of pkg.files ?? []) {
    if (!entry.startsWith('!')) need(entry, 'files', true)
  }
  for (const p of paths) {
    if (/(?:^|\/)(?:node_modules|\.git)\//.test(p)) problems.push(`unexpected member: ${p}`)
  }
  return problems
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const result = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf8' }))
const [pack] = Object.values(result)
const members = pack.files.map(f => f.path)
const problems = inspect(pkg, members)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`[check-pack] ${pkg.name}@${pkg.version}: ${members.length} members verified`)

if (process.argv.includes('--self-test')) {
  // Exercise each failure independently against the same real pack list.
  const ghost = 'missing-pack-fixture.js'
  const cases = [
    [{ ...pkg, exports: { ...pkg.exports, './fixture': `./${ghost}` } }, members, `exports: missing ${ghost}`],
    [{ ...pkg, files: [...pkg.files, ghost] }, members, `files: missing ${ghost}`],
    [{ ...pkg, files: [...pkg.files, 'fixtures/*.js'] }, members, 'files: missing fixtures/*.js'],
    [pkg, members.filter(p => p !== 'locale/zh.json'), 'bundle: missing locale/zh.json'],
    [pkg, members.filter(p => p !== 'lib/client.js'), 'exports: missing lib/client.js'],
  ]
  for (const [manifest, archive, expected] of cases) {
    assert.ok(inspect(manifest, archive).includes(expected), expected)
  }
  console.log(`[check-pack] ${cases.length} missing-member fixtures rejected`)
}
