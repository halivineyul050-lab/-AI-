# 交互讲解示例体验版发布

版本：`explainer-demo-20261015-1`；2026-10-15 10:41:02 +08:00，release history success。

入口：https://ontimo.cn/explain；小工具页增加“交互学习→交互讲解”。包含月相、骰子概率和冒泡排序三个可操作示例；页面明确标注示例体验版和AI自由生成尚未开放。分享链接在fragment保存案例与参数，不包含用户输入，不需要登录。

## 发布依据

用户明确要求先上线当前原型。以当时最新生产 `hide-email-20261015-1` 为完整基底，排除配置、数据库、用户内容、node_modules、imports、Git；核对完整基底SHA清单无漂移。仅叠加explain.html/css/js、server静态白名单与/explain路由、utilities入口、新增路由回归测试。不覆盖脏工作区内其他开发。

通过授权SSH及服务器原有release-production.sh发布。完整归档上传前后SHA256均为 `91ce8f6d56847bb39d157b214059cd948f6029c9dd027bd1d039c72f09b47719`。无依赖变化、无数据库迁移。

- 回滚代码快照：`/opt/nikai-ai-backups/releases/previous-20261015-103933-explainer-demo-20261015-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261015-104052-2213963.sql.gz`。
- 本地620项测试：617通过、3项平台跳过、0失败；服务器620项全部通过。138个Logo及全部前端JavaScript语法检查通过。

## 真实公网验证

Chrome访问/explain返回200，显示示例体验版。首次访问的全站公告正常关闭后进行实测：月相180度显示新月0%，分享链接恢复180度；骰子100次累计100；排序最终2、3、4、5、8。手机390px月相90度显示下弦月50%，页面无横向溢出，无脚本异常。截图：`output/interactive-explainer/production-mobile-20261015.png`。

小工具页入口、explain.css/js资源、健康接口均核验；健康200、database=true，服务器active。当前不提供AI自由生成、账号历史、积分扣费或私有作品管理。完整设计稿的后续范围尚未实现。

完整发布归档、上线前基底和本地测试日志保留在output/workspace-backups。本地隔离目录位于Windows临时目录nikai-explainer-20261015；此前原生递归清理被自动策略阻止，本次不绕过该策略，暂留用于审计。服务器本次/tmp文件在核验和记录完成后清除。
