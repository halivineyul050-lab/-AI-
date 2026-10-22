# 交互讲解视频下载发布

- 发布 ID：`explainer-video-20261019-2`；成功时间：2026-10-19 14:40:49 +08:00。
- 基底：线上 `explainer-quality-20261019-1` 完整快照，SHA256 `21fc61ec506ea9a75c6fd602cf6907a693b74082deda6f0a3c1bfacc25411599`；仅叠加 reviewed-files.json 内十个审阅文件，未携带工作区其他改动。
- 完整发布包 SHA256：`8c882c1719e871a2ce62b15b75c10574322832ee4f413b6af90b741e88bd55a5`，上传前后相同。通过现有 release-production.sh 完成发布，无数据库迁移。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261019-143600-explainer-video-20261019-2`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261019-144036-2400696.sql.gz`。

AI 结构讲解右上角新增下载视频入口。使用本机浏览器输出720p完整步骤动画及分页字幕；优先MP4，回退WebM，无配音。显示格式、预计时长、真实导出进度、剩余用时，可取消/重试并保留下载链接。切到后台会取消并提示；最长十分钟和100MB。无录屏权限、无新增模型调用。旧版无步骤场景和三个内置参数实验不显示此入口。

本地完整测试772项：769通过、3个Windows平台跳过、0失败；最终目标测试5/5通过。全量JS语法和logos校验通过。服务器干净目录完整772/772通过，服务active、就绪接口200且database=true，发布历史success。首次预检在下载测试失败后停止，未切换生产；已修复root预检与nobody沙箱浏览器间的测试下载目录权限，没有跳过测试或放宽沙箱。Linux隔离探针和完整重检均真实下载/解码MP4并完整播放WebM。

公网验证：`https://ontimo.cn/explain` 引用缓存版本 `20261019-video-1`，新增模块/样式均HTTP200。从真实线上页面下载《心脏收缩泵血示意》MP4，1,419,691字节；重新解码1280×720、15.117秒，两个时间点画面明显变化；进度100%，390px无横向溢出，浏览器脚本错误0。证据见 `docs/explainer-video-evidence-20261019/` 的日志、截图及下载视频。

临时清理：服务器本次隔离探针和源快照已删除，发布脚本保留发布归档及回滚快照。删除本机 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-explainer-video-20261019` 的原生 PowerShell 命令被自动策略拒绝（blocked by policy），未换运行时或绕过；本机临时目录/发布文件保留。
