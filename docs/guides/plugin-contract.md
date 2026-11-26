# dsh 插件契约与踩坑

## 契约

- 插件导出 `name`、`inject`、`apply(ctx, config)`
- 工具注册：`inject = ['tools']` + `ctx.tools.register(defineTool({...}))`
- `defineTool` 来自 `@deepseek-ai/dsh-tools`；用动态 import + fallback 便于本地 Node 自测
- `package.json` 必须声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`，只写 `dsh.client` 不满足收录条件
- 安装：`dsh plugin --profile web add <dir>`，之后**必须重启 dsh 服务**
- 桌面端 profile 只能由 Electron 插件管理器写入，命令行无效

## 本机踩坑

- GitHub connector 集成只读，建仓与写文件返回 403；写仓库需 fine-grained PAT 且给 Contents 读写权限
- 本机 `git push` 到 github.com 会连接重置，改走 Python urllib + Contents API 逐文件 PUT
- 更新已存在文件必须带 sha，否则 422
- 乐享 `file_apply_upload` 不支持 `.js` / `.mjs` / `.json` / `.yml` 在线预览，源码以 `.txt` 上传
- 乐享扩展名由上传文件名后缀决定，已有文件不允许换后缀，当前 MCP 无删除条目接口
- `block_update_page` 的 `update_content` 命中不了 HTML 表格内部，结构化表格编辑走 `replace_blocks`
