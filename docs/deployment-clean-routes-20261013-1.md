# 页面地址统一无扩展名

- 发布ID：clean-routes-20261013-1，2026-10-13 10:27:12 +08:00。
- 线上完整基底：credits-layout-20261013-1；仅叠加审阅过的路由、主站账号链接、脚本缓存版本和相关测试，共33个文件变化，691个应用文件。
- 包SHA256：c1a181ad0601145ffe23a49765073ae395749727f973269fd1083bcec5e57417，上传后摘要一致。
- 账号中心新增/auth映射，主站导航/登录/注册/助手/积分/后台跳转统一/auth。24个主站旧.html入口与尾斜杠308跳转，并保留查询参数；4个独立小游戏index.html跳转到游戏入口。
- 百度验证文件保留.html；游戏静态资源和第三方文件不改写。auth页增加canonical，CSP、账号权限不变。
- Windows完整测试519通过3跳过，服务器干净目录522/522通过；JS语法及138个logo校验通过。
- 浏览器：旧auth.html的next参数和register/account-credits hash保留，注册/登录页正常，生图页账号和积分链接均为/auth，没有循环跳转或页面错误。
- 公网逐项验证28个旧地址308及对应目标，账号页表单/canonical存在，百度验证文件200；服务active，ready.database=true。
- 旧代码快照：/opt/nikai-ai-backups/releases/previous-20261013-102600-clean-routes-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-102703-2110523.sql.gz；无新增迁移。
- 本地工作区保留已有差异；补丁可应用部分原样同步，admin/skills及server冲突处手动同步本次变更，未以线上文件覆盖无关改动。生产验证基于完整线上基底。
