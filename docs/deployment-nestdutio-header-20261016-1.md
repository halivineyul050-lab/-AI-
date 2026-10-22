# NeStdutio 公共导航样式修复

- 发布：`nestdutio-header-20261016-1`，2026-10-16 10:29:14 +08:00。
- 基底：当前生产完整版本 `nestdutio-20261016-1`。仅修改 `public/nestdutio.html` 与 `tests/nestdutio-ui.test.mjs`。
- 原因：工作台引用共享导航覆盖样式，却漏引其依赖的 `/styles.css` 基础布局；真实浏览器复现 Logo 宽 192px、顶部布局失去约束。
- 修复：在工作台独立样式之前引入既有公共基础样式，不修改全站 CSS。
- 新增真实浏览器回归：Logo ≤36px、导航单行、内部 flex、390px 手机菜单开关与无横向溢出。修复前红测为 Logo 实际 192px；修复后测得 Logo 32px、导航高 51px。
- 本地完整测试：685 项，682 通过、3 项环境跳过、0 失败。服务器现有发布脚本：685 项全部通过，无跳过。121 个 JS 文件语法检查、138 个 Logo 资源校验通过。
- 归档 SHA-256：`768161a702663700abe2b95960606414f2e1edb411b6b294ffbc15f9b62ff551`，本机与服务器一致。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261016-102632-nestdutio-header-20261016-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-102903-2255015.sql.gz`；无新增迁移。
- 公网验证：页面已返回新增样式引用；公共 styles.css 与 site-shell.css 的公网 SHA-256 与经过浏览器验证的本地版本一致；响应式与共享导航 CSS HTTP 200；服务 active，就绪接口 database=true，发布历史 success。
- 验证边界：本地桌面/手机截图已查看。线上自动浏览器脚本被自动审批以 blocked by policy 拦截，官方浏览器接口和已连接 Chrome 只读检查均超时，因此没有宣称取得新的线上浏览器截图；公网采用页面与资源摘要核验。
