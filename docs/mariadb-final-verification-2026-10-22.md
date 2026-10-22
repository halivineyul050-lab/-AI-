# MariaDB验收与旧工作目录清理结果

日期：2026-10-22（Asia/Shanghai）。用户在阅读上一轮剩余项与清理候选后明确要求“请继续，完成所有选项”，本轮完成真实MariaDB隔离验收和三棵干净worktree清理。未推送Git、未发布、未执行生产迁移，含212项改动的catalog目录继续保留。临时运行时删除被自动审批拒绝，详见末尾。

## 真实MariaDB验证

服务器已安装MariaDB发行版为10.5.29（SSH只读版本查询）；本地从 [官方文件页](https://dlm.mariadb.com/browse/mariadb_server/10.5.29/winx64-packages/) 获取相同补丁版本Windows便携包，并按 [官方SHA-256清单](https://archive.mariadb.org/mariadb-10.5.29/winx64-packages/sha256sums.txt) 核验：

a6b11c7ed51a204d33f0a9d0344b680d1067534153ec3c9432dbcaf789b01cab

只在本机临时目录启动随机高端口、127.0.0.1绑定的实例，没有安装Windows服务、修改PATH或读取真实.env。随机测试密码仅在进程内存使用，日志做脱敏；不将任何真实生产凭据或用户数据带入测试。

新增 scripts/verify-news-events-mariadb.mjs 导出隔离验证函数：必须显式隔离标记、loopback、高端口、nikai_verify十六进制库名、无socket，连接后验证真实MariaDB 10.5.29和目标空库，再创建任何fixture。它不是发布命令；调用者必须先自行建立临时实例和空库。新增保护单测验证错误目标在连接前拒绝。

### 实际覆盖的7组检查

1. 按项目转换器生成文章、审计、CMS状态和资讯同步四张基础fixture表，使用正式MariaDB迁移019。模拟已有14–44其它迁移记录但缺19，通过生产迁移函数配真实SQL驱动适配补19，重复执行不再应用。没有声称重新验证全部历史迁移、Linux shell发布流程或真实生产数据迁移。
2. 真实持久化的新建资讯、补第三来源、正文不变、详情来源与热榜、重复采集跳过模型。
3. dry-run、未知来源ID不写入数据库；模型、RSS和封面请求使用fixture网络响应，不调用真实付费模型。
4. 多来源写入先成功一条、再遇来源归属冲突时，真实事务整体回滚。
5. 通过真实数据库触发器注入来源写入错误，验证刚插入文章回滚。
6. 两条真实MariaDB连接竞争来源唯一键，观测到InnoDB LOCK WAIT；第一条提交后第二条INSERT IGNORE为0，归属仍为唯一赢家。此项证明数据库约束与锁等待，不是两个完整采编HTTP请求的并发压测。
7. 两档合成数据中每次结果均保留较早的5来源榜首、返回最多10条，记录包含实际兼容worker与查询开销的时间。

### 本机规模测量

每档预热后串行运行5次；MariaDB缓冲池64MiB，数据为合成fixture。以下不是线上P95、并发吞吐或生产延迟承诺。

| 规模 | 中位数 | 最大值 |
| --- | ---: | ---: |
| 1,001篇 / 2,005来源 | 78.72ms | 92.46ms |
| 10,001篇 / 20,005来源 | 1287.4ms | 1465.2ms |

万篇规模已有约1.3秒的同步查询成本。正式启用热榜前应根据实际文章量与流量决定是否增加缓存或预计算，再验收页面展示。本轮完成测量，不把“正确性通过”说成“任意规模性能达标”；热榜仍隐藏，不改最新8条或首页4条行为。

## 真实验收发现并修复的问题

首次连接发现：设置NIKAI_DB_HOST后仍强制使用Linux默认socket，Windows/TCP连接失败；构造函数握手失败后还残留Worker。已先补两项失败回归，再修复 backend/mariadb-compat.mjs：显式socket继续优先；没有HOST时仍用原Linux默认socket；只有显式HOST且没有socket时走TCP。握手失败立即终止新Worker。

两项回归由红转绿，相关18项测试通过。独立复审确认无新增生产兼容回退，且修复验收脚本的第二连接创建失败时资源泄漏，使用分阶段Promise.allSettled保证两条连接回滚和关闭。本轮完整npm test：930项，927通过、0失败、3跳过，退出码0，耗时约373秒。

实际数据库验收最终退出码0，版本查询返回 10.5.29-MariaDB，7组检查全部通过。正式结果和清理凭证见 [机器记录](mariadb-final-verification-2026-10-22.json)。本机原始日志在 output/mariadb-final-20261022/，不会进入发布包。

## 三个旧worktree已清理

删除前逐一确认：绝对路径落在已报告的Codex worktrees目录内、真实路径无跳转、Git状态干净；被忽略文件只有可重装的node_modules；对应分支HEAD已在经git bundle verify确认的备份中。由于没有本任务托管附件，使用Git原生worktree remove，不加force，不删除分支。

- `aihot-production-release`：已移除工作目录，保留 `refs/heads/codex/aihot-production-release`，提交 `4b9405c266`。
- `ci-main-check`：已移除工作目录，保留 `refs/heads/codex/ci-main-trigger-20261008`，提交 `a71c22e19c`。
- `frontend-release`：已移除工作目录，保留 `refs/heads/codex/frontend-foundation-current-main`，提交 `11b79538fd`。

共移除约176.92MiB逻辑文件。Git登记仅剩当前项目和catalog-mobile-optimization；后者212项变化保持原状，原始ZIP、Git bundle和11个已归档历史原件保留。没有对悬空Git对象运行gc/prune，也没有删除旧截图或其他备份。

## 唯一未清理项：本次临时运行时

三个测试实例均已关闭；最终实例exitCode=0，未发现残留nikai_verify测试库目录，也没有系统服务。下载包、MariaDB程序和系统数据文件仍在 C:\Users\zhanglian2\AppData\Local\Temp\nikai-mariadb-20261022-HlP62A，约787.97MiB、877文件。

删除该临时目录的PowerShell操作已先校验绝对路径、任务目录名、实例正常退出及无进程使用，但自动审批返回 blocked by policy。没有改用其它删除方式绕过。此项标为pending-cleanup；不能报告“全部临时文件已清理”或“没有任何遗留”。其余两个原定事项已完成。
