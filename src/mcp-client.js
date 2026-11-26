/**
 * Minimal MCP Streamable-HTTP client for Lexiang.
 * No third-party deps — Node 22 global fetch only.
 *
 * Auth: Authorization: Bearer <LEXIANG_TOKEN>
 * Endpoint: https://mcp.lexiang-app.com/mcp?company_from=<COMPANY_FROM>
 *
 * Protocol: JSON-RPC 2.0 over POST. Responses may be application/json or
 * text/event-stream (SSE). We accept both and pick the matching id.
 */

const DEFAULT_ENDPOINT = 'https://mcp.lexiang-app.com/mcp'
const PROTOCOL_VERSION = '2025-03-26'

export class LexiangMcpError extends Error {
  constructor(message, code, data) {
    super(message)
    this.name = 'LexiangMcpError'
    this.code = code
    this.data = data
  }
}

export function readConfig(env = process.env) {
  const token = (env.LEXIANG_TOKEN || '').trim()
  const companyFrom = (env.COMPANY_FROM || '').trim()
  const endpoint = (env.LEXIANG_MCP_URL || DEFAULT_ENDPOINT).trim()
  const timeoutMs = Number(env.LEXIANG_TIMEOUT_MS || 30000)
  return { token, companyFrom, endpoint, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000 }
}

export class LexiangMcpClient {
  constructor(config, logger = console) {
    this.config = config
    this.logger = logger
    this._id = 0
    this._sessionId = ''
    this._initialized = false
  }

  get url() {
    const { endpoint, companyFrom } = this.config
    if (!companyFrom) return endpoint
    const u = new URL(endpoint)
    u.searchParams.set('company_from', companyFrom)
    return u.toString()
  }

  _headers() {
    const h = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }
    if (this.config.token) h.authorization = `Bearer ${this.config.token}`
    if (this._sessionId) h['mcp-session-id'] = this._sessionId
    return h
  }

  _nextId() { return ++this._id }

  async _post(payload, { expectResponse = true } = {}) {
    const { timeoutMs } = this.config
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (err.name === 'AbortError') throw new LexiangMcpError(`乐享请求超时（${timeoutMs}ms）`, 'TIMEOUT')
      throw new LexiangMcpError(`乐享连接失败：${err.message}`, 'NETWORK')
    } finally {
      clearTimeout(timer)
    }

    const sid = res.headers.get('mcp-session-id')
    if (sid) this._sessionId = sid

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 800)
      if (res.status === 401) {
        throw new LexiangMcpError(
          '乐享令牌无效或已过期。请打开 https://lexiangla.com/mcp 续期后重试。',
          401, text,
        )
      }
      throw new LexiangMcpError(`乐享 HTTP ${res.status}：${text}`, res.status, text)
    }

    if (!expectResponse || res.status === 202 || res.status === 204) return null

    const ctype = res.headers.get('content-type') || ''
    const raw = await res.text()
    let body
    if (ctype.includes('text/event-stream') || raw.startsWith('event:') || raw.startsWith('data:')) {
      body = parseSse(raw, payload.id)
    } else {
      try { body = JSON.parse(raw) } catch { throw new LexiangMcpError('乐享返回非 JSON 响应', 'PARSE', raw.slice(0, 500)) }
    }
    if (body?.error) {
      throw new LexiangMcpError(body.error.message || '乐享 RPC 错误', body.error.code, body.error.data)
    }
    return body?.result
  }

  async initialize() {
    if (this._initialized) return
    const result = await this._post({
      jsonrpc: '2.0', id: this._nextId(), method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'dsh-lexiang', version: '1.0.0' },
      },
    })
    this._initialized = true
    // notifications/initialized is a one-way notification (no id, no response)
    await this._notify('notifications/initialized', {})
    return result
  }

  async _notify(method, params) {
    await this._post({ jsonrpc: '2.0', method, params }, { expectResponse: false }).catch(() => {})
  }

  async listTools() {
    await this.initialize()
    const r = await this._post({ jsonrpc: '2.0', id: this._nextId(), method: 'tools/list', params: {} })
    return r?.tools || []
  }

  /**
   * Call a Lexiang MCP business tool.
   * @param {string} name tool name, e.g. call_tool / lexiang_search / entry_create_entry
   * @param {object} args tool arguments
   */
  async callTool(name, args = {}) {
    await this.initialize()
    const r = await this._post({
      jsonrpc: '2.0', id: this._nextId(), method: 'tools/call',
      params: { name, arguments: args },
    })
    return unwrapToolResult(r)
  }
}

function parseSse(raw, id) {
  const chunks = raw.split(/\r?\n\r?\n/)
  let chosen = null
  let firstResult = null
  for (const chunk of chunks) {
    const line = chunk.split(/\r?\n/).find(l => l.startsWith('data:'))
    if (!line) continue
    let data
    try { data = JSON.parse(line.slice(5).trim()) } catch { continue }
    if (data.result != null || data.error != null) {
      if (!firstResult) firstResult = data
      if (data.id === id) { chosen = data; break }
    }
  }
  return chosen || firstResult
}

function unwrapToolResult(r) {
  if (!r) return null
  if (r.isError) {
    const txt = contentText(r.content)
    throw new LexiangMcpError(`乐享工具执行失败：${txt}`, 'TOOL_ERROR', r.content)
  }
  const txt = contentText(r.content)
  if (txt) {
    try { return JSON.parse(txt) } catch { return { text: txt } }
  }
  return r.structuredContent ?? r
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(c => c?.type === 'text').map(c => c.text).join('\n')
}
