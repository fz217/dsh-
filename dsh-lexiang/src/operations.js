/**
 * Lexiang business operations exposed as dsh tools.
 * All operations go through the MCP client, never raw REST.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { LexiangMcpError } from './mcp-client.js'

/** Trim tool output to keep model context sane. */
function clip(value, maxChars = 12000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return s.length <= maxChars ? s : `${s.slice(0, maxChars)}\n…[truncated ${s.length - maxChars} chars]`
}

/** Lexiang sometimes wraps results in MCP content arrays; normalize. */
function normalize(r) {
  if (r == null) return {}
  if (typeof r === 'object' && !Array.isArray(r) && (r.text || r.structuredContent)) {
    return r.structuredContent ?? { text: r.text }
  }
  return r
}

export async function search(client, { query, type = 'all', limit = 10, mode = 'semantic' }) {
  if (!query || typeof query !== 'string') throw new LexiangMcpError('query 不能为空', 'BAD_ARGS')
  const n = Math.max(1, Math.min(50, Number(limit) || 10))

  if (mode === 'semantic') {
    const r = await client.callTool('call_tool', {
      tool_name: 'search_kb_embedding_search',
      arguments: { filters: { keyword: query }, limit: n },
    })
    return { mode, query, results: clip(normalize(r)) }
  }

  const r = await client.callTool('call_tool', {
    tool_name: 'lexiang_search',
    arguments: { query, type, limit: n },
  })
  return { mode, query, type, results: clip(normalize(r)) }
}

export async function readPage(client, { entry_id, url, raw = false }) {
  const id = entry_id || extractEntryId(url)
  if (!id) throw new LexiangMcpError('需要 entry_id 或乐享页面 URL', 'BAD_ARGS')
  const r = await client.callTool('call_tool', {
    tool_name: 'entry_describe_ai_parse_content',
    arguments: { entry_id: id },
  })
  const data = normalize(r)
  return raw ? data : { entry_id: id, content: clip(data, 30000) }
}

export async function listChildren(client, { parent_id, page_size = 50 }) {
  if (!parent_id) throw new LexiangMcpError('parent_id 不能为空', 'BAD_ARGS')
  const r = await client.callTool('call_tool', {
    tool_name: 'entry_list_children',
    arguments: { parent_id, page_size: Math.min(100, Number(page_size) || 50) },
  })
  return clip(normalize(r))
}

export async function createPage(client, { parent_id, title, content_markdown, after }) {
  if (!parent_id || !title) throw new LexiangMcpError('parent_id 与 title 不能为空', 'BAD_ARGS')

  const created = normalize(await client.callTool('call_tool', {
    tool_name: 'entry_create_entry',
    arguments: {
      entry_type: 'page',
      parent_entry_id: parent_id,
      name: title,
      ...(after ? { after } : {}),
    },
  }))

  const entryId = created?.id || created?.entry?.id
  if (!entryId) throw new LexiangMcpError('创建页面成功但未取到 entry_id', 'CREATE_NO_ID', created)

  if (content_markdown) {
    // Long bodies are unstable in one replace_content call — write a short
    // skeleton first, then append section by section (Lexiang lesson).
    const lines = String(content_markdown).split(/\n(?=#{1,3} )/)
    const head = lines.shift() || title
    await client.callTool('call_tool', {
      tool_name: 'block_update_page',
      arguments: {
        entry_id: entryId, command: 'replace_content',
        content_format: 'markdown', new_str: head.slice(0, 1200),
      },
    })
    for (const section of lines) {
      if (!section.trim()) continue
      await client.callTool('call_tool', {
        tool_name: 'block_update_page',
        arguments: {
          entry_id: entryId, command: 'update_content',
          content_format: 'markdown',
          content_updates: [{
            old_str: head.slice(-80),
            new_str: `${head.slice(-80)}\n\n${section.slice(0, 6000)}`,
          }],
        },
      })
    }
  }
  return { entry_id: entryId, title, url: `https://lexiangla.com/pages/${entryId}` }
}

export async function updatePage(client, { entry_id, command, new_str, content_updates, content_format = 'markdown' }) {
  if (!entry_id) throw new LexiangMcpError('entry_id 不能为空', 'BAD_ARGS')
  if (command === 'replace_content' && !new_str) throw new LexiangMcpError('replace_content 需要 new_str', 'BAD_ARGS')
  if (command === 'update_content' && !Array.isArray(content_updates)) {
    throw new LexiangMcpError('update_content 需要 content_updates 数组', 'BAD_ARGS')
  }
  const args = { entry_id, command, content_format }
  if (new_str) args.new_str = new_str
  if (content_updates) args.content_updates = content_updates
  return normalize(await client.callTool('call_tool', { tool_name: 'block_update_page', arguments: args }))
}

export async function uploadFile(client, { file_path, parent_id }) {
  if (!file_path || !parent_id) throw new LexiangMcpError('file_path 与 parent_id 不能为空', 'BAD_ARGS')
  const abs = path.resolve(file_path)
  const stat = await fs.stat(abs)
  const name = path.basename(abs)
  const ext = path.extname(abs).slice(1).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  // Step 1: apply
  const applied = normalize(await client.callTool('call_tool', {
    tool_name: 'file_apply_upload',
    arguments: {
      name, size: String(stat.size), mime_type: mime,
      extension: ext, parent_entry_id: parent_id,
      upload_type: 'PRE_SIGNED_URL',
    },
  }))
  const session = applied?.session || applied
  const url = session?.objects?.[0]?.upload_url
  const sessionId = session?.session_id
  if (!url || !sessionId) throw new LexiangMcpError('申请上传凭证失败', 'UPLOAD_APPLY', applied)

  // Step 2: HTTP PUT (outside MCP)
  const body = await fs.readFile(abs)
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': mime, 'content-length': String(body.length) },
    body,
  })
  if (!put.ok) throw new LexiangMcpError(`COS 上传失败 HTTP ${put.status}`, put.status)

  // Step 3: commit
  const committed = normalize(await client.callTool('call_tool', {
    tool_name: 'file_commit_upload', arguments: { session_id: sessionId },
  }))
  return { name, size: stat.size, entry_id: committed?.entry?.id, status: committed?.entry?.status }
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', pdf: 'application/pdf',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
  json: 'application/json', html: 'text/html', mp4: 'video/mp4',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
}

function extractEntryId(url) {
  if (!url || typeof url !== 'string') return ''
  const m = url.match(/\/pages\/([a-zA-Z0-9]+)/)
  return m ? m[1] : ''
}
