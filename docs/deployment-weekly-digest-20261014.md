# 周报自动发送发布记录

版本 `weekly-digest-20261014-1`，2026-10-14 18:25:04 +08:00，release history success。线上完整版本 `feedback-email-20261014-2` 为基底，核对全部未修改文件及server/原周报脚本摘要，无漂移；只叠加本次脚本、周报模块、退订路由、回归测试、配置示例和说明，没有发布本地资讯/样式草稿。

归档SHA256：`449645e2533aed5c81e971cbc613f4a93babe19448616273b7b4dd72478bba55`，上传前后匹配。通过已授权SSH和服务器现有release-production.sh发布，未直接编辑线上目录；无数据库迁移。

- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261014-182338-weekly-digest-20261014-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261014-182454-2200305.sql.gz`。
- 本地618项测试：615通过、3项平台跳过、0失败；服务器618项全部通过。JavaScript语法和138个Logo检查通过。

## 实际行为

沿用现有systemd每周一09:15（Asia/Shanghai）加最多15分钟错峰定时器。发件地址从WEEKLY_EMAIL_FROM回退FEEDBACK_EMAIL_FROM/AUTH_EMAIL_FROM。三个偏好分别控制精选、新工具、收藏变化；全部关闭、退订、压制和禁用账号不发送。每订阅每周成功回执与供应商幂等键防重复；失败继续其他订阅、不记成功，可重跑补发，失败退出非零。邮件提供HTML、文本、详情链接和无需登录的退订确认页；GET不取消、POST确认取消，签名按订阅绑定。更换邮件密钥会使旧退订链接失效，账户/反馈退订仍可使用。

## 生产验收

生产数据库dry-run读取4条active订阅，无网络发送、无发送日志写入。首次运行3条发送成功，1条example.com历史测试邮箱被供应商422 validation_error拒绝（Invalid to field）。核对该条确属example.com测试地址后，仅将状态改为suppressed，保留原记录：`ad2a64ee-a615-467c-93fd-c5ca058f26d6`。复跑任务sent=0、failed=0，未重复向成功用户发送，任务状态成功。

3条真实发送回执均last_event=delivered；用户确认邮箱回执 `01a139f2-2b4d-76c0-919e-95917830011c`，收件地址、已验证发件域、标题、正文、退订链接核验一致。delivered表示收件邮件服务器已接受，不代表已经阅读。本周无新增工具，邮件如实显示无新增，不伪造内容。

真实Chrome打开邮件中的退订链接HTTP200且显示确认按钮，未点击取消；伪造签名公网400。公网健康接口200、database=true，应用active。下一次定时运行2026-10-19（周一）09:15–09:30；本次timer显示09:22:18 CST。

## 临时文件

服务器本次/tmp文件已清除，完整发布包、生产基底与测试日志保存在工作区output/workspace-backups。删除本地隔离目录 `C:\Users\zhanglian2\AppData\Local\Temp\nikai-weekly-20261014` 时，已先核对绝对路径，原生PowerShell Remove-Item仍被自动审批策略拒绝（blocked by policy）；未改用其他工具绕过，该目录暂留。
