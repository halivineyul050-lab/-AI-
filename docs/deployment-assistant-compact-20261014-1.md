# 小助手紧凑尺寸发布

- 发布 assistant-compact-20261014-1，2026-10-14 10:42:17 +08:00，成功。
- 基底 assistant-reference-20261014-1，完整641文件，仅5个审阅文件（assistant.css/js、server.mjs、2个对应测试）变化。
- SHA256 9816bc3e6f8b84e4a038de700b1bd175376115078ef20e82bde987ca96a07edd，上传一致。
- 现有正式 release-production.sh 发布；主机已核验 admin@47.93.245.219。
- 代码备份 /opt/nikai-ai-backups/releases/previous-20261014-104058-assistant-compact-20261014-1
- DB备份 /opt/nikai-ai-backups/mariadb/nikai-ai-20261014-104208-2172008.sql.gz
- 桌面最大520x480，相比原960x520面积缩小50%；机器人84x100移到卡片内，文字与按钮同步缩小，快捷提问竖排。保留聊天、停止、重置和拖动。
- 浏览器1488x886：卡片520x480，占视口19%，内部无横向溢出。手机390x844：卡片366x480，页面宽390无溢出。截图 docs/design-previews/20261014-assistant-compact-desktop.png 与 mobile.png。
- 本地586测试：583通过、3环境跳过；服务器586全部通过。JS检查及logos138/138/138通过。
- 线上首页已引用20261014-compact-1，CSS/JS均HTTP200且SHA与候选匹配；service active、health ready正常。
- 无配置/数据迁移或模型改动，已清理本次临时服务和发布包。
