# dsh-lexiang

DeepSeek Harness（dsh）插件：让模型直接搜索、读取、创建、更新乐享知识库，并上传本地文件。

令牌通过环境变量注入，**不落盘、不写进配置文件**。

## 能力

| 工具 | 说明 |
|---|---|
| `lexiang_search` | 语义检索（默认，直接返回切片）或实体搜索（文档/知识库/团队） |
| `lexiang_read` | 读页面/附件正文（PDF/PPT/Word/图片走 AI 解析），支持 entry_id 或 URL |
| `lexiang_list` | 列出目录下条目 |
| `lexiang_create_page` | 创建页面并写 Markdown（长文自动分段，规避平台结构不稳定报错） |
| `lexiang_update_page` | 更新正文（整体替换 / 精确替换追加） |
| `lexiang_upload_file` | 本地文件上传（apply → COS PUT → commit 三步） |
| `lexiang_status` | 诊断连接与环境变量配置 |

## 前置条件

- Node.js `^22.19.0 || >=24.0.0`
- dsh 本体（已安装并可运行 `dsh plugin ...`）
- 乐享 MCP 令牌：打开 <https://lexiangla.com/mcp> 获取 `LEXIANG_TOKEN`（`lxmcp_` 开头）和 `COMPANY_FROM`

## 配置

在启动 dsh **之前**设置环境变量：

```bash
# Linux / macOS
export LEXIANG_TOKEN="lxmcp_xxxxxxxx"
export COMPANY_FROM="your_company"
```

```powershell
# Windows PowerShell
$env:LEXIANG_TOKEN="lxmcp_xxxxxxxx"
$env:COMPANY_FROM="your_company"
```

可选变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `LEXIANG_MCP_URL` | `https://mcp.lexiang-app.com/mcp` | 自定义 MCP 端点 |
| `LEXIANG_TIMEOUT_MS` | `30000` | 单次请求超时 |

> 401 时不要改代码——打开 <https://lexiangla.com/mcp> 点「续期」即可，原 token 恢复有效。

## 安装

```bash
# 从本地目录安装到 web profile
dsh plugin --profile web add /绝对路径/dsh-lexiang

# 验证已写入配置树
dsh --profile web --dump-config | grep dsh-lexiang
```

安装后**重启 dsh 服务**（刷新浏览器不会加载新插件）。

桌面端请用「设置 → 插件」管理器安装，`profile "desktop"` 不接受命令行写入。

## 使用

重启后在会话里直接让模型调用，例如：

- 「搜索知识库里关于 ServerMon 部署的内容」
- 「读取这个页面：https://lexiangla.com/pages/xxxx」
- 「在知识库 `<parent_id>` 下创建一页，标题《测试》，内容是……」
- 「检查乐享连接状态」

## 自测

不需要真实 token，验证 MCP 协议链路：

```bash
node selftest.mjs
```

预期输出 `7 passed, 0 failed`。

## 实现说明

- 乐享走 MCP 协议（streamable-http / JSON-RPC 2.0），插件内置轻量客户端，零第三方运行时依赖
- 同时兼容 JSON 与 SSE 两种响应体
- 工具调用经 `call_tool` 代理到乐享业务工具（`search_kb_embedding_search` / `entry_describe_ai_parse_content` / `block_update_page` 等）
- 输出自动截断，避免长文档撑爆模型上下文
- 所有错误返回 `{ok:false, error, code}` 结构化对象，模型能自行判断和提示

## 许可

MIT
