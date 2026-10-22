# 后台导航与样式统一发布

- 发布：admin-unify-20261013-1，2026-10-13 18:40:39 +08:00，成功。
- 基底：tools-five-20261013-1。完整包635文件，仅6个审阅文件变更。
- SHA256：04efe120ae946457b6cabe290722fecc25cb43dc04b8e150db400405c2b16f83；上传后完全一致。
- 主机：已核验 admin@47.93.245.219，iZ2ze0zvyl3al5cbqnk5fwZ。
- 通过现有 /opt/nikai-ai/scripts/release-production.sh 发布；未直接编辑线上目录。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261013-183924-admin-unify-20261013-1
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-184030-2154038.sql.gz

## 变更

导航及正文统一四组：数据监控、内容运营、充值与积分、系统配置。充值与积分移入 page-content。统一模块白色卡片、24px标题、间距、圆角按钮与输入。保留原表单字段、权限、所有 API 和配置值。导航高亮按实际位置判断，排除权限隐藏的模块；手机静态顶部工具栏滚出时，跳转不会使用负偏移量。

## 验证

- 本地574测试：571通过、3环境跳过；服务器574全部通过。
- 全部 JS 语法检查通过；logos 138/138/138。
- 合成管理员本地浏览器，15个菜单逐项点击与唯一选中匹配；滚动由积分返回充值时高亮充值。
- 手机390px：内容、充值、积分、小助手、概览点击后定位top104px，文档宽390px无溢出。
- 测试隐藏权限模块不参与选择、菜单顺序与正文一致；历史导航与底部短模块回归通过。
- 真实HTTPS /admin 的15模块同序、JS版本及JS/CSS内容哈希正确；CSS引用仍沿用旧缓存号，随后由 admin-unify-20261013-2 修正。
- 服务active；/api/v1/health/ready status=ok、database=true。
- 截图 docs/design-previews/20261013-admin-unify-desktop.png 和 20261013-admin-unify-mobile.png。
