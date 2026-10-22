# 生图结果点击预览发布记录 · 2026-09-29

## 发布结果

- 线上地址：`https://ontimo.cn/image-generation`
- 发布版本：`image-preview-20260929-1`
- 发布时间：`2026-09-29T13:50:46+08:00`
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20260929-135000-image-preview-20260929-1`
- 发布方式：沿用既有 SSH 通道，将线上当前完整版本取回为发布基底，只叠加本次预览改动，再执行 `/opt/nikai-ai/scripts/release-production.sh`。

## 变更与验证

- 生图结果图和历史图片均可点击打开大图预览。
- 支持关闭按钮、点击遮罩和 Esc 关闭；关闭后清理预览图片引用。
- 更新 HTML 静态资源缓存版本，保留线上导航和其他页面内容。
- 发布前完整测试：327 项通过，0 失败。
- 发布后 `nikai-ai.service` 为 `active`，就绪接口返回 `status=ok`、`database=true`。
- 线上页面与 JS、CSS 均返回 HTTP 200，页面引用新缓存版本，资源包含预览控件。
- 发布后关键文件 SHA-256：

```text
image-generation.html  692c6ec8e994e5d61697896bdc18934bc84b348291184ec053205df82aa8262e
image-generation.css   0b1cf42e9f3216080ddb06f444293627ee8396670c505ee78b13430f878b6ec5
image-generation.js    de9243c5334cdf8fdeeb4382f8ec16a1a632309db22dac3174a90879b5b1c511
```
