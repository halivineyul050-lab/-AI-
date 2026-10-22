# 发布记录：前端基础统一

- 发布 ID：`frontend-foundation-20260929-1`
- 发布时间：2026-09-29 16:01（Asia/Shanghai）
- 变更范围：统一全站设计 token；按职责拆分主站 CSS；集中生成 20 个页面的导航；抽出视频裁剪/遮挡共用框选样式；更新静态资源白名单和前端结构文档。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20260929-160055-frontend-foundation-20260929-1`
- 发布结果：服务器现有 `release-production.sh` 返回成功；`nikai-ai.service` 为 `active`；就绪接口返回 `status=ok`、`database=true`。
- 检查结果：Node 22.18.0；本机 `npm ci` 成功；JS/MJS 语法检查通过；本机完整测试 326 项通过、0 失败、2 项跳过；服务器干净暂存目录测试 328 项通过、0 失败；Logo 校验 138/138。
- 线上验证：从服务器请求公网 HTTPS，健康接口、首页、认证/后台页、视频裁剪/遮挡页、五个站点 CSS 模块及 `video-frame.css` 均返回 HTTP 200。浏览器加载首页成功，点击“AI 视频”后进入 `/category/video`，结果卡片均为视频类。
- 发布包 SHA-256：`5a5537dd37412d5ffa31d246991529f5f525c4e815ceeeefe95baece4e070849`