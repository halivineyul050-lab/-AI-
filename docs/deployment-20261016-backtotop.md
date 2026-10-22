# 向上箭头按钮发布记录

- 发布 ID：`backtotop-20261016-1`。
- 完成时间：2026-10-16 17:57:37（Asia/Shanghai）。
- 目标：`admin@47.93.245.219`，站点 `https://ontimo.cn/`。
- 通道：已配置 SSH 身份、严格主机指纹校验；调用服务器现有 `/opt/nikai-ai/scripts/release-production.sh`。
- 基底：线上 `nestudio-history-20261016-1` 完整源码快照，排除环境凭据、数据库、用户内容、依赖和 Git 目录。仅叠加本次按钮代码及缓存版本，未发布工作区其他差异。
- 文件：`public/index.html`、`public/app.js`、`public/styles.css`、`public/assets/css/site/site-overlays.css`。
- 功能：右下角纯向上箭头；下滑一屏后显示，点击平滑置顶；支持键盘和减少动态效果偏好。
- 资源版本：`20261016-backtotop-1`。
- 发布包 SHA-256：`05b2dc40fbec83ebf0efde8164bf97fae785f5c1a2ebb3f878c4d6686453fcb4`，本地与上传后摘要一致。
- 本地预检：Node v22.18.0；120 个前端脚本及服务入口语法检查通过；全量测试 733 通过、3 跳过、0 失败；138 个图标校验通过。
- 服务器预检：736 项测试全部通过，无跳过；未新增数据库迁移。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261016-175403-backtotop-20261016-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-175727-2294835.sql.gz`。
- 服务：`nikai-ai.service` 为 `active`；服务器本地健康接口正常；release history 标记 `success`。
- 公网验证：Chrome 实际加载页面及三个版本化资源均为 HTTP 200；浏览器请求健康接口 HTTP 200、`database=true`；1440px 和 390px 下均验证顶部隐藏、下滑显示、无可见文字、实际点击回到顶部；页面 JavaScript 错误为 0。
- 验证说明：本机 curl 访问公网 HTTPS 出现连接重置，已通过真实浏览器独立验证上述公网结果；后台标签暂停滚动动画，最终交互验收使用独立浏览器完成。
- 清理：已关闭验证标签并清除服务器临时基底归档。本地 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-backtotop-20261016` 及本次发布归档、日志暂留，删除操作被自动审批以 `blocked by policy` 拦截，未提供具体原因；不影响已完成的生产发布。
