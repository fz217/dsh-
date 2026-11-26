/**
 * dsh-lexiang UI layer.
 *
 * Two popup channels, both zero-dependency:
 *   1. Standalone browser popup — buildPopupHtml() + openPopup() write a
 *      self-contained HTML file and open it in the OS default browser. Works
 *      even when dsh has no webServer service.
 *   2. dsh web console — buildConsoleHtml() is served by ui-server.js through
 *      ctx.inject(['webServer']) when the host provides that service.
 *
 * No token is ever embedded in HTML. The console calls local API routes that
 * keep credentials server-side.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

/** JSON safe to inline in a <script type="application/json"> block. */
export function jsonForScript(value) {
  return JSON.stringify(value ?? {}, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

const STYLE = `
:root{color-scheme:light;--bg:#eef1f7;--card:#ffffff;--ink:#1c2233;--muted:#667086;--line:#e3e7f0;--accent:#2f6bed;--accent-soft:#eaf1ff;--ok:#18864b;--warn:#b26a00;--err:#c7352b}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink)}
body{padding:28px;display:flex;align-items:flex-start;justify-content:center}
dialog.lx-dialog{border:0;border-radius:18px;width:min(760px,100%);max-height:86vh;padding:0;background:var(--card);color:var(--ink);box-shadow:0 24px 70px rgba(21,32,60,.24);overflow:hidden}
dialog.lx-dialog::backdrop{background:rgba(16,24,44,.52);backdrop-filter:blur(3px)}
.lx-head{display:flex;align-items:center;gap:12px;padding:20px 24px 16px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#ffffff 0%,#f3f7ff 100%)}
.lx-mark{width:38px;height:38px;border-radius:11px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px;letter-spacing:-.5px;flex:none}
.lx-head-text{min-width:0;flex:1}
.lx-eyebrow{font-size:10px;font-weight:800;letter-spacing:.18em;color:var(--accent);text-transform:uppercase}
.lx-head h1{font-size:17px;margin:2px 0 0;line-height:1.35;word-break:break-word}
.lx-sub{margin:5px 0 0;font-size:12px;color:var(--muted);line-height:1.5}
.lx-close{border:1px solid var(--line);background:#fff;color:var(--muted);border-radius:9px;width:32px;height:32px;cursor:pointer;font-size:18px;line-height:1;flex:none}
.lx-close:hover{color:var(--ink);border-color:var(--accent)}
.lx-body{padding:20px 24px 24px;overflow:auto;max-height:calc(86vh - 82px)}
.lx-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.lx-chip{font-size:11px;border-radius:999px;padding:5px 10px;background:var(--accent-soft);color:#1d4fbf;font-weight:700}
.lx-chip.ok{background:#e7f7ee;color:var(--ok)}
.lx-chip.warn{background:#fff4e2;color:var(--warn)}
.lx-chip.err{background:#fdeceb;color:var(--err)}
.lx-content{font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;margin:0 0 18px}
.lx-section-title{font-size:11px;font-weight:800;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin:0 0 10px}
.lx-items{display:grid;gap:10px;margin:0}
.lx-item{border:1px solid var(--line);border-radius:12px;padding:13px 15px;background:#fcfdff;transition:border-color .15s,transform .15s}
.lx-item:hover{border-color:#bcd0f7;transform:translateY(-1px)}
.lx-item h3{margin:0 0 5px;font-size:13px;font-weight:700;line-height:1.45}
.lx-item h3 a{color:var(--accent);text-decoration:none}
.lx-item p{margin:0;font-size:12px;color:var(--muted);line-height:1.6;white-space:pre-wrap;word-break:break-word}
.lx-item .lx-meta{display:inline-block;margin-top:7px;font-size:10px;color:#8791a5;background:#f1f4fa;border-radius:6px;padding:2px 7px}
.lx-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding-top:14px;border-top:1px solid var(--line)}
.lx-hint{font-size:11px;color:var(--muted);line-height:1.5}
.lx-actions{display:flex;gap:8px;flex:none}
.lx-btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:8px 13px;font-size:12px;cursor:pointer;font-weight:600}
.lx-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.lx-btn:hover{filter:brightness(.97)}
.lx-empty{border:1px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--muted);font-size:12px}
.lx-console{margin:0 auto;max-width:900px;width:100%}
.lx-console .lx-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-bottom:16px;box-shadow:0 8px 24px rgba(21,32,60,.05)}
.lx-console h2{font-size:15px;margin:0 0 12px}
.lx-row{display:flex;gap:10px;flex-wrap:wrap}
.lx-input{flex:1;min-width:220px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;font-family:inherit;outline:none}
.lx-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.lx-pre{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.65;background:#f7f9fd;border:1px solid var(--line);border-radius:10px;padding:14px;max-height:460px;overflow:auto}
@media (max-width:600px){body{padding:12px}.lx-body{padding:16px}.lx-head{padding:16px}.lx-foot{flex-direction:column;align-items:stretch}.lx-actions{justify-content:flex-end}}
`

const SCRIPT = `
(function(){
  var d=document.getElementById('lx-dialog');
  var close=document.getElementById('lx-close');
  var dismiss=function(){ if(d.open) d.close(); };
  if(close) close.addEventListener('click',dismiss);
  d.addEventListener('click',function(e){ if(e.target===d) dismiss(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&d.open){e.preventDefault();dismiss();} },true);
  var copy=document.getElementById('lx-copy');
  if(copy) copy.addEventListener('click',function(){
    var raw=document.getElementById('lx-data').textContent||'';
    var done=function(){copy.textContent='已复制';setTimeout(function(){copy.textContent='复制 JSON';},1800);};
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(raw).then(done,function(){});
    else { var t=document.createElement('textarea');t.value=raw;document.body.appendChild(t);t.select();try{document.execCommand('copy');done();}catch(e){}document.body.removeChild(t); }
  });
  var form=document.getElementById('lx-search-form');
  if(form) form.addEventListener('submit',async function(e){
    e.preventDefault();
    var q=document.getElementById('lx-q').value.trim();
    var out=document.getElementById('lx-result');
    if(!q) return;
    out.textContent='检索中…';
    try{
      var r=await fetch('/api/dsh-lexiang/search?q='+encodeURIComponent(q));
      var j=await r.json();
      out.textContent=JSON.stringify(j,null,2);
    }catch(err){ out.textContent='请求失败：'+err.message; }
  });
})();
`

function chipsHtml(chips = []) {
  if (!chips.length) return ''
  return `<div class="lx-chips">${chips.map(c => `<span class="lx-chip ${esc(c.tone || '')}">${esc(c.label)}</span>`).join('')}</div>`
}

function itemsHtml(items = []) {
  if (!items.length) return '<div class="lx-empty">暂无可展示的条目</div>'
  return `<div class="lx-items">${items.map(item => {
    const title = esc(item.title || item.name || '未命名')
    const heading = item.url
      ? `<h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${title}</a></h3>`
      : `<h3>${title}</h3>`
    const desc = item.desc || item.snippet || item.content || item.text || ''
    const meta = item.meta || item.score || item.id || ''
    return `<article class="lx-item">${heading}${desc ? `<p>${esc(String(desc).slice(0, 600))}</p>` : ''}${meta ? `<span class="lx-meta">${esc(String(meta).slice(0, 120))}</span>` : ''}</article>`
  }).join('')}</div>`
}

/**
 * Build a fully self-contained popup page. Safe to write to disk or serve.
 */
export function buildPopupHtml({
  title = '乐享知识库',
  subtitle = 'dsh-lexiang 插件弹窗',
  eyebrow = 'DSH · LEXIANG',
  content = '',
  items = [],
  chips = [],
  data = null,
  showCopy = true,
} = {}) {
  const payload = jsonForScript(data ?? { title, subtitle, items, content, chips })
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<dialog class="lx-dialog" id="lx-dialog" open>
  <header class="lx-head">
    <div class="lx-mark">乐</div>
    <div class="lx-head-text">
      <div class="lx-eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      <p class="lx-sub">${esc(subtitle)}</p>
    </div>
    <button class="lx-close" id="lx-close" title="关闭" aria-label="关闭">×</button>
  </header>
  <div class="lx-body">
    ${chipsHtml(chips)}
    ${content ? `<p class="lx-content">${esc(content)}</p>` : ''}
    ${items.length ? `<p class="lx-section-title">${items.length} 条结果</p>${itemsHtml(items)}` : ''}
    <div class="lx-foot">
      <span class="lx-hint">Esc 或点击空白处关闭 · 数据只在本地渲染</span>
      <span class="lx-actions">${showCopy ? '<button class="lx-btn" id="lx-copy" type="button">复制 JSON</button>' : ''}<button class="lx-btn primary" type="button" onclick="document.getElementById('lx-dialog').close()">知道了</button></span>
    </div>
  </div>
</dialog>
<script type="application/json" id="lx-data">${payload}</script>
<script>${SCRIPT}</script>
</body>
</html>`
}

/** Standalone console page served from the dsh webServer. */
export function buildConsoleHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-lexiang 控制台</title>
<style>${STYLE}</style>
</head>
<body>
<main class="lx-console">
  <section class="lx-card">
    <div class="lx-head" style="border:0;padding:0 0 14px;background:none">
      <div class="lx-mark">乐</div>
      <div class="lx-head-text">
        <div class="lx-eyebrow">DSH · LEXIANG</div>
        <h1>乐享知识库控制台</h1>
        <p class="lx-sub">在 dsh 内直接检索乐享，凭据只留在服务端</p>
      </div>
    </div>
    <form class="lx-row" id="lx-search-form">
      <input class="lx-input" id="lx-q" placeholder="输入关键词或问题，例如：第九道门 分镜" autocomplete="off">
      <button class="lx-btn primary" type="submit">搜索</button>
    </form>
  </section>
  <section class="lx-card">
    <h2>检索结果</h2>
    <pre class="lx-pre" id="lx-result">等待查询…</pre>
  </section>
</main>
<script>${SCRIPT}</script>
</body>
</html>`
}

/** Normalize a Lexiang search payload into popup cards. */
export function normalizeItems(result, limit = 20) {
  if (!result) return []
  let raw = result
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return [{ title: '检索结果', desc: raw.slice(0, 600) }] }
  }
  const candidates = raw.hits || raw.results || raw.items || raw.entries || raw.data?.hits || raw.data?.results || raw.data?.items || []
  if (!Array.isArray(candidates)) return [{ title: '检索结果', desc: JSON.stringify(raw).slice(0, 600) }]
  return candidates.slice(0, limit).map((row, i) => ({
    title: row.title || row.name || row.chunk?.title || `结果 ${i + 1}`,
    desc: row.content || row.snippet || row.text || row.summary || row.chunk?.content || '',
    url: row.url || row.link || (row.entry_id ? `https://lexiangla.com/pages/${row.entry_id}` : ''),
    meta: row.score != null ? `相关度 ${row.score}` : (row.id || row.entry_id || ''),
  }))
}

/**
 * Write the popup HTML to a temp file and open it in the default browser.
 * opener is injectable for tests; no shell is used for path handling.
 */
export async function openPopup(html, { filename = 'dsh-lexiang-popup.html', opener } = {}) {
  const dir = path.join(os.tmpdir(), 'dsh-lexiang')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`)
  await fs.writeFile(file, html, 'utf8')
  const url = `file://${file.replace(/\\/g, '/')}`

  if (opener) {
    await opener(file, url)
    return { opened: true, file, url }
  }

  try {
    const cmd = process.platform === 'win32' ? 'explorer.exe'
      : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(cmd, [file], { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return { opened: true, file, url }
  } catch (err) {
    return { opened: false, file, url, error: err?.message || String(err) }
  }
}
