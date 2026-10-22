# 普通用户账号中心运营入口隐藏修复

- 发布 ID：`account-admin-entry-20261010-1`；成功时间 `2026-10-10T10:28:04+08:00`。
- 目标：`admin@47.93.245.219`、https://ontimo.cn/，严格 SSH 主机核验，通过服务器现有 `release-production.sh` 发布。

## 原因和最终范围

用户澄清需要普通用户在账号中心看不到、点不到“运营中心”入口。本次按这个范围修复，没有变更后台认证策略或任何用户角色。

原账号脚本会设置 admin-entry.hidden，但 auth-secondary 的按钮 display 样式会覆盖浏览器默认 hidden 行为，账户样式没有自己的隐藏规则，依赖共享样式的 [hidden] !important 规则。浏览器移除共享隐藏规则的受控检查复现：member 返回后，hidden=true，但按钮 computed display=flex 且有可点击尺寸；共享样式正常加载时按钮已隐藏。因此不能以静态 hidden 属性保证旧缓存或共享规则不可用时的入口隐藏。

最终修复：auth.css 显式增加 .auth-secondary[hidden] 的强制隐藏规则，auth.js 确认普通用户后直接移除运营入口节点，管理员仍保留入口。auth.html 更新两处资源缓存版本为 `20261010-admin-entry-1`。相关账号初始化测试新增普通用户移除、管理员保留的行为检查。

仅发布 4 个审阅文件：`public/auth.js`、`public/auth.css`、`public/auth.html`、`tests/auth-page-initialization.test.mjs`。以当前生产 `header-avatar-20261010-1` 的完整源代码为基底，既有文件采取最小补丁；包内其余文件逐文件摘要与基底相同，未带入脏工作区的其他改动。

基底 SHA-256：`0c2fb420f13547001347ac6c86eb20912325e9d461d1a1007cf53d8192353ee6`。
发布包：619 文件、26,121,821 字节；SHA-256 `267f201fbd43c723df2db7372792d99b7b00e18615a8c7dfeff5c6e2ccef2a65`，上传前后相同。保留 `.env.example`，排除真实配置、密钥、数据库、用户内容、node_modules 和 .git。

## 验证

- 先验证普通用户入口未移除的回归测试失败，再修改并通过 3 项账号页初始化行为测试。
- Node v22.18.0 与线上一致；npm ci、服务入口及 96 个前端脚本语法检查通过；本地完整测试 370 通过、3 项平台条件跳过、0 失败；138 个 Logo 校验通过。
- 独立本地数据库真实注册账号返回 role=member，账号中心 admin-entry 节点和 /admin.html 链接数量均为 0，桌面和手机一致，无脚本异常或手机横向溢出。共享隐藏规则被移除时仍符合预期。
- 在同一个独立本地测试数据库中，仅把本次合成测试账号设为 admin，确认账号中心运营入口可见；不修改生产账号权限。未登录情况下移除共享隐藏规则，入口自身仍 computed display=none、尺寸为 0。
- 生产只读角色分组核验：2 个 member，1 个 admin，1 个超级管理员；注册代码默认创建 member。未读取或输出账号密码、会话令牌、管理员令牌。
- 本地普通账号对摘要、工具管理、反馈管理、图片平台管理请求均被拒绝（503，预览未配置共享管理员令牌）；公网真实匿名摘要接口为 401。以上为既有后端校验检查，未宣称验证用户本人的线上会话或改变后台权限。
- 服务器干净暂存目录重复检查：373 测试通过、0 跳过、0 失败；无新增迁移，发布 success，服务 active。
- 公网及服务器就绪接口 HTTP 200、database=true；新版账号页、脚本和样式均 HTTP 200，新缓存版本正确；服务器 4 个变更文件及公网脚本、样式摘要与候选一致。
- 公网受控 auth/me 返回 member 时入口及后台链接数量为 0，手机无溢出；受控返回 admin 时入口可见；移除受控响应后，真实匿名登录页入口不可见。公网受控响应用于显示检查，实际 Cookie 会话和角色读取已在同一候选的独立本地环境验证。
- 已打开检查截图：`account-member-no-admin-entry-local.png`（本地真实普通用户）、`account-member-no-admin-entry-production-controlled.png`（公网受控普通用户显示），位于 `C:/Users/zhanglian2/.codex/visualizations/2026/10/09/01a12039-11ee-77b2-afb8-0710bb68ffd9/`。

## 备份与收尾

- 已核验回滚快照：`/opt/nikai-ai-backups/releases/previous-20261010-102713-account-admin-entry-20261010-1`。
- 已核验数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-102756-1975465.sql.gz`。
- 回滚按 `docs/production-release.md` 使用现有 `rollback-production.sh`。
- 本次独立预览服务和验证浏览器已关闭，远程基底快照已删除，上传包由发布脚本删除。本地临时目录 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-admin-access-production-20261010-1` 已移至 Windows 回收站，原路径不存在，可恢复。
