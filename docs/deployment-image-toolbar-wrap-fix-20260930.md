# 生产发布记录：生图选项标签保持横排

- 发布编号：`image-toolbar-wrap-fix-20260930-5`
- 发布时间：2026-09-30 11:11:11（Asia/Shanghai）
- 发布目标：<https://ontimo.cn>
- 发布包 SHA-256：`CF2348C677CF3510C6146CA149FECD73CC5B1F15FCA07A11FC383661453C645B`（25,258,879 字节）
- 发布方式：以发布前线上完整版本为基底，仅覆盖生图样式、缓存版本引用和对应回归测试，并调用现有生产发布脚本。

## 修复内容

- 修正平板断点媒体查询语法。浏览器此前将规则解析为 `@media not all`，导致工具栏项目被压缩，比例、风格、数量标签拆成竖排。
- 页面引用升级到 `/image-generation.css?v=20260930-image-toolbar-wrap-5`，确保加载修复后的样式。

## 验证

- 隔离完整发布包：330 项测试中 328 项通过、2 项按项目配置跳过，0 失败；138 个 Logo 记录和资源全部核验通过；依赖审计为 0 个漏洞。
- 发布脚本完成干净暂存目录测试，330 项通过，0 失败、0 跳过。
- 服务为 `active`；内网及公网 HTTPS 就绪接口均返回 `status=ok`、`database=true`。
- 线上生图页和版本化 CSS 均已加载。浏览器在 883px 宽视口中确认媒体查询生效、工具栏为 `flex-wrap: wrap`，四个标签均为 `white-space: nowrap`；标签高度从 36.3px 恢复到 18.1px。
- 发布历史记录为 `success`。

## 备份与回滚

- 发布前代码快照：`/opt/nikai-ai-backups/releases/previous-20260930-111025-image-toolbar-wrap-fix-20260930-5`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-111104-1816810.sql.gz`
