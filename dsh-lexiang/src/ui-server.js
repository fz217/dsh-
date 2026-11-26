/**
 * Optional dsh webServer integration for dsh-lexiang.
 *
 * dsh hosts may or may not provide a `webServer` service. We attach through
 * ctx.inject so the plugin still loads in a headless composition (e.g. tui).
 * Routes are namespaced under /api/dsh-lexiang and never expose the token.
 */

import { buildConsoleHtml, normalizeItems } from './ui.js'
import * as ops from './operations.js'

const PREVIEW_LIMIT = 512 * 1024
const entryId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const isMarkdown = row => /^(?:\.?md|\.?markdown)$/i.test(row.extension || '') || /\.(?:md|markdown)$/i.test((row.name || '').trim())

async function downloadMarkdown(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.host !== 'file.lexiang-asset.com' || url.username || url.password) throw new Error('Unexpected Lexiang file host')
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new Error('Unable to download Markdown')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { value: bytes, done } = await reader.read()
      if (done) return { markdown: chunks.join('') + decoder.decode(), truncated: false }
      const remaining = PREVIEW_LIMIT - size
      if (bytes.byteLength > remaining) {
        chunks.push(decoder.decode(bytes.subarray(0, remaining), { stream: true }))
        return { markdown: chunks.join(''), truncated: true }
      }
      size += bytes.byteLength
      chunks.push(decoder.decode(bytes, { stream: true }))
    }
  } finally { await reader.cancel().catch(() => {}) }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

async function readConfigView(readConfig) {
  const c = await readConfig() || {}
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
          return send(res, 200, { ok: true, ...await readConfigView(readConfig), ui: state.available })
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

        if (req.method === 'GET' && ['/personal', '/teams', '/spaces', '/entries', '/preview'].includes(route)) {
          // These routes use the desktop owner's Lexiang credential. Do not serve them to remote or cross-site callers.
          const local = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket?.remoteAddress || '')
          const host = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(req.headers.host || '')
          const site = req.headers['sec-fetch-site']
          if (!local || !host || (site && site !== 'same-origin' && site !== 'none')) return send(res, 403, { ok: false })
          const parent = url.searchParams.get('id') || ''
          const cursor = url.searchParams.get('cursor') || ''
          if ((['/spaces', '/entries'].includes(route) && !/^[a-zA-Z0-9_-]{1,128}$/.test(parent)) || cursor.length > 2048) return send(res, 400, { ok: false })
          const call = async (name, args) => {
            const result = await (await getClient()).callTool(name === 'whoami' ? name : 'call_tool', name === 'whoami' ? {} : { tool_name: name, arguments: args })
            if (!result || (result.code != null && Number(result.code) !== 0)) throw new Error('Lexiang directory request failed')
            return result.data ?? result
          }
          if (route === '/preview') {
            if (!entryId(parent)) return send(res, 400, { ok: false })
            try {
              const { entry } = await call('entry_describe_entry', { entry_id: parent })
              if (!entry) return send(res, 404, { ok: false })
              if (entry.entry_type === 'page') {
                const result = await call('block_fetch_page', { entry_id: parent, render_mode: 'clean' })
                const text = typeof result === 'string' ? result : result.text ?? (Array.isArray(result.content) ? result.content.filter(item => item.type === 'text').map(item => item.text).join('\n') : undefined)
                if (typeof text !== 'string') throw new Error('Unexpected Lexiang page response')
                return send(res, 200, { ok: true, markdown: text.slice(0, PREVIEW_LIMIT), truncated: text.length > PREVIEW_LIMIT })
              }
              if (entry.entry_type !== 'file' || !isMarkdown(entry) || !entryId(entry.target_id)) return send(res, 415, { ok: false })
              const { url: signedUrl } = await call('file_download_file', { file_id: entry.target_id, expire_seconds: 120 })
              return send(res, 200, { ok: true, ...await downloadMarkdown(signedUrl) })
            } catch {
              // Do not return upstream details: errors can contain temporary download URLs.
              return send(res, 502, { ok: false, error: 'Markdown preview unavailable' })
            }
          }
          const space = row => ({ id: row.root_entry_id, name: row.name })
          if (route === '/personal') {
            const data = await call('whoami')
            return send(res, 200, { ok: true, personal: data.personal_space?.root_entry_id ? space(data.personal_space) : null })
          }
          const spec = {
            '/teams': ['team_list_teams', 'teams', {}],
            '/spaces': ['space_list_spaces', 'spaces', { team_id: parent }],
            '/entries': ['entry_list_children', 'entries', { parent_id: parent }],
          }[route]
          const data = await call(spec[0], { ...spec[2], limit: 40, ...(cursor ? { page_token: cursor } : {}) })
          const list = data[spec[1]] ?? [] // Lexiang omits the repeated field on an empty page.
          if (!Array.isArray(list)) throw new Error('Unexpected Lexiang directory response')
          const rows = list.map(row => route === '/spaces' ? space(row) : route === '/teams' ? { id: row.id, name: row.name } : {
            id: row.id, name: row.name, folder: row.entry_type === 'folder', children: Boolean(row.has_children), edited: row.edited_at,
            preview: row.entry_type === 'page' || (row.entry_type === 'file' && isMarkdown(row)),
          }).filter(row => /^[a-zA-Z0-9_-]{1,128}$/.test(row.id || '') && typeof row.name === 'string')
          const next = rows.length && data.next_page_token !== cursor ? data.next_page_token || '' : ''
          return send(res, 200, { ok: true, rows, next })
        }

        if (req.method === 'GET' && route === '/search') {
          const q = url.searchParams.get('q') || ''
          if (!q) return send(res, 400, { ok: false, error: '缺少 q 参数' })
          const result = await ops.search(await getClient(), { query: q, mode: 'semantic' })
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
            version: '1.2.1',
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
    state.routes = ['/ui', '/status', '/popup', '/search', '/manifest', '/personal', '/teams', '/spaces', '/entries', '/preview']
    scoped.effect(() => () => {
      state.available = false
      dispose?.()
    }, 'dsh-lexiang: ui dispose')
  })

  return state
}
