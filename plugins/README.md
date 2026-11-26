# plugins · 插件总目录

从第二个插件开始，所有新插件按类别放入本目录：

```
plugins/<类别>/<插件名>/
```

## 已建类别

| 类别 | 用途 | 示例 |
|---|---|---|
| [`knowledge/`](knowledge/README.md) | 知识库、文档、检索 | dsh-lexiang（首个插件仍在根目录） |
| [`media/`](media/README.md) | 图像、视频、音频生成与处理 | ComfyUI、H3、图生图 |
| [`ai/`](ai/README.md) | 大模型、推理服务、Agent | 本地 LLM、模型路由 |
| [`devops/`](devops/README.md) | 运维、监控、隧道、服务器 | ServerMon、frp、iDRAC |
| [`utility/`](utility/README.md) | 通用工具 | 剪贴板、文件批处理 |

## 新插件登记

每个插件目录至少包含：

- `README.md` — 工具清单、环境变量、安装与自测
- `package.json` — 必须声明 `dsh.bundle.patch`
- `cordis.patch.yml` — Cordis 挂载配置
- `index.js` — 导出 `name` / `inject` / `apply(ctx)`
- `selftest.mjs` — 不依赖真实令牌的自测

`_template/` 子目录给出最小骨架，复制后改名即可。
