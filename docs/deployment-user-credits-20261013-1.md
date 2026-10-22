# 账号积分列 — 发布记录

- 发布 ID：user-credits-20261013-1；成功时间：2026-10-13T13:45:02+08:00。
- 基底：category-tabs-20261013-1，仅修改 backend/auth.mjs、public/admin.js、public/admin.html、缓存版本测试，并新增账号积分接口测试。
- 账号后新增积分列，可用=余额-冻结，下面显示冻结积分。无钱包显示 0，列表读取不创建钱包或发放奖励；仅现有超级管理员权限可访问。
- 测试：先确认缺少 credits 字段失败，再实现通过；验证冻结计算、空钱包归零、读取无修改、更新后刷新、游客/普通用户/普通管理员拒绝访问。本地 543 通过/3 环境跳过，服务器 546 全部通过；JavaScript 语法及 138 个 Logo 验证通过。
- 浏览器：本地真实超级管理员 Cookie 登录，表头6列、620可用/40冻结、零余额、刷新均正常；桌面截图确认布局。移动端保留现有表格横向滚动。
- 公网验证：服务 active，就绪 status=ok/database=true，新 admin.js 缓存引用有效，公网脚本哈希与候选一致；未登录账号列表接口为401。
- 生产 MariaDB 只读验证：7 个账号的 credits 字段均为有效整数，可用计算正确，未输出账号身份或修改钱包。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261013-134350-user-credits-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-134453-2133333.sql.gz。
- SHA256：e8d9342d97863e5496073bbd588b8eed28500c5cebf60e613b8184f0092e015d。
