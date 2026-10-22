# 生产发布记录：生图样式缓存版本更新

- 发布编号：image-toolbar-wrap-20260930-4
- 发布时间：2026-09-30 10:48:11（Asia/Shanghai）
- 发布目标：https://ontimo.cn
- 发布包 SHA-256：4b5f770913e945e9f81020abf302f5094d60df4a39009d635455e72b468ea1e1（25,246,059 字节）
- 发布方式：以已成功发布的 image-toolbar-wrap-20260930-3 完整版本为基底，只更新生图页 CSS 资源版本引用和对应测试；通过现有生产发布脚本发布。

## 验证

- 完整包运行 330 项测试：330 通过，0 失败，0 跳过；依赖审计为 0 个漏洞。
- 服务为 active；就绪接口返回 status=ok、database=true。
- 生图页返回 HTTP 200，并引用 /image-generation.css?v=20260930-image-toolbar-wrap-4。
- 该版本 CSS 已在线提供平板宽度换行规则，浏览器不会再沿用旧 URL 缓存的样式。
- 发布历史记为 success。

## 备份与回滚

- 发布前代码快照：/opt/nikai-ai-backups/releases/previous-20260930-104726-image-toolbar-wrap-20260930-4
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-104804-1814550.sql.gz
