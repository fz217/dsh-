# 基础工具插件脚手架

复制本目录到 `plugins/<类别>/<插件名>/`，然后：

1. `package.json` 改名，声明 `dsh.bundle.patch` 指向 `./cordis.patch.yml`
2. `cordis.patch.yml` 写入插件 id
3. `index.js` 导出 `name`、`inject = ['tools']`、`apply(ctx)`
4. 用 `ctx.tools.register(defineTool({...}))` 注册工具
5. `selftest.mjs` 用 mock 验证，不依赖真实凭据

最小入口：

```js
export const name = 'dsh-my-plugin'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'my_tool',
    description: '说明',
    parameters: {},
    async execute() { return { ok: true } },
  }))
}
```
