window.__ModuleLoader__.load({
  id: 'dsh-lexiang',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ID = 'dsh-lexiang-sidebar';
    const dictionaries = {
      en: { title:'Lexiang', panel:'Lexiang knowledge base', open:'Open Lexiang in the right sidebar', search:'Search', prompt:'Enter a keyword or a question', hint:'Search your knowledge base without leaving this conversation.', busy:'Searching…', empty:'No results. Try a different keyword.', failed:'Search failed. Check that dsh-lexiang is enabled and connected, then retry.', openFailed:'Could not open the sidebar. Open a conversation and try again.', results:'Results for', result:'Search result', source:'Open source ↗' },
      zh: { title:'乐享', panel:'乐享知识库', open:'在右侧栏打开乐享知识库', search:'搜索', prompt:'输入关键词或问题', hint:'直接在右侧栏搜索知识库、查看摘要。', busy:'正在搜索…', empty:'没有找到结果，试试其他关键词。', failed:'搜索失败。请确认 dsh-lexiang 已启用且连接正常，再重试。', openFailed:'未能打开侧栏，请打开一个会话后重试。', results:'检索结果', result:'检索结果', source:'打开原文 ↗' },
    };
    const css = `
      .lexsb {box-sizing:border-box;height:100%;min-height:0;overflow:auto;padding:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit;}
      .lexsb h2 {font-size:15px;margin:0 0 12px;}
      .lexsb form {display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
      .lexsb input,.lexsb-btn {box-sizing:border-box;min-height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;}
      .lexsb input {flex:1 1 140px;min-width:0;}
      .lexsb-btn {cursor:pointer;white-space:nowrap;font-size:12px;}
      .lexsb-btn:hover:enabled {background:var(--dsw-alias-bg-layer-1);text-decoration:underline;text-underline-offset:2px;}
      .lexsb-btn:disabled {opacity:.55;cursor:default;}
      .lexsb :focus-visible,.lexsb-btn:focus-visible {outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
      .lexsb p,.lexsb-error {overflow-wrap:anywhere;line-height:1.55;font-size:13px;}
      .lexsb-status {color:var(--dsw-alias-label-secondary);}
      .lexsb-error {color:var(--dsw-alias-state-error-primary);}
      .lexsb ol {list-style:none;margin:12px 0;padding:0;display:grid;gap:8px;}
      .lexsb li {border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;overflow-wrap:anywhere;}
      .lexsb li p {white-space:pre-wrap;margin:6px 0;}
      .lexsb li a {color:var(--dsw-alias-brand-primary);font-size:13px;}
      .lexsb-launch,.lexsb-nav {display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .lexsb-nav {margin-bottom:12px;}
      .lexsb-nav [aria-pressed=true] {border-color:var(--dsw-alias-brand-primary);}
      .lexsb-path {margin:12px 0 8px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:12px;}
      .lexsb .lexsb-list {display:block;margin:0 0 12px;}
      .lexsb .lexsb-list li {padding:0;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:0;}
      .lexsb .lexsb-row {box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:10px 6px;width:100%;text-align:start;background:none;border:0;border-radius:6px;color:inherit;font:inherit;font-size:13px;text-decoration:none;cursor:pointer;}
      .lexsb-row:hover {background:var(--dsw-alias-bg-layer-1);text-decoration:underline;}
      .lexsb-name {flex:1;min-width:0;overflow-wrap:anywhere;}
      .lexsb-date {font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
      @container (max-width: 280px) {.lexsb-date {display:none;}}
      .lexsb-browser {container-type:inline-size;}
    `;
    function sourceUrl(value) {
      try {
        const url = new URL(value);
        if (url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'lexiangla.com' || url.hostname.endsWith('.lexiangla.com'))) return url.href;
      } catch {}
      return null;
    }
    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        for (const [lang, dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(ID, lang, dict));
        const t = ctx.locale.bind(ID);
        const useLocale = () => React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
        const navLabels = {
          en: { personal:'My knowledge base', teams:'Team knowledge bases', find:'Search', back:'Back', loading:'Loading…', error:'Could not load this directory.', retry:'Retry', more:'Load more', noFiles:'Nothing here yet.', noPersonal:'No personal knowledge base available.', names:'Files and folders' },
          zh: { personal:'我的个人知识库', teams:'团队知识库', find:'搜索', back:'返回上一级', loading:'正在加载…', error:'无法加载目录。', retry:'重试', more:'加载更多', noFiles:'此目录暂无文件。', noPersonal:'未找到个人知识库。', names:'文件和文件夹' },
        };
        function Browser({ mode }) {
          const label = nav;
          const [path, setPath] = React.useState([]);
          const [page, setPage] = React.useState({ rows:[], next:'', busy:true });
          const [retry, setRetry] = React.useState(0);
          const current = path[path.length - 1];
          const request = React.useRef(null);
          async function get(route, params, signal) {
            const res = await fetch('/api/dsh-lexiang/' + route + '?' + new URLSearchParams(params), { credentials:'same-origin', redirect:'error', signal });
            if (!res.ok) throw Error('Directory request failed');
            const data = await res.json();
            if (!data.ok) throw Error('Directory unavailable');
            return data;
          }
          async function load(cursor = '') {
            request.current?.abort();
            const controller = new AbortController();
            request.current = controller;
            const timer = setTimeout(() => {
              controller.abort();
              if (request.current === controller) setPage(p => ({ ...p, busy:false, error:true }));
            }, 35000);
            setPage(p => ({ ...(cursor ? p : { rows:[], next:'' }), busy:true, error:false }));
            try {
              const params = cursor ? { cursor } : {};
              let route = !current ? 'teams' : current.team ? 'spaces' : 'entries';
              if (current) params.id = current.id;
              if (!current && mode === 'personal') {
                const { personal } = await get('personal', {}, controller.signal);
                if (!personal) {
                  if (!controller.signal.aborted) setPage({ rows:[], next:'', busy:false, missing:true });
                  return;
                }
                route = 'entries';
                params.id = personal.id;
              }
              const data = await get(route, params, controller.signal);
              if (!Array.isArray(data.rows)) throw Error('Missing directory rows');
              if (!controller.signal.aborted) setPage(p => {
                const prior = cursor ? p.rows : [];
                const seen = new Set(prior.map(row => row.id));
                return { rows:[...prior, ...data.rows.filter(row => !seen.has(row.id) && seen.add(row.id))], next:data.next || '', busy:false };
              });
            } catch {
              if (!controller.signal.aborted) setPage(p => ({ ...p, busy:false, error:true }));
            } finally { clearTimeout(timer); }
          }
          React.useEffect(() => { load(); return () => request.current?.abort(); }, [path, retry]);
          const teamRows = mode === 'teams' && !current;
          const spaceRows = Boolean(current?.team);
          const pathText = [label(mode), ...path.map(row => row.name)].join(' / ');
          return h('div', { className:'lexsb-browser' },
            path.length > 0 && h('button', { type:'button', className:'lexsb-btn', onClick:() => setPath(p => p.slice(0,-1)) }, '← ', label('back')),
            h('div', { className:'lexsb-path' }, pathText),
            h('p', { role:'status', className:'lexsb-status' }, page.busy ? label('loading') : !page.error && !page.rows.length ? label(page.missing ? 'noPersonal' : 'noFiles') : ''),
            h('ul', { className:'lexsb-list', 'aria-label':label('names') }, page.rows.map(row => {
              const folder = teamRows || spaceRows || row.folder;
              const date = Number(row.edited) > 0 ? new Date(Number(row.edited) * 1000) : null;
              const validDate = date && Number.isFinite(date.getTime());
              const body = [h('span', { key:'icon', 'aria-hidden':true }, teamRows ? '👥' : folder ? '📁' : '📄'), h('span', { key:'name', className:'lexsb-name' }, row.name), validDate && h('time', { key:'date', className:'lexsb-date', dateTime:date.toISOString() }, date.toLocaleDateString())];
              return h('li', { key:row.id }, folder
                ? h('button', { type:'button', className:'lexsb-row', onClick:() => setPath(p => [...p, { id:row.id, name:row.name, team:teamRows }]) }, ...body, h('span', { 'aria-hidden':true }, '›'))
                : h('a', { className:'lexsb-row', href:'https://lexiangla.com/pages/' + encodeURIComponent(row.id), target:'_blank', rel:'noopener noreferrer' }, ...body),
                !folder && row.children && h('button', { type:'button', className:'lexsb-btn', onClick:() => setPath(p => [...p, row]) }, '› ', label('names')));
            })),
            page.error && h('div', { role:'alert' }, label('error'), ' ', h('button', { type:'button', className:'lexsb-btn', onClick:() => page.next ? load(page.next) : setRetry(n => n+1) }, label('retry'))),
            page.next && !page.error && h('button', { type:'button', className:'lexsb-btn', disabled:page.busy, onClick:() => load(page.next) }, label('more')));
        }
        for (const [lang, labels] of Object.entries(navLabels)) ctx.effect(() => ctx.locale.register(ID + '-nav', lang, labels));
        const nav = ctx.locale.bind(ID + '-nav');
        function Tab() {
          useLocale();
          const [mode, setMode] = React.useState('personal');
          const [query, setQuery] = React.useState('');
          const [view, setView] = React.useState({ kind:'hint', items:[] });
          const request = React.useRef(null);
          React.useEffect(() => () => request.current?.abort(), []);
          async function search(event) {
            event.preventDefault();
            const q = query.trim();
            if (!q || request.current) return;
            const controller = new AbortController();
            request.current = controller;
            setView({ kind:'busy', items:[] });
            const timeout = setTimeout(() => {
              if (request.current !== controller) return;
              request.current = null;
              controller.abort();
              setView({ kind:'failed', items:[] });
            }, 35000);
            try {
              const response = await fetch('/api/dsh-lexiang/search?' + new URLSearchParams({ q }), { signal:controller.signal, credentials:'same-origin', redirect:'error' });
              if (!response.ok) throw Error('Search failed');
              const data = await response.json();
              if (!data.ok || !Array.isArray(data.items)) throw Error('Unexpected search response');
              if (controller.signal.aborted) return;
              let text = '';
              if (typeof data.raw === 'string') {
                try {
                  const raw = JSON.parse(data.raw);
                  if (typeof raw === 'string') text = raw.trim();
                  else if (typeof raw?.text === 'string') text = raw.text.trim();
                } catch { text = data.raw.trim(); }
              }
              const items = text && (!data.items.length || (data.items.length === 1 && !data.items[0]?.url))
                ? [{ desc:text.slice(0, 12000) }]
                : data.items.slice(0,20);
              setView({ kind:items.length ? 'results' : 'empty', items, query:q });
            } catch {
              if (!controller.signal.aborted) setView({ kind:'failed', items:[] });
            } finally {
              clearTimeout(timeout);
              if (request.current === controller) request.current = null;
            }
          }
          return h('section', { className:'lexsb', 'aria-label':t('panel') },
            h('h2', null, t('panel')),
            h('nav', { className:'lexsb-nav', 'aria-label':t('panel') }, ['personal','teams','find'].map(key => h('button', { key, type:'button', className:'lexsb-btn', 'aria-pressed':mode === key, onClick:() => setMode(key) }, nav(key)))),
            mode !== 'find' ? h(Browser, { key:mode, mode }) : h(React.Fragment, null,
            h('form', { role:'search', onSubmit:search },
              h('input', { type:'search', maxLength:500, value:query, onChange:e => setQuery(e.target.value), placeholder:t('prompt'), 'aria-label':t('prompt') }),
              h('button', { type:'submit', className:'lexsb-btn', disabled:!query.trim() || view.kind === 'busy' }, t('search'))),
            h('p', { role:'status', className:'lexsb-status' }, view.kind === 'results'
              ? `${t('results')}: ${view.query} (${view.items.length})`
              : view.kind === 'failed' ? '' : t(view.kind)),
            view.kind === 'failed' && h('p', { role:'alert', className:'lexsb-error' }, t('failed')),
            view.items.length > 0 && h('ol', null, view.items.map((item, i) => {
              const url = sourceUrl(item.url);
              return h('li', { key:i },
                h('strong', null, typeof item.title === 'string' && item.title ? item.title : t('result')),
                typeof item.desc === 'string' && h('p', null, item.desc),
                url && h('a', { href:url, target:'_blank', rel:'noopener noreferrer' }, t('source')));
            }))));
        }
        function Launcher() {
          useLocale();
          const [failed, setFailed] = React.useState(false);
          return h('span', { className:'lexsb-launch' },
            h('style', null, css),
            h('button', { type:'button', className:'lexsb-btn', title:t('open'), 'aria-label':t('open'), onClick:() => {
              try { ctx.sidebarRight.openTab(ID); setFailed(false); }
              catch { setFailed(true); }
            } }, t('title')),
            failed && h('span', { role:'alert', className:'lexsb-error' }, t('openFailed')));
        }
        function StyledTab() { return h(React.Fragment, null, h('style', null, css), h(Tab)); }
        ctx.effect(() => ctx.sidebarRightTabs.register({ id:ID, kind:ID, title:() => t('title'), guide:[{ id:ID, order:35, title:() => t('title'), description:() => t('hint') }], keepMounted:true }));
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name:'sidebar.right.pane.tab', key:ID }, StyledTab));
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name:'conversation.session.header.utilities', id:ID, order:8 }, Launcher));
      },
    };
  },
});
