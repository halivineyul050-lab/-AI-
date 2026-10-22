# 资讯与教程最新八条上线记录

- 发布 ID：`news-latest8-20261021-1`，时间：2026-10-21 16:08:33 +08:00。
- 页面：https://ontimo.cn/news 。按原有日期倒序排列后最多展示 8 条；全部、资讯、教程分类均受限制，隐藏加载更多；内容不足 8 条时按实际数量展示。保留全部历史内容与 API。原生产页面没有热点区，兼容逻辑也保持该区隐藏。
- 范围：仅修改 `public/app.js` 和 `public/index.html`（脚本缓存版本 `20261021-news8-1`），新增 `tests/news-latest-eight.test.mjs`。使用当前生产完整快照，未发布脏工作区其他改动。
- 基底 SHA-256：`466aaa2f63ebbff03ed043da659c6d19a69521dff6999b3ecdcf2ee7ebcd5a70`；切换前复核原生产 886 个文件完全一致。
- 完整发布包 SHA-256：`4676b46e5098bc11ef0795c477f3c174f02505bef859e09f6b679029ebe25cf7`，上传前后一致。887 个文件，保留 `.env.example`；排除真实配置、数据库、用户数据、node_modules 和备份。
- 通道：StrictHostKeyChecking=yes 的已授权 SSH，服务器现有 `/opt/nikai-ai/scripts/release-production.sh`；无其他生产部署通道。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261021-160817-2562687.sql.gz`。
- 回滚目录：`/opt/nikai-ai-backups/releases/previous-20261021-160155-news-latest8-20261021-1`。
- 验证：新增测试先复现原逻辑展示超过 8 条，再修复通过；覆盖三个分类、短列表和空列表。Node v22.18.0，npm ci 成功，全 JS 语法检查通过，logo 138/138 校验通过。本地完整测试 879 通过、0 失败、3 条现有条件跳过；服务器干净目录 882/882 全通过，0 跳过。没有新增迁移。
- 公网：全部 8 条、资讯 8 条、教程实际 5 条；加载更多不可见，刷新后仍为 8 条；脚本缓存版本正确，390px 手机视口无横向溢出，无页面 JS 异常。服务 active，内网与公网 ready 均 database=true，release history success。重启期间前两次健康探测连接拒绝，随后脚本和最终健康验证均成功。
- 证据：`docs/news-latest8-release-evidence-20261021/`，包含测试/发布日志、浏览器截图及验证 JSON。
- 临时快照和制作目录保留在项目外；本会话此前的临时目录删除操作被自动审批策略阻止，未再次尝试其他删除通道。QA 浏览器已关闭。
