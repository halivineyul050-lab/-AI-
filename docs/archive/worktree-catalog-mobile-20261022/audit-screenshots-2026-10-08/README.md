# 审计截图

这些截图由 2026-10-08 的临时本机测试应用生成，数据来自新建的隔离 SQLite 测试库。它们不是生产站截图。

- `home-desktop.png`：首页，1440×1000。
- `home-mobile.png`：首页，390×844；可见顶部横向溢出/右侧控件裁切。
- `home-mobile-emulated.png`：后续使用 Chromium 移动设备视口（390×844）复核；页面宽度与主控件均在视口内。原图裁切来自截图窗口尺寸与 CSS 视口不一致。
- `admin-desktop.png`：后台入口，1440×1000；未认证时显示登录门槛。

请求延迟、访问控制对比和截图环境摘要见 `../audit-interface-evidence-2026-10-08.json`；总审计见 `../full-audit-2026-10-08.md`。
