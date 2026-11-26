# dsh-lexiang

DeepSeek Harness 插件：连接乐享知识库，**v1.1.0 起自带 UI 弹窗与站内控制台**。

完整说明与安装步骤见 [`dsh-lexiang/README.md`](dsh-lexiang/README.md)。

## 仓库结构

```
.
├── dsh-lexiang/                  # 插件本体（dsh plugin add 指向这里）
│   ├── index.js
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── README.md
│   ├── LICENSE
│   ├── selftest.mjs
│   └── src/
│       ├── mcp-client.js
│       ├── operations.js
│       ├── ui.js
│       └── ui-server.js
├── package.json                  # 仓库级声明，供插件列表校验 dsh.bundle
└── fz217__dsh-.yml               # awesome-dsh-plugin 投稿条目
```

## 快速开始

```bash
git clone https://github.com/fz217/dsh-.git
cd dsh-/dsh-lexiang
node selftest.mjs

# 设置环境变量后安装
dsh plugin --profile web add .
# 重启 dsh 服务
```

环境变量：`LEXIANG_TOKEN`、`COMPANY_FROM`（在 <https://lexiangla.com/mcp> 获取）。

## 工具

`lexiang_search` / `lexiang_read` / `lexiang_list` / `lexiang_create_page` / `lexiang_update_page` / `lexiang_upload_file` / `lexiang_status` / `lexiang_popup` / `lexiang_ui`。

其中 `lexiang_search`、`lexiang_read` 传 `popup=true` 即弹出可视化结果窗口；`lexiang_popup` 无需乐享凭据即可弹窗。

## 许可

MIT
