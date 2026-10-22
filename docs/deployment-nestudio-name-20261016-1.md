# NeStudio 更名发布记录

- 发布：nestudio-name-20261016-1，2026-10-16 13:01:52 +08:00 成功。
- 基底：线上完整 nestdutio-data-20261016-2；仅替换展示名称及后台/积分脚本缓存版本，33个文件。
- 发布包 SHA256：fe95af378de1c4775d64f034711dd6be1955e540f913df0526c8187ed8bea2a3，上传前后一致。
- 唯一现行发布脚本执行；本地704通过/3项Windows跳过，服务器707/707通过，138个Logo验证通过。
- 备份：/opt/nikai-ai-backups/releases/previous-20261016-125844-nestudio-name-20261016-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-130141-2271150.sql.gz；没有新迁移。
- 公网当前作品页、首页、后台、后台配置脚本、积分明细脚本返回200，包含NeStudio，无旧展示名。服务active，就绪database=true。
- 原有 /nestdutio、项目ID、数据库与window.NeStdutio表单SDK保持兼容。
- 动态Token计费属于下一项独立变更，本次未更改计费。
