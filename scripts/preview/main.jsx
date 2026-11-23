/**
 * README 预览入口：加载 lib/client.js 的正式面板组件。
 * 只有宿主 HTTP API 由 docs/preview/fixture.json 应答；组件、样式与交互均来自真实客户端产物。
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as ReactDOM from 'react-dom'
import fixture from '../../docs/preview/fixture.json'

const slotComponents = {}
let pluginDefinition = null

// lib/client.js 以 __ModuleLoader__.load 注册模块；这里接住它，稍后用同一个 React 实例执行。
window.__ModuleLoader__ = {
  load(definition) {
    pluginDefinition = definition
  },
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// 只替换传输层：面板仍按正式 API 契约取数，只读路由之外一律拒绝。
const join = (dir, name) => (dir.endsWith('/') ? dir : dir + '/') + name
const withPath = (dir, list) => list.map((entry) => ({ ...entry, path: join(dir, entry.name) }))
const routes = {
  getProjectContext: () => ({ ok: true, sessionId: fixture.sessionId, projectPathKey: fixture.projectPathKey }),
  listHosts: () => ({ ok: true, hosts: fixture.hosts }),
  getGrants: () => ({ ok: true, hostIds: fixture.granted }),
  listSessions: () => ({ ok: true, sessions: fixture.sessions }),
  listPrompts: () => ({ ok: true, prompts: [] }),
  localList: () => ({ ok: true, path: fixture.localPath, entries: withPath(fixture.localPath, fixture.local) }),
  sftpList: () => ({ ok: true, path: fixture.remotePath, entries: withPath(fixture.remotePath, fixture.remote) }),
}
window.fetch = async (input) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const route = new URL(raw, window.location.href).pathname.replace(/^.*\/dsh-ssh-tunnel\/api\//, '')
  const handler = routes[route]
  return handler ? json(handler()) : json({ ok: false, error: `预览为只读模式：${route}` }, 405)
}

const params = new URLSearchParams(window.location.hash.slice(1))
const theme = params.get('theme') === 'light' ? 'light' : 'dark'
document.body.dataset.dshTheme = theme

function HostGlyph({ children }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

// DSH dockkit 标签页结构；标签标题复用插件自己注册的标题组件。
function HostTabStrip({ Title }) {
  return (
    <div className="dsh-preview-tabStrip">
      <div className="dsh-preview-stripTabs">
        <div className="dsh-preview-tab dsh-preview-tabActive">
          <div className="dsh-preview-tabTitle">{Title ? <Title /> : null}</div>
          <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="关闭标签页"><HostGlyph><path d="m4 4 8 8M12 4l-8 8" /></HostGlyph></button>
        </div>
      </div>
      <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="新建标签页"><HostGlyph><path d="M8 3v10M3 8h10" /></HostGlyph></button>
      <div className="dsh-preview-stripFill" />
      <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="拆分面板"><HostGlyph><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M8 3v10" /></HostGlyph></button>
      <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="展开面板"><HostGlyph><path d="M6 3H3v3M10 3h3v3M3 10v3h3M13 10v3h-3" /></HostGlyph></button>
    </div>
  )
}

const hostTheme = document.createElement('style')
hostTheme.textContent = `
  body[data-dsh-theme='light'] {
    color-scheme: light;
    --dsw-alias-bg-base: #fff;
    --dsw-alias-bg-layer-1: #fff;
    --dsw-alias-bg-layer-2: #fff;
    --dsw-alias-label-primary: rgb(15,17,21);
    --dsw-alias-label-secondary: rgb(97,102,107);
    --dsw-alias-label-primary-inverted: #fff;
    --dsw-alias-border-l1: rgba(0,0,0,.06);
    --dsw-alias-border-l2: rgba(0,0,0,.12);
    --dsw-alias-border-l4: rgba(0,0,0,.32);
    --dsw-alias-interactive-bg-hover: rgba(38,49,72,.06);
    --dsw-alias-button-primary-fill: rgb(15,17,21);
    --dsw-alias-button-primary-hover: rgb(40,43,48);
    --dsw-alias-brand-primary: #4d6bfe;
    --dsw-alias-state-success-primary: #15803d;
    --dsw-alias-state-warn-primary: #b45309;
    --dsw-alias-state-error-primary: #dc2626;
    --dsw-alias-markdown-tag: rgb(241,243,245);
  }
  body[data-dsh-theme='dark'] {
    color-scheme: dark;
    --dsw-alias-bg-base: rgb(21,21,23);
    --dsw-alias-bg-layer-1: rgb(35,35,36);
    --dsw-alias-bg-layer-2: rgb(44,44,46);
    --dsw-alias-label-primary: rgb(249,250,251);
    --dsw-alias-label-secondary: rgb(207,211,214);
    --dsw-alias-label-primary-inverted: rgb(15,17,21);
    --dsw-alias-border-l1: rgba(255,255,255,.06);
    --dsw-alias-border-l2: rgba(255,255,255,.12);
    --dsw-alias-border-l4: rgba(255,255,255,.32);
    --dsw-alias-interactive-bg-hover: rgba(255,255,255,.08);
    --dsw-alias-button-primary-fill: rgb(249,250,251);
    --dsw-alias-button-primary-hover: rgb(226,228,231);
    --dsw-alias-brand-primary: #6b84ff;
    --dsw-alias-state-success-primary: #4ade80;
    --dsw-alias-state-warn-primary: #fbbf24;
    --dsw-alias-state-error-primary: #f87171;
    --dsw-alias-markdown-tag: rgb(44,44,46);
  }
  html, body, #root { width: 100%; margin: 0; }
  body {
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  button, input, textarea { font-family: inherit; }
  .dsh-preview-shell { display: flex; flex-direction: column; width: 100%; }
  .dsh-preview-panel { height: var(--preview-panel-height, 640px); }
  .dsh-preview-tabStrip {
    display: flex; flex: none; align-items: center; gap: 4px;
    height: 38px; padding: 10px 6px 0 10px; box-sizing: border-box;
    background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
    font-size: 13px; line-height: 1.45; user-select: none;
  }
  .dsh-preview-stripTabs { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .dsh-preview-tab {
    display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
    border-radius: 8px 8px 0 0;
  }
  .dsh-preview-tabActive { background: var(--dsw-alias-markdown-tag); color: var(--dsw-alias-label-primary); }
  .dsh-preview-tabTitle { display: flex; align-items: center; white-space: nowrap; }
  .dsh-preview-stripFill { flex: 1; min-width: 8px; }
  .dsh-preview-iconButton {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: var(--dsw-alias-label-secondary); cursor: default;
  }
`
document.head.appendChild(hostTheme)

function start() {
  if (!pluginDefinition) throw new Error('lib/client.js 未注册模块')
  const pluginModule = pluginDefinition.factory((name) => {
    if (name === 'react') return React
    if (name === 'react-dom') return ReactDOM
    throw new Error(`预览环境没有模块 ${name}`)
  })
  const disposers = []
  const ctx = {
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(_names, callback) {
      const services = { sidebarRightTabs: { register: () => () => {} }, sidebarRight: {} }
      callback({ get: (key) => services[key] })
    },
    slots: {
      inject(_name, callback) {
        callback()
        return () => {}
      },
      register({ name }, component) {
        slotComponents[name] = component
        return () => {}
      },
    },
  }
  pluginModule.apply(ctx)
  const Body = slotComponents['sidebar.right.pane.tab']
  const Title = slotComponents['sidebar.right.pane.tab.title']
  if (!Body) throw new Error('面板正文没有注册到 sidebar.right.pane.tab')
  createRoot(document.getElementById('root')).render(
    <div className="dsh-preview-shell">
      <HostTabStrip Title={Title} />
      <div className="dsh-preview-panel">
        <Body sessionId={fixture.sessionId} useTabInfo={() => ({ tab: { visible: true } })} />
      </div>
    </div>,
  )
  const deadline = Date.now() + 10000
  const timer = setInterval(() => {
    const ready = document.querySelector('.ssh-t-check')
    if (ready || Date.now() > deadline) {
      clearInterval(timer)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.documentElement.dataset.previewReady = ready ? 'true' : 'timeout'
      }))
    }
  }, 40)
}

window.__startPreview = start
