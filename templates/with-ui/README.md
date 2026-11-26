# 带 UI 插件脚手架

在基础工具插件之上增加弹窗通道，参考 `dsh-lexiang/src/ui.js` 与 `ui-server.js`：

1. `buildPopupHtml()` 生成自包含 HTML（内联 CSS/JS，文本做 HTML 转义）
2. `openPopup()` 写临时文件并调系统默认浏览器打开，不启 shell
3. `ctx.inject(['webServer'], scoped => scoped.effect(...))` 挂载站内路由
4. 无 webServer 时自动降级为独立浏览器弹窗
5. 令牌只在服务端，不写进网页或 JSON 数据块

必要安全项：

- 动态文本必须 `esc()`，内联 JSON 必须转义 `<` `>` `&`
- 路由统一命名空间，例如 `/api/dsh-<name>/...`
- 状态接口返回脱敏后的令牌掩码，不返回原文
