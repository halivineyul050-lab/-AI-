# 收款码预览与保存确认

- 发布recharge-preview-20261013-1；基底recharge-save-20261013-1，仅admin.html、admin-recharge.js、admin-recharge.css变化。
- 选图立即显示本地预览，说明尚未上传；独立上传后说明已上传；配置保存成功显示绿色确认并滚动到提示，错误为红色；刷新后从受权限保护的服务器资产显示已保存收款码。
- 预览限制PNG/JPEG/WebP及2MB，FileReader异步结果检查选择版本和DOM连接状态，避免后返回的旧图片覆盖当前选择；动态文案textContent。
- 真实浏览器：选图预览naturalWidth>0、data URL；保存后绿色rgb(22,104,74)确认且图像状态已保存；刷新后二维码仍可见，无页面错误。
- 本地完整测试538通过3跳过；服务器541/541通过；定向9/9通过，JS语法及138logo校验通过。
- 包SHA256：1d2016e117b6d03dccd7fefc9bf975a8418fa216d94515991f6595ef4967caeb，上传后相同。现有release-production.sh发布，无新增迁移，生产收款配置与用户数据保留。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-114557-2118403.sql.gz。
- 公网admin引用20261013-preview-3 JS/CSS，资源包含新预览与绿色确认逻辑；服务active、ready.database=true。

成功时间2026-10-13 11:46:07 +08:00；回滚快照：/opt/nikai-ai-backups/releases/previous-20261013-114454-recharge-preview-20261013-1。
