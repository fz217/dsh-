/**
 * Optional dsh webServer integration for dsh-lexiang.
 *
 * dsh hosts may or may not provide a `webServer` service. We attach through
 * ctx.inject so the plugin still loads in a headless composition (e.g. tui).
 * Routes are namespaced under /api/dsh-lexiang and never expose the token.
 */

import { buildConsoleHtml, normalizeItems } from './ui.js'
import * as ops from './operations.js'

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

function readConfigView(readConfig) {
  const c = readConfig({}) || {}
  return {
    ok: Boolean(c.token && c.companyFrom),
    endpoint: c.endpoint,
    company_from: c.companyFrom ? `${String(c.companyFrom).slice(0, 2)}***` : '',
    token_masked: c.token ? `${String(c.token).slice(0, 6)}***${String(c.token).slice(-4)}` : '',
    timeout_ms: c.timeoutMs,
  }
}

/**
 * Register UI routes when webServer becomes available.
 * Returns a live state object so tools can report whether the console is on.
 */
export function registerUI(ctx, { getClient, readConfig }) {
  const state = {
    available: false,
    basePath: '/api/dsh-lexiang',
    consoleUrl: '/api/dsh-lexiang/ui',
    routes: [],
    reason: '',
  }

  if (typeof ctx?.inject !== 'function') {
    state.reason = 'host has no ctx.inject'
    return state
  }

  ctx.inject(['webServer'], scoped => {
    const server = scoped?.webServer
    if (!server || typeof server.register !== 'function') {
      state.reason = 'webServer service unavailable'
      return
    }

    const handler = async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const route = url.pathname.replace(/^\/api\/dsh-lexiang/, '').replace(/\/+$/, '') || '/'

        if (req.method === 'GET' && route === '/ui') {
          return send(res, 200, buildConsoleHtml(), 'text/html; charset=utf-8')
        }

        if (req.method === 'GET' && route === '/status') {
          return send(res, 200, { ok: true, ...readConfigView(readConfig), ui: state.available })
        }

        if (req.method === 'GET' && route === '/popup') {
          const { buildPopupHtml } = await import('./ui.js')
          const q = url.searchParams.get('q') || ''
          const title = url.searchParams.get('title') || '乐享知识库'
          return send(res, 200, buildPopupHtml({
            title,
            subtitle: q ? `检索：${q}` : '由 dsh-lexiang 生成',
            content: q ? '在控制台中查看检索结果。' : '',
          }), 'text/html; charset=utf-8')
        }

        if (req.method === 'GET' && route === '/search') {
          const q = url.searchParams.get('q') || ''
          if (!q) return send(res, 400, { ok: false, error: '缺少 q 参数' })
          const result = await ops.search(getClient(), { query: q, mode: 'semantic' })
          return send(res, 200, {
            ok: true,
            query: q,
            items: normalizeItems(result.results),
            raw: result.results,
          })
        }

        if (req.method === 'GET' && route === '/manifest') {
          return send(res, 200, {
            name: 'dsh-lexiang',
            version: '1.1.0',
            routes: state.routes,
            note: 'token never exposed to browser',
          })
        }

        return send(res, 404, { ok: false, error: `unknown route ${route}` })
      } catch (err) {
        return send(res, 500, {
          ok: false,
          error: err?.message || String(err),
          code: err?.code || 'UI_ERROR',
        })
      }
    }

    const dispose = scoped.effect(() => server.register({
      kind: 'prefix',
      path: '/api/dsh-lexiang',
      handler,
    }), 'dsh-lexiang: ui routes')

    state.available = true
    state.reason = ''
    state.routes = ['/ui', '/status', '/popup', '/search', '/manifest']
    scoped.effect(() => () => {
      state.available = false
      dispose?.()
    }, 'dsh-lexiang: ui dispose')
  })

  return state
}
