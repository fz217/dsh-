/**
 * dsh-lexiang — DeepSeek Harness plugin for Lexiang knowledge base.
 *
 * Registers 9 callable tools so the model can search, read, create, update,
 * browse and upload to Lexiang directly from a dsh session, and show results
 * in a self-contained UI popup.
 *
 * Auth (environment variables, no secrets on disk):
 *   LEXIANG_TOKEN   required, format lxmcp_xxx  (https://lexiangla.com/mcp)
 *   COMPANY_FROM    required, tenant identifier
 *   LEXIANG_MCP_URL optional, defaults to https://mcp.lexiang-app.com/mcp
 *   LEXIANG_TIMEOUT_MS optional, defaults 30000
 */

import { LexiangMcpClient, LexiangMcpError, readConfig } from './src/mcp-client.js'
import * as ops from './src/operations.js'
import {
  buildPopupHtml,
  normalizeItems,
  openPopup,
} from './src/ui.js'
import { registerUI } from './src/ui-server.js'

// dsh provides defineTool at runtime. The fallback keeps this package loadable
// in a plain Node process (used by the local self-test / CLI smoke test).
let defineTool
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'))
} catch {
  defineTool = (t) => t
}
if (typeof defineTool !== 'function') defineTool = (t) => t

export const name = 'dsh-lexiang'
export const inject = ['tools']

/** Lazy singleton — never build a client before the first tool call. */
let client = null
let logger = console
let uiState = null

function getClient() {
  if (!client) {
    const config = readConfig()
    if (!config.token) {
      throw new LexiangMcpError(
        '未配置 LEXIANG_TOKEN。请在启动 dsh 前设置环境变量 LEXIANG_TOKEN 与 COMPANY_FROM。',
        'NO_TOKEN',
      )
    }
    if (!config.companyFrom) {
      throw new LexiangMcpError('未配置 COMPANY_FROM（乐享租户标识）', 'NO_COMPANY')
    }
    client = new LexiangMcpClient(config, logger)
  }
  return client
}

/** Wrap tool execution with uniform error text for the model. */
async function safe(op, fn, args) {
  try {
    // Validate required args before touching credentials, so a bad call gives
    // a useful message even when the environment is not configured yet.
    const missing = REQUIRED[op]?.filter(k => !args?.[k]) || []
    if (missing.length) {
      return { ok: false, error: `缺少必填参数：${missing.join(', ')}`, code: 'BAD_ARGS' }
    }
    return await fn()
  } catch (err) {
    if (err instanceof LexiangMcpError) return { ok: false, error: err.message, code: err.code }
    return { ok: false, error: err?.message || String(err), code: 'UNEXPECTED' }
  }
}

const REQUIRED = {
  search: ['query'],
  read: [], // entry_id or url — validated inside ops
  list: ['parent_id'],
  create: ['parent_id', 'title'],
  update: ['entry_id', 'command'],
  upload: ['file_path', 'parent_id'],
  popup: [],
}

const S = (type, description, required = false) => ({ type, description, ...(required ? { required: true } : {}) })

function configStatus() {
  const c = readConfig()
  return {
    ok: Boolean(c.token && c.companyFrom),
    endpoint: c.endpoint,
    company_from: c.companyFrom ? `${String(c.companyFrom).slice(0, 2)}***` : '',
    token_masked: c.token ? `${String(c.token).slice(0, 6)}***${String(c.token).slice(-4)}` : '',
    timeout_ms: c.timeoutMs,
    ui: {
      available: Boolean(uiState?.available),
      console_url: uiState?.consoleUrl || '',
      fallback: '独立浏览器弹窗',
    },
  }
}

export function apply(ctx) {
  logger = ctx.logger || console

  uiState = registerUI(ctx, { getClient, readConfig }) || {
    available: false,
    consoleUrl: '',
    reason: 'ui not registered',
  }

  ctx.tools.register(defineTool({
    name: 'lexiang_search',
    description: '搜索乐享知识库。mode=semantic 做语义检索直接返回相关切片（回答问题的首选）；mode=entity 找具体文档/知识库/团队。popup=true 时同时弹出可视化结果窗口。',
    parameters: {
      query: S('string', '搜索关键词或问题', true),
      mode: S('string', 'semantic（语义切片，默认）或 entity（条目列表）'),
      type: S('string', 'entity 模式下的类型：all/doc/space/team'),
      limit: S('number', '返回条数，1-50，默认 10'),
      popup: S('boolean', 'true 时把检索结果用自带 UI 弹窗展示'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) {
      return safe('search', async () => {
        const result = await ops.search(getClient(), args)
        let ui = null
        if (args?.popup === true) {
          const items = normalizeItems(result.results)
          const html = buildPopupHtml({
            title: `乐享检索 · ${args.query}`,
            subtitle: `模式 ${result.mode || 'semantic'} · ${items.length} 条结果`,
            items,
            chips: [
              { label: `关键词：${args.query}` },
              { label: `模式：${result.mode || 'semantic'}`, tone: 'ok' },
            ],
            data: result,
          })
          ui = await openPopup(html, { filename: 'lexiang-search.html' })
        }
        return { ...result, ...(ui ? { ui } : {}) }
      }, args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_read',
    description: '读取乐享页面或附件的正文内容。传 entry_id 或乐享页面 URL。支持 PDF/PPT/Word/图片等附件（走 AI 解析）。',
    parameters: {
      entry_id: S('string', '乐享条目 ID'),
      url: S('string', '乐享页面链接，如 https://lexiangla.com/pages/xxxx'),
      raw: S('boolean', 'true 返回原始解析结果，默认截断到 30000 字符'),
      popup: S('boolean', 'true 时把正文用自带 UI 弹窗展示'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) {
      return safe('read', async () => {
        const result = await ops.readPage(getClient(), args)
        let ui = null
        if (args?.popup === true) {
          const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
          const html = buildPopupHtml({
            title: '乐享文档正文',
            subtitle: `条目 ${result.entry_id}`,
            content,
            chips: [{ label: `entry_id：${result.entry_id}`, tone: 'ok' }],
            data: result,
          })
          ui = await openPopup(html, { filename: 'lexiang-read.html' })
        }
        return { ...result, ...(ui ? { ui } : {}) }
      }, args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_list',
    description: '列出乐享知识条目的子目录/文件。用于从知识库根节点逐层浏览。',
    parameters: {
      parent_id: S('string', '父条目 ID；知识库根 ID 可用 space_describe_space 获取', true),
      page_size: S('number', '每页条数，默认 50'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) { return safe('list', () => ops.listChildren(getClient(), args), args) },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_create_page',
    description: '在乐享创建页面并写入 Markdown 正文。长文自动分段写入，避免平台的结构不稳定报错。',
    parameters: {
      parent_id: S('string', '父条目 ID 或知识库 ID', true),
      title: S('string', '页面标题', true),
      content_markdown: S('string', '页面正文，Markdown 格式'),
      after: S('string', '插入到指定条目之后的可选 ID'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) { return safe('create', () => ops.createPage(getClient(), args), args) },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_update_page',
    description: '更新已有乐享页面正文。replace_content 整体替换；update_content 按 old_str→new_str 精确替换（推荐用于追加）。',
    parameters: {
      entry_id: S('string', '页面条目 ID', true),
      command: S('string', 'replace_content 或 update_content', true),
      new_str: S('string', 'replace_content 的完整新正文'),
      content_updates: S('object', 'update_content 的替换数组：[{old_str,new_str,replace_all_matches?}]'),
      content_format: S('string', 'markdown，默认'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) { return safe('update', () => ops.updatePage(getClient(), args), args) },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_upload_file',
    description: '把本机文件上传到乐享知识库（PNG/PDF/CSV/DOCX/MP4 等）。三步走：申请凭证→COS PUT→提交。',
    parameters: {
      file_path: S('string', '本机文件的绝对路径', true),
      parent_id: S('string', '乐享父条目 ID', true),
    },
    output: { schema: { type: 'object' } },
    async execute(args) { return safe('upload', () => ops.uploadFile(getClient(), args), args) },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_status',
    description: '检查乐享连接状态、环境变量配置和 UI 弹窗通道状态。连接报错时先调用此工具诊断。',
    parameters: {},
    output: { schema: { type: 'object' } },
    async execute() {
      const c = configStatus()
      return {
        ...c,
        hint: c.ok ? '配置就绪，可调用其他乐享工具' : '请设置 LEXIANG_TOKEN 与 COMPANY_FROM 环境变量后重启 dsh',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_popup',
    description: '弹出自带 UI 窗口展示信息。不需要乐享凭据，可用于展示状态、说明、检索结果卡片或模型想强调的内容。',
    parameters: {
      title: S('string', '弹窗标题'),
      subtitle: S('string', '副标题'),
      content: S('string', '正文，纯文本，支持换行'),
      items: S('object', '条目数组，每项可含 title / desc / url / meta'),
      chips: S('object', '顶部标签数组，每项可含 label / tone（ok、warn、err）'),
      mode: S('string', 'custom（默认）或 status（展示乐享连接与 UI 状态）'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) {
      return safe('popup', async () => {
        const mode = args?.mode || 'custom'
        const status = configStatus()
        const title = args?.title || (mode === 'status' ? '乐享连接状态' : 'dsh-lexiang 提示')
        const subtitle = args?.subtitle || (mode === 'status' ? '环境变量与 UI 通道诊断' : '来自 dsh 会话的可视化弹窗')
        const content = mode === 'status'
          ? `配置状态：${status.ok ? '就绪' : '未就绪'}\n端点：${status.endpoint}\n租户：${status.company_from || '未设置'}\n令牌：${status.token_masked || '未设置'}\n超时：${status.timeout_ms} ms\nUI 通道：${status.ui.available ? 'dsh Web 控制台 + 独立弹窗' : '独立浏览器弹窗'}`
          : (args?.content || '')
        const chips = args?.chips || (mode === 'status'
          ? [{ label: status.ok ? '配置就绪' : '配置未就绪', tone: status.ok ? 'ok' : 'err' },
             { label: status.ui.available ? 'Web 控制台可用' : 'Web 控制台不可用', tone: status.ui.available ? 'ok' : 'warn' }]
          : [])

        const html = buildPopupHtml({
          title,
          subtitle,
          content,
          items: Array.isArray(args?.items) ? args.items : [],
          chips,
          data: mode === 'status' ? status : (args || {}),
        })
        const ui = await openPopup(html, { filename: `lexiang-${mode}.html` })
        return { ok: true, mode, ui, status: mode === 'status' ? status : undefined }
      }, args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'lexiang_ui',
    description: '打开或获取 dsh-lexiang 的可视化控制台。若宿主提供 webServer 则返回站内地址；否则生成独立浏览器弹窗。',
    parameters: {
      open: S('boolean', 'true 时立即打开独立浏览器弹窗，默认 false'),
    },
    output: { schema: { type: 'object' } },
    async execute(args) {
      const status = configStatus()
      let ui = null
      if (args?.open === true || !status.ui.available) {
        const html = buildPopupHtml({
          title: 'dsh-lexiang 控制台',
          subtitle: status.ui.available
            ? '宿主 Web 服务可用，也可使用独立弹窗'
            : '当前宿主无 Web 服务，已切换到独立浏览器弹窗',
          content: '插件已加载。可用工具：检索、读取、建页、更新、上传、状态诊断、弹窗与控制台。\n令牌通过环境变量注入，不会出现在网页里。',
          chips: [
            { label: `工具数：9`, tone: 'ok' },
            { label: status.ui.available ? 'Web 控制台已挂载' : '独立弹窗模式', tone: status.ui.available ? 'ok' : 'warn' },
          ],
          data: status,
        })
        ui = await openPopup(html, { filename: 'lexiang-console.html' })
      }
      return {
        ok: true,
        console_url: status.ui.console_url || null,
        web_available: status.ui.available,
        ui,
      }
    },
  }))

  ctx.effect(() => () => { client = null }, 'dsh-lexiang: dispose')
  logger.info?.('[dsh-lexiang] loaded · 9 tools registered · UI popup ready')
}
