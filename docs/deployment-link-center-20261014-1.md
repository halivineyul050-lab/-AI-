# 分享链接提取页面居中发布

- 发布 link-center-20261014-1，2026-10-14 11:34:04 +08:00，成功。
- 基底 douyin-public-20261014-1；完整646文件，只修改该页CSS与HTML缓存版本两个文件。
- SHA256 5d7585b1f22ee70ff4cc616be8a24926a727e3aa4e781574205b6a76f90b2762，本机与服务器一致。按现有 release-production.sh 发布。
- 修复：仅给该页主内容区域增加 margin-inline:auto，保持1280px最大宽度、内部文本对齐和现有配色；未修改公共主题或解析逻辑。
- 浏览器真实线上：HTTP200，CSS版本20261014-center-1；1980宽左右350px，390宽卡片左右14px、无横向溢出，pageerror=0。
- 线上CSS内容SHA912091a503603284a6c054f5dd9751b2c896adf7d38b72ea3a3dfda179aa3a77，与候选一致。
- 本机593项590通过3环境跳过；服务器593全部通过。278个JS语法检查与logos138/138/138通过。
- 代码备份 /opt/nikai-ai-backups/releases/previous-20261014-113242-link-center-20261014-1
- 数据库备份 /opt/nikai-ai-backups/mariadb/nikai-ai-20261014-113354-2180573.sql.gz，无迁移。
- service active，ready HTTP200/database=true。已归档截图、清单，并清理本次临时服务和发布文件。
