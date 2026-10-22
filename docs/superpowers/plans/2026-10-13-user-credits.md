# 账号积分显示实施计划

**Goal:** 在账号权限列表显示每个账号的可用和冻结积分。
**Architecture:** backend/auth.mjs 的 listUsers 查询连接 credit_wallets，返回 credits={balance,frozen,available}；admin.js 渲染积分列，admin.html 增加表头并更新缓存。
**Tech Stack:** Node、SQLite/MariaDB、原生 JavaScript。

- [x] 从当前生产版制作隔离候选目录。
- [x] 添加真实账号接口测试，验证冻结扣除、无钱包归零、读取无写入、权限隔离及刷新。
- [x] 修改查询和列表渲染，更新缓存版本测试，验证浏览器显示。
- [x] 运行语法、Logo、完整测试，按唯一正式发布通道上线。
- [x] 验证公网资源、服务、API只读安全，记录版本及备份。

