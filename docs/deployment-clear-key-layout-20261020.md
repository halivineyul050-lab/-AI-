# 清除密钥复选框布局修复

用户截图投诉模型配置下复选框巨大且文案另行。根因是NeStudio标签使用assistant-clear，原CSS仅覆盖assistant-clear-key，退回creator-admin-form label网格布局。

真实完整后台回归先失败：NeStudio 1440宽度下checkbox布局为962.625×44，label display grid。修复后限定16×16px、flex同行，统一覆盖两种清除标签命名，不匹配开关或文本输入。

新provider-clear-key-layout.test.mjs使用临时测试超级管理员，覆盖assistant/explainer/nestdutio完整页面及1440/768/390/320宽度，检查checkbox大小、同行、无溢出、点击文案、空格键。先红后绿；生成3页桌面和手机完整截图并人工检查。聚焦对照截图screenshots/provider-clear-key-fixed-20261020.png。

以最新线上完整快照制作隔离stage，独立审查确认仅2修改(CSS+该CSS缓存号)、1新增回归测试，无发布污染。不改KEY、配置或保存逻辑。本机完整预检816测试：813通过、3跳过、0失败；138图标验证通过。


发布ID clear-key-layout-20261020-1。完整发布包SHA-256 6bcf9f997a1417aaa96a484c09b1430cb2fd2f4e7e3f9adcdaee468fdb14f356，本机/上传后一致。保留.env.example，排除.env/.mariadb.cnf/data/imports/node_modules/.git。发布前tar --compare确认线上基底未变。调用既有 /opt/nikai-ai/scripts/release-production.sh 进行服务器完整复核、备份和切换，已于2026-10-20 15:04:23 +08:00发布success。


服务器816测试全部通过（0跳过/0失败），无数据库迁移。服务active、就绪database true。真实域名源站admin页面返回admin-provider.css?v=20261020-clear-key-1，网络CSS和本机验证文件SHA-256均为8db1ca29e3c6cfff683c75dc93b7c336feec61a7b862cb09ed304f8253acf64f。

代码回滚快照 /opt/nikai-ai-backups/releases/previous-20261020-145826-clear-key-layout-20261020-1；数据库备份 /opt/nikai-ai-backups/mariadb/nikai-ai-20261020-150411-2490190.sql.gz。没有改动KEY、已有配置或保存逻辑。

本机外网HTTPS仍出现此前连接重置，未确认外网访问通过；确认的是服务器成功切换、源站域名返回新版资源及真实浏览器完整表单回归通过。用户可在既有可访问的后台强制刷新加载新缓存。

清理：TEMP/nikai-clear-key-release-20261020经绝对路径核验后，删除仍被自动审批以blocked by policy拒绝，无更具体原因；未绕过。临时stage、归档和QA脚本/日志保留，不影响生产修复。
