# 生产发布记录：用户端页面统一改版

- 发布编号：`frontend-unified-20260930-1`
- 发布时间：2026-09-30 09:57:24（Asia/Shanghai）
- 发布目标：`https://ontimo.cn`
- 发布包 SHA-256：`8814b3289a1b1134eff73e3b3a2773c35f7d4d7338d0d2b6eeb0266d8635d830`（25,302,750 字节）
- 发布方式：按 `docs/production-release.md` 制作完整发布包，并调用服务器现有 `/opt/nikai-ai/scripts/release-production.sh`。

## 本次内容

只发布本次审阅过的 50 个文件：48 个 `public/` 用户端页面与样式文件，以及 2 个用于校验资源版本号的测试文件。覆盖首页目录、工具与游戏页面、账号页和共享导航等用户端体验。没有包含工作区其他未审阅改动、环境配置、数据库、用户内容或 `node_modules`。

## 发布与验证

- 服务器发布脚本完成干净目录安装和完整测试：328 项通过，0 项失败，0 项跳过；依赖审计报告 0 个漏洞。
- `nikai-ai.service` 状态为 `active`；线上就绪接口返回 `status=ok`、`database=true`。
- 从生产主机经 HTTPS 检查了 25 个用户端页面路径和 22 个更新后的 CSS 资源 URL，全部返回 HTTP 200。
- 线上浏览器打开首页，确认新版主标题、搜索、分类热词、目录统计、核验说明和精选工具区正常渲染；浏览器错误和警告日志为空。
- 发布脚本重启期间有一次即时探测遇到端口尚未监听；脚本随后完成，发布后服务状态、就绪接口和页面检查均通过。

## 备份与回滚

- 发布前代码快照：`/opt/nikai-ai-backups/releases/previous-20260930-095637-frontend-unified-20260930-1`
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20260930-095717-1805113.sql.gz`
- 发布历史记为 `success`，编号 `frontend-unified-20260930-1`。
