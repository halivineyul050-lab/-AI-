# 生图历史工作台按钮调整

- 发布：account-image-button-20261010-1，2026-10-10 15:19:36 +08:00，success。
- 范围：仅 public/auth.css、public/auth.js、public/auth.html。为生图工作台入口设置独立样式，避免历史记录通用背景覆盖；文字居中，约40px高，紫色文字和浅色圆角背景。更新CSS/JS缓存版本。
- 完整630文件发布包基于当前生产快照，仅叠加上述三个文件，SHA-256：84721758d4eb7e9a96027b109576dce95faec1ed1ffc758779468c285136aa60。上传摘要一致，线上三个文件摘要均符合清单。
- 验证：npm ci、全部JavaScript语法检查、404项测试（本机401通过/3环境跳过，服务器404全部通过）、138项logo校验。浏览器电脑/手机尺寸入口约124×40px、文字居中，点击进入/image-generation。公网账号页面采用隔离浏览器模拟只读登录响应验证，不使用真实账号或用户数据。
- 服务active；内网与公网就绪接口HTTP200、database=true。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261010-151841-account-image-button-20261010-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-151929-1999905.sql.gz。
