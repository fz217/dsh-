/**
 * Self-test: spins up a local mock MCP server and runs the full protocol
 * chain (initialize → tools/list → tools/call → SSE/JSON response).
 * No real Lexiang token needed.
 *
 * Run: node selftest.mjs
 */

import http from 'node:http'
import { LexiangMcpClient, readConfig } from './src/mcp-client.js'
import * as ops from './src/operations.js'

const calls = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    const msg = JSON.parse(body || '{}')
    calls.push(msg)
    res.setHeader('content-type', 'application/json')
    res.setHeader('mcp-session-id', 'test-session-001')

    if (msg.method === 'initialize') {
      return res.end(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock-lexiang', version: '1.0' } },
      }))
    }
    if (msg.method === 'notifications/initialized') {
      res.statusCode = 202
      return res.end()
    }
    if (msg.method === 'tools/list') {
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'mock' }] } }))
    }
    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params
      let result
      if (name === 'call_tool' && args.tool_name === 'search_kb_embedding_search') {
        result = { content: [{ type: 'text', text: JSON.stringify({ hits: [{ title: '测试文档', score: 0.92 }] }) }] }
      } else if (name === 'call_tool' && args.tool_name === 'entry_describe_ai_parse_content') {
        result = { content: [{ type: 'text', text: JSON.stringify({ entry_id: args.arguments.entry_id, content: '# 测试\n正文内容' }) }] }
      } else if (name === 'call_tool' && args.tool_name === 'entry_list_children') {
        result = { content: [{ type: 'text', text: JSON.stringify({ entries: [{ id: 'e1', name: '子页' }] }) }] }
      } else {
        result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, tool: name, args }) }] }
      }
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }))
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'no method' } }))
  })
})

await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const config = {
  ...readConfig({}),
  endpoint: `http://127.0.0.1:${port}/mcp`,
  token: 'lxmcp_test_token',
  companyFrom: 'test',
  timeoutMs: 5000,
}

const client = new LexiangMcpClient(config, console)
let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { console.log(`  PASS  ${label}`); pass++ }
  else { console.log(`  FAIL  ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`); fail++ }
}

console.log('=== dsh-lexiang MCP protocol self-test ===')

const tools = await client.listTools()
check('tools/list returns tools', Array.isArray(tools) && tools.length > 0, tools)
check('session id captured', client._sessionId === 'test-session-001', client._sessionId)

const s = await ops.search(client, { query: '测试', mode: 'semantic' })
check('semantic search returns hits', s.results.includes('测试文档'), s)

const r = await ops.readPage(client, { entry_id: 'abc123' })
check('read page returns content', r.content.includes('正文内容'), r)

const l = await ops.listChildren(client, { parent_id: 'root' })
check('list children returns entries', l.includes('子页'), l)

check('auth header sent', calls.some(c => c.method === 'initialize'))
check('initialized notification sent', calls.some(c => c.method === 'notifications/initialized'))

server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
