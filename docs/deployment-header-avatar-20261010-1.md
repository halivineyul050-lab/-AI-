# 首页账号默认头像发布记录

- 发布 ID：`header-avatar-20261010-1`。
- 成功时间：`2026-10-10T10:17:06+08:00`。
- 目标：`admin@47.93.245.219`、https://ontimo.cn/；严格 SSH 主机核验，通过服务器现有 `release-production.sh` 发布。

## 原因及改动

当前账号接口没有头像图片字段，首页上一版仅将“登录”替换为“账号中心”，未渲染头像。本次给已登录账号显示昵称首字的紫色圆形默认头像，点击进入原有账号中心；手机端保留头像、隐藏文字。退出登录或会话失效时清除头像。昵称通过 textContent 写入，支持 Unicode 首字和空昵称回退；不改变登录、权限、数据库或会话策略，也未新增照片上传功能。

仅审阅和发布 4 个文件：`public/header-account.js`、`public/assets/css/site/site-homepage.css`、`public/index.html`（两处资源缓存版本更新）、`tests/header-account.test.mjs`。工作区有无关改动，因此以当前生产 `header-account-20261010-1` 完整源代码为基底，逐文件确认其余文件与基底相同。

基底快照 SHA-256：`aaadf6f45710b375fe0e5a39cf3f799aaeca00ad0581e9f9efa0aa572e771b9f`。
完整包：619 文件、26,121,660 字节；SHA-256 `c11275e1b569dc4581967ffe17106ff54030ca0bb2b8fa49396020fd0df659c9`，上传前后相同。保留 `.env.example`，排除真实配置、密钥、数据库、用户内容、node_modules、.git。

## 验证证据

- 新头像行为先验证旧版测试失败，修改后 7 项首页账号测试通过，包括登录显示、匿名显示、注销清除、标签恢复、网络失败保持、Unicode 和空昵称。
- Node v22.18.0 与线上一致；npm ci、服务入口和 96 个前端脚本语法检查通过；本地完整套件 368 通过、3 项平台条件跳过、0 失败；138 个 Logo 校验通过。
- 独立本地数据库的真实注册、Cookie 会话、表单登录、点击头像进入账号中心、退出登录后首页清除头像均通过，无页面脚本异常。没有创建生产测试账号或读取用户密码、会话令牌。
- 浏览器宽度 1672、1366、1024、390、320 检查：头像可见，无页面和导航横向溢出；桌面头像 32px、手机 28px。
- 服务器干净暂存目录重复检查：371 测试全部通过、0 跳过、0 失败；没有新增迁移，发布记录 success、服务 active。
- 公网和服务器就绪接口 HTTP 200、database=true；新版首页、脚本及样式均 HTTP 200，缓存版本 `20261010-avatar-1`。服务器 4 个改动文件及公网脚本、样式摘要与候选一致。
- 公网真实匿名状态显示“登录”、无头像；受控 auth/me 成功响应显示昵称首字头像，手机端头像可见且无溢出。移除受控响应后真实账号页初始化正常，无页面脚本异常。受控响应只验证显示，不代表读取用户真实线上会话；真实登录链路已在同一候选的本地环境验证。
- 桌面、手机本地真实会话截图及公网受控手机截图均已打开检查，保存在 `C:/Users/zhanglian2/.codex/visualizations/2026/10/09/01a12039-11ee-77b2-afb8-0710bb68ffd9/`，文件分别为 `header-avatar-local-desktop.png`、`header-avatar-local-mobile.png`、`header-avatar-production-mobile-controlled.png`。

## 备份和收尾

- 已核验回滚快照：`/opt/nikai-ai-backups/releases/previous-20261010-101615-header-avatar-20261010-1`。
- 已核验数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-101659-1973344.sql.gz`。
- 回滚遵循 `docs/production-release.md`，调用现有 `rollback-production.sh`。
- 本次独立预览服务和验证浏览器已关闭；上传包由发布脚本删除，远程基底快照已删除。本地临时目录 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-header-avatar-production-20261010-1` 已移至 Windows 回收站，原路径不存在，可恢复。
