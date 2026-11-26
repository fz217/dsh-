# dsh-lexiang 插件仓库

DeepSeek Harness（dsh）插件集合。主插件见 [`dsh-lexiang/`](dsh-lexiang/README.md)。v1.2.0 集成乐享目录侧栏：浏览个人与团队知识库、打开原文并搜索。

## 仓库结构

```
.
├── dsh-lexiang/            # 已发布插件：乐享知识库（v1.1.0，9 个工具 + UI 弹窗）
├── plugins/                # 后续插件统一入口，按类别分级
│   ├── knowledge/          # 知识库 / 文档类
│   ├── media/              # 图像 / 视频 / 音频类
│   ├── ai/                 # 大模型 / 推理 / ComfyUI 类
│   ├── devops/             # 运维 / 监控 / 服务器类
│   └── utility/            # 通用工具类
├── templates/              # 插件脚手架：basic-tool / with-ui
├── docs/                   # 开发文档、指南、示例
├── scripts/                # 通用脚本与发布工具
├── tests/                  # 跨插件测试与验收脚本
├── package.json            # 仓库级 dsh.bundle 声明（列表收录校验用）
└── fz217__dsh-.yml         # awesome-dsh-plugin 投稿条目
```

## 历史说明

`dsh-lexiang/` 是首个插件，按早期约定放在仓库根目录，**不发生迁移**，保证已安装的引用不断链。
从第二个插件起，一律放进 `plugins/<类别>/<插件名>/`，便于后期扩展。

## 快速开始

```bash
git clone https://github.com/fz217/dsh-.git
cd dsh-/dsh-lexiang
node selftest.mjs        # 17/17 通过
dsh plugin --profile web add .
# 重启 dsh 服务
```

环境变量：`LEXIANG_TOKEN`、`COMPANY_FROM`（在 https://lexiangla.com/mcp 获取）。

## 许可

MIT
