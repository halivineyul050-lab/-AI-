# 首次创作体验发布记录

2026-10-14，Asia/Shanghai。正式渠道：已授权 SSH 与服务器既有 release-production.sh。

## 最终版本

- 发布 ID：first-creation-20261014-2，成功时间 16:45:23 +08:00。
- 范围：三类六案例及生成WebP图、价格与耗时说明、原任务恢复和准确结算、首次成功事件。按用户反馈将案例区置于创作框和生成按钮下方。
- 完整归档 SHA256：4c9194949171a6821124da699ecd7d3148235156ffa8ca10ca2249a8fa47d66a，上传后核验一致。
- 基底：first-creation-20261014-1完整已验证生产发布；发布前逐文件SHA256核验659个源文件无漂移。仅改页面区块顺序。
- 回滚快照：/opt/nikai-ai-backups/releases/previous-20261014-164357-first-creation-20261014-2。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261014-164513-2191125.sql.gz。
- 无新增数据库迁移。

## 验证

- Node22，npm ci、JS语法和logos验证通过。
- 本地完整604测试：601通过，3平台相关跳过，0失败；服务器干净发布目录604全部通过。
- 本地浏览器API模拟：成功、已确认失败释放、积分不足、未知价格、参考图约束、断网只查询原任务、未知提交刷新保护、上下文503仍保留待处理标记、404必须核对、停止等待未重复POST。
- 独立只读审阅发现的账户响应解码和恢复异常3项P2均修复并复核通过。
- 公网Chrome实际页面HTTP200；三分类可切换，六WebP均实际加载；点击案例填写描述，游客生成按钮要求登录。
- 实际公网与服务器ready均HTTP200，database=true；systemd active，release history success。
- 最终桌面布局：form bottom 487.80，case top 563.17；手机390px无横向溢出。
- 图片为内置ImageGen灵感示例，非站内模型性能测试。没有触发生产付费生成。
- 线上截图：output/first-creation/desktop.png 与 mobile.png。

## 初次发布

first-creation-20261014-1，16:37:51 +08:00成功，服务器604测试全部通过。
代码备份：/opt/nikai-ai-backups/releases/previous-20261014-163627-first-creation-20261014-1。
数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261014-163741-2188544.sql.gz。
归档SHA256：1cb9c3debc4ceeed2d3b91fc06cbc154e42d893c25279a2cd1a9a3c856f7db0d。

## 清理状态

预览服务与本次当前验证浏览器已停止。自动审批策略拒绝删除本次临时发布目录，发布包与测试临时文件暂存于已核验的用户Temp/nikai-first-creation-20261014；组合清理命令亦未执行，服务器/tmp上传归档仍保留。生产备份与release history未改动。
