# NeStudio 积分与后台直接派发：生产发布

- 发布ID：nestudio-credits-20261016-1；成功时间2026-10-16 15:33:32 +08:00。
- 基底：当时现行生产nestudio-name-20261016-1完整已核验发布包，仅叠加本次36个审阅文件；未打包脏工作区和真实环境/用户数据。
- 包SHA256：e99d0d3895384b810505499de58c1a2cce0173dcd8fa38d4750a281f9d3a605b；SSH上传摘要一致。
- 唯一发布脚本：/opt/nikai-ai/scripts/release-production.sh。
- 回滚代码快照：/opt/nikai-ai-backups/releases/previous-20261016-153026-nestudio-credits-20261016-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-153321-2279143.sql.gz。

## 结果

1. 后台“积分管理 → 直接派发积分”支持完整邮箱或账户ID查找、核对身份和余额、填写积分及备注后到账，记录操作人/时间/金额。事务钱包、流水、记录一并提交，重试幂等、上限10亿。
2. NeStudio后台可配置Token输入/输出单价及预算，累计实际usage后一次向上取整；前台预算预留、多轮用量和最终费用；失败按既有承诺全退。旧报价在切换模式或修改价格/模型后会被拒绝刷新，不自动重提。
3. 实际单价用户尚未决定。生产验证billing.mode=fixed，输入/输出单价均null，原有20积分仍保持，未自行设置收费标准或启用按量收费。
4. 双数据库迁移037/038已成功应用。

## 验证

- 完整临时生产基底本地完整测试日志730项：727通过、3项Windows跳过；随后追加的跨连接并发派发测试独立通过。静态JS语法通过、logos 138/138。
- Linux正式发布干净目录731/731通过，0失败0跳过；独立只读审查无剩余P0/P1/P2。
- 真实生产MariaDB临时账户通过：查找、派发9积分、同请求重复仍9、改变内容409、最近派发记录、预算预留5和实际结算2重复仍余额7/冻结0。临时账户、钱包、记录、流水、预留和会话均已删除；没有给真实用户擅自发积分。
- 公网Node客户端/健康接口200且database=true；/admin包含派发入口及缓存版本grants-1，相关JS和/nestdutio均200。主服务active，发布history success。
- 自定义域名demo.ontimo.cn active，公网200且版本4d651a2e-c563-4500-a483-a56885faa586；真实表单写入/重复幂等/错误Origin拒绝，见nestudio-custom-domain-acceptance-20261016.md。
- root-owned域名worker从本次正式版本更新，sha256 74f3629e9f6f090a51e6793971866c0e6c6cfd7103f72fcb81e40c8df946d3f7；定时器active，oneshot检查成功。旧worker备份/var/tmp/nikai-domain-worker-before-keepalive-20261016.mjs。

## 待运营设置

Token单价由站主自行决定并在NeStudio模型配置显式切换模式。demo证书为手动DNS签发，2027-01-14到期，尚未具备该证书的自动续期能力。阿里云HTTP入口备案拦截仍影响HTTP-01，需在证书到期前安排DNS续期或完成适用的服务器域名接入配置。

## 临时文件保留
发布后尝试删除本次本地暂存app/归档和服务器临时验收脚本的合并清理命令，被自动审批以blocked by policy拒绝；整条命令没有执行，未改走其他删除路径。临时发布目录D:/资料收集/nikai-release-staging/nestudio-metered-20261016及服务器临时脚本/归档保留。真实账户余额不受影响，前述临时积分账户和会话已在各自验收脚本finally中清理。域名验收假数据记录仍保留，不宣称已删除。
