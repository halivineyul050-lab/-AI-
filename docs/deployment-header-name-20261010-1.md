# 导航栏显示账号名称

- 发布：header-name-20261010-1，2026-10-10 15:32:57 +08:00，success。
- 头像旁固定“账号中心”改为账号displayName，空名称回退“用户”。保留头像和账号中心链接，名称通过textContent渲染。长名称限制120px并省略，title保留完整名称。
- 范围：header-account.js、site-header.css、20个页面资源缓存版本、导航生成器和现有header-account行为测试，共24文件。完整630文件包以当前生产快照为基底，仅叠加审阅内容。
- 发布包SHA-256：0a1dd6d52f2ec63aa329fbda728fca4ac28b1c6c48aa235182d5a93ed3dc7211；上传一致，24个线上文件摘要与发布清单一致。
- npm ci、全JS语法检查、404测试（本地401通过/3环境跳过；服务器404全部通过）、138项logo校验通过。隔离浏览器模拟只读登录响应核实943px和1440px窗口的名称、头像、账号链接，以及长名称省略和完整title；真实公网页面显示账号名称。未使用真实账号数据。
- 服务active，内网/公网就绪接口HTTP200，database=true。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261010-153201-header-name-20261010-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-153249-2003914.sql.gz。
