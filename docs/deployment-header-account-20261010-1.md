# 首页登录状态同步修复发布记录

- 发布：`header-account-20261010-1`，`2026-10-10T10:02:03+08:00`。
- 目标：`admin@47.93.245.219`、[ontimo.cn](https://ontimo.cn/)，复用已授权 SSH 身份并严格核验主机，通过服务器现有 `release-production.sh` 发布。
- 问题：登录成功返回首页后，导航仍显示“登录”。首页改版新增的是静态链接，未读取账号会话。
- 真实流程检查还发现：生产 auth.js 无条件给不存在的 admin-account-form 绑定事件，在注册初始化处理器前抛出异常，导致登录后的账号页不能自动展示当前账号。

## 修复范围

7 个审阅文件：新增 `public/header-account.js`、`tests/header-account.test.mjs`、`tests/auth-page-initialization.test.mjs`；修改 `public/index.html`、`server.mjs`、`public/auth.js`、`public/auth.html`。

首页独立脚本通过原有 `/api/v1/auth/me` 读取 HttpOnly Cookie 会话，成功时显示“账号中心”，401 时显示“登录”；使用 same-origin 凭据和 no-store。浏览器从缓存返回或切回可见标签时重新核实状态，网络失败保留最后确认的显示状态。脚本加载在外部图标脚本前，状态显示不依赖图标库。账号入口仍链接到 `/auth.html`，昵称只用于无障碍标签。

账号页仅给可选管理员表单的事件绑定添加存在检查，更新 auth.js 缓存版本为 `20261010-account-1`。没有改变认证策略、Cookie、管理员权限、数据库或其他用户功能。新增脚本由静态白名单提供。

以当前生产 `tools-page-10-20261010-1` 完整源码为基底，快照 SHA-256 `e3f2663f93e1aa37cce4e635c4c2d4f6c8052a4110f99ea1d0bf908a8c4346a7`。发布包逐文件核验非审阅文件与基底相同，未带入脏工作区其他改动。

完整包 619 文件、26,121,107 字节，SHA-256 `51c4513e6589d0aa420d2bb1398fe3786dd26f51cbc65e402dd2bcbca9c8614a`，上传前后相同。保留 `.env.example`，排除真实配置、密钥、数据库、用户内容、node_modules、.git。

## 验证

- 两处问题均先复现回归失败，再修复通过；新增 6 项行为测试及既有认证跳转测试通过。
- Node v22.18.0，与生产一致；npm ci 成功；server 和 96 个前端脚本语法检查通过；完整候选 366 通过、3 项平台条件跳过、0 失败；138 个 Logo 校验通过。
- 本地独立数据库使用临时测试账号及真实会话 Cookie，通过页面表单登录，返回首页显示“账号中心”；点击后展示真实账号；退出后显示“登录”；退出后通过浏览器后退返回也显示“登录”。修复后整个流程无页面脚本异常。
- 本地预览 Origin 明确配置为独立预览端口；测试账号、数据库均仅用于本地，没有创建生产账号，也未读取、打印用户密码或会话令牌。
- 服务器干净暂存目录再次验证：369 测试通过、0 跳过、0 失败；无新增数据库迁移；发布为 success、服务 active。
- 公网及服务器就绪接口均 HTTP 200、database=true；首页、新脚本、账号页及新版 auth.js 均 HTTP 200；线上五个关键文件摘要与候选相同。
- 公网 Edge：真实匿名状态显示“登录”；以受控 `/auth/me` 成功响应验证发布后的首页显示“账号中心”；移除受控响应后，实际公网账号页初始化正常，没有页面脚本异常。公网受控检查仅验证显示，不代表读取了用户当前会话；实际 Cookie 登录/退出流程在本地同一完整候选中验证。
- 尝试读取应用内浏览器的新建临时验证标签时工具超时，未操作用户原有标签；改用已有 Playwright 验证环境完成公网检查。

截图已打开检查：`C:/Users/zhanglian2/.codex/visualizations/2026/10/09/01a12039-11ee-77b2-afb8-0710bb68ffd9/header-account-local-20261010.png`（本地真实会话）及 `header-account-production-ui-20261010.png`（公网受控会话显示检查，已关闭原有公告）。

## 备份和收尾

- 已核验回滚目录：`/opt/nikai-ai-backups/releases/previous-20261010-100112-header-account-20261010-1`。
- 已核验数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-100156-1971239.sql.gz`。
- 如需回滚，按 `docs/production-release.md` 使用现有 `rollback-production.sh`。
- 候选预览服务、独立验证浏览器均已关闭；上传包由发布脚本删除，服务器基底快照已删除。本次本地临时目录 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-header-account-production-20261010-1` 已移至 Windows 回收站，原路径不存在，可恢复。
