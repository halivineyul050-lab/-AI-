# 生产发布记录：生图选项标签换行修复

- 发布编号：image-toolbar-wrap-20260930-3
- 发布时间：2026-09-30 10:37:47（Asia/Shanghai）
- 发布目标：https://ontimo.cn
- 发布包 SHA-256：db964d46f29299509770665d474217299844d4f542adaa430412be4961cc7388（25,245,992 字节）
- 发布方式：通过已授权 SSH 上传完整包，并调用线上现有 /opt/nikai-ai/scripts/release-production.sh。

## 发布内容

从线上当前完整版本制作发布包，只覆盖 public/image-generation.css 和 tests/image-generation-placeholder.test.mjs。另带上经过检查的非密钥示例配置 .env.example 与 138 个站点目录 Logo 静态资源（logos:verify 核验为 138 条记录、138 个资源、138 个唯一哈希）。没有包含 .env、.mariadb.cnf、数据库、用户上传目录或 node_modules；旧部署工作流文件也没有打入包。

## 验证

- 完整发布包隔离安装后运行 329 项测试：329 通过，0 失败，0 跳过；依赖审计为 0 个漏洞。
- 发布后 nikai-ai.service 为 active；就绪接口返回 status=ok、database=true。
- 线上生图页面返回 HTTP 200；实际提供的样式表包含平板宽度工具栏换行规则和标签禁止折行规则。
- 前两份候选包因静态目录素材和示例配置缺失而在发布前预检失败，生产目录未切换；修正后第三份完整包通过全部测试并发布成功。
- 重启中的一次即时探测早于服务重新监听；发布后服务、就绪接口和页面资源均验证通过。

## 备份与回滚

- 发布前代码快照：/opt/nikai-ai-backups/releases/previous-20260930-103702-image-toolbar-wrap-20260930-3
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-103740-1812395.sql.gz
- 发布历史记录为 success，编号 image-toolbar-wrap-20260930-3。
