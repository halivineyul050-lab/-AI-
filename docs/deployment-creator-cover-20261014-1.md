# 个人主页封面加载修复发布

- 发布 creator-cover-20261014-1，2026-10-14 11:44:08 +08:00，现有release-production.sh成功。
- 基底link-center-20261014-1，完整646文件，只改public/creator.js和creator.html。
- SHA256 4ce9856c5f0bfe8227665176942e99e21a0a4523b773ab80d89e4dfd6c8f6daa，上传一致。
- 根因：微信图床收到本站Referer时，对两张地址均返回相同2090字节占位图；无Referer时返回正常原图。保存数据仍为微信外链，不是前端数据缓存。
- 修复：图片设置src前指定referrerPolicy=no-referrer，仅限个人主页图片；该页脚本缓存版本更新为20261014-cover-1，未修改用户内容或配置。
- 真实线上浏览器：新上下文、未拦截或替换脚本，加载新版JS；两张微信图片请求均无Referer、正常解码为1080×463和1080×608。第三条视频image为空，保留原占位。第一篇OpenClaw目前填的是Manus图片，已告知用户，不擅自替换。
- 线上JS响应SHA b32cbe00696728e8ce92e6a476a39d044eaa60190f37fae11dd031b0462fbb8e，与候选一致；service active，ready database=true。
- 本机593项590通过3环境跳过，服务器593全部通过；278个JS语法检查及logos138/138/138通过。
- 代码备份 /opt/nikai-ai-backups/releases/previous-20261014-114231-creator-cover-20261014-1
- 数据库备份 /opt/nikai-ai-backups/mariadb/nikai-ai-20261014-114358-2183314.sql.gz；无迁移。
- 截图docs/design-previews/20261014-creator-cover-live.png；临时包/快照/日志已清理，本机隔离目录移入回收站。
