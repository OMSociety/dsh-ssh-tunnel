/**
 * 构建 README 预览图：把 lib/client.js 的正式面板连同 docs/preview/fixture.json 打成自包含页面，
 * 再用本机 Chrome 截取 docs/panel-sidebar.png 与 docs/panel-sftp.png。
 */
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = path.join(ROOT, 'scripts', 'preview', 'main.jsx')
const CLIENT = path.join(ROOT, 'lib', 'client.js')
const OUT = path.join(ROOT, 'docs', 'preview', 'panel.html')
const WIDTH = 480
const DEVICE_SCALE_FACTOR = 2
const SHOTS = [
  { file: 'panel-sidebar.png', kind: 'sidebar' },
  { file: 'panel-sftp.png', kind: 'sftp' },
]

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === 'win32' && path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform === 'linux' && '/usr/bin/google-chrome',
  ].filter(Boolean)
  const executable = candidates.find((candidate) => fs.existsSync(candidate))
  if (!executable) throw new Error('找不到本机 Google Chrome；可通过 CHROME_PATH 指定可执行文件')
  return executable
}

async function buildPage() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    charset: 'utf8',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const escape = (source) => source.replace(/<\/script/gi, '<\\/script')
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DSH SSH Tunnel · 侧栏预览</title>
</head>
<body>
  <div id="root"></div>
  <script>${escape(result.outputFiles[0].text)}</script>
  <script>${escape(fs.readFileSync(CLIENT, 'utf8'))}</script>
  <script>window.__startPreview()</script>
</body>
</html>
`
  // 预览页只允许出现虚构数据：出现盘符路径或本机用户名即视为泄露，直接失败。
  const leak = html.match(/[A-Za-z]:\\[A-Za-z0-9_]|Administrator/)
  if (leak) throw new Error(`预览页含疑似本机信息：${leak[0]}`)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, html, 'utf8')
  console.log(`[build-preview] lib/client.js → docs/preview/panel.html（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`)
}

function assertPng(file) {
  const png = fs.readFileSync(file)
  if (png.length < 24 || png.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} 不是有效 PNG`)
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length }
}

async function captureScreenshots() {
  const browser = await chromium.launch({ executablePath: chromeExecutable(), headless: true, args: ['--disable-dev-shm-usage'] })
  const pageErrors = []
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({
        viewport: { width: WIDTH, height: 900 },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        colorScheme: 'dark',
        locale: 'zh-CN',
      })
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(`${pathToFileURL(OUT).href}#theme=dark`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.documentElement.dataset.previewReady === 'true', null, { timeout: 15000 })
      await page.getByRole('button', { name: '隧道会话', exact: true }).click()
      await page.waitForSelector('.ssh-t-row')
      if (shot.kind === 'sidebar') {
        // 面板高度贴合内容：先让面板按内容自适应，量出整页高度，再按该高度截图。
        const height = await page.evaluate(() => {
          document.documentElement.style.setProperty('--preview-panel-height', 'auto')
          document.querySelector('.ssh-t-root').style.height = 'auto'
          return Math.ceil(document.querySelector('.dsh-preview-shell').getBoundingClientRect().height)
        })
        await page.setViewportSize({ width: WIDTH, height })
      } else {
        // 中央面板：点开第一条会话的 SFTP 双栏覆盖层，只截覆盖层。
        await page.setViewportSize({ width: 1040, height: 520 })
        await page.getByRole('button', { name: 'SFTP', exact: true }).first().click()
        await page.waitForSelector('.ssh-ov-root .ssh-sftp-item')
        await page.evaluate(() => { document.getElementById('root').style.visibility = 'hidden' })
      }
      await page.waitForTimeout(150)
      const target = path.join(ROOT, 'docs', shot.file)
      await page.screenshot({ path: target, fullPage: false })
      await page.close()
      const { width, height: pixelHeight, bytes } = assertPng(target)
      console.log(`[build-preview] docs/${shot.file} ${width}x${pixelHeight}（${(bytes / 1024).toFixed(1)} KB）`)
    }
    if (pageErrors.length) throw new Error(`预览页面脚本错误：${pageErrors.join('；')}`)
  } finally {
    await browser.close()
  }
}

await buildPage()
await captureScreenshots()
