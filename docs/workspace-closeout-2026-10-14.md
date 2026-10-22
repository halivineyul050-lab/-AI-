# 工作区整理记录

日期：2026-10-14（Asia/Shanghai）。范围是当前泥壳AI项目；相关Git worktree只读盘点。本次没有生产发布、Git提交或推送。

## 已核验事实

生产当前版本 `first-creation-20261014-2`，release history为success，ready HTTP200且database=true。当前完整生产源代码快照SHA256为 `4e818ec2eb287deded51be878e02420b1f4e1752abd1c3ce293950d3716d6bdf`，SSH上传下载摘要相同。快照排除了环境配置、数据库、用户内容、依赖和Git目录。

首次盘点共有923个未提交文件项：199项与生产逐字节相同，38项仅行尾不同，45项与生产有差异，640项仅本地存在，1项是已从本地与生产退役的GitHub自动部署文件。640项中387项为根目录截图、240项为文档/证据、4项为输出成果；其余包含本地开发与规则文件，不能统一删除。

逐文件证据见 [核验清单](workspace-audit-2026-10-14.json)。该清单保留初始统计与整理后的分类；本地不同不等于应以生产覆盖，本地相同也不等于已提交Git。

## 实际整理

1. 将 `ontimo-full.png` 与 `ontimo-pages-full/` 共388个文件归入 `output/site-captures/`，保留所有截图，更新manifest内部路径；384个截图分片路径验证全部存在。
2. `.gitignore` 增加 `/output/`，让生成报告、预览、截图与本地备份独立于源码。正式案例图与运行资源仍位于 `public/assets/` 并继续纳入Git。
3. 补回生产已有、本地缺失的 `list-tools-batch-hydration.test.mjs` 和 `free-city-3d-simulation.test.mjs`。
4. 工具列表批量读取优化被本地旧实现覆盖：恢复生产优化，并保留本地资讯开发。恢复前回归测试证明10条工具发生40次关系查询；恢复后只需4次，返回关系数据一致，回归通过。
5. 对齐21个页面/资源的公共设计系统缓存版本、head多余空行和自由城市卡片样式；保留页面业务差异。
6. 更新根README、后端API说明和前端资源地图，修正线上抖音解析模式、资讯热榜待发布、主题脚本由服务端注入、Lucide本地托管、首次创作与任务恢复说明；新建 [文档入口](README.md)。
7. 在 `output/workspace-backups/` 保留本地/生产不同的代码ZIP、首次创作修改前的本地源码副本、核验生产快照与本轮测试日志。没有包含环境配置、数据库、个人上传或依赖。

## 验证

- 本地Node完整测试602项：599通过、3平台相关跳过、0失败。
- Python图像测试8项通过。
- 工具Logo核验138记录、138资源、138不同哈希；数据库模块语法检查通过。
- 批量读取/API/采编/MariaDB相关测试54项通过；页面/设计系统/生图/游戏路由相关15项通过。
- 当前入口文档29个内部链接核验全部存在，机械文件索引980项；线上正式发布流程保持原样。

## 待单独审阅与集成

- 资讯事件聚合与热榜：`article-source-links.mjs`、`news-hot-ranking.mjs`、SQLite/MariaDB迁移19，以及 `content-admin.mjs`、`database.mjs`、`news-publisher.mjs`、`server.mjs`、`app.js` 中相关改动。生产快照不含这一组实现；本地测试通过不能作为发布证明。
- 主站部分CSS规则、页面缓存与布局仍与生产不同。差异文件已保留和备份，后续按功能审阅后再发布。
- 源码、历史发布记录和证据仍有大量未提交Git内容。本次归类不改变提交历史，也不将未审阅成果混入生产。
- `catalog-mobile-optimization` worktree有212个未提交文件项，保持只读；其余三个现存相关worktree干净，但尚未核验其独有提交是否全部集成，因此也保留。

## 清场候选（尚未删除）

| 对象 | 规模/状态 | 理由与保护 |
| --- | --- | --- |
| 用户Temp下 `nikai-first-creation-20261014/` | 2357文件，311.1 MiB | 首次创作已上线；修改前的本地源代码已另外保存在output备份，生成图和正式源码已在项目内。 |
| 用户Temp下 `nikai-workspace-audit-20261014/` | 664文件，84.4 MiB | 本次只读生产快照与测试现场；快照、清单与最终测试日志已另存。 |
| 两个 `nikai-release-37f82d1-2d08ee39` / `nikai-release-ed2ad66-5c57ac92` Git worktree登记 | 目标目录已不存在，Git标为prunable | 仅删除失效登记；现存worktree和分支保留。 |
| 服务器 `/tmp/` 下本次首次创作及审计上传包、比对清单与临时日志 | 非运行目录 | 正式备份与release history位于 `/opt/nikai-ai-backups/`，不属于清理对象。 |

复核现场仍保留，等待用户在看到本报告后确认清场。之前自动审批策略曾拒绝删除首次创作临时目录；若再次受阻，保留并报告，不改用绕过方式。

## 事实面状态

| 事实面 | 状态 | 边界 |
| --- | --- | --- |
| 代码 | changed-and-verified | 补回生产优化和回归；未上线业务差异仍pending。 |
| 运行态 | verified-current | 本次只读核验当前生产，没有切换或部署。 |
| 文档 | changed-and-verified | 当前入口和能力说明更新；历史凭证保留。 |
| 规则 | verified-current | AGENTS指向唯一发布流程；CI没有生产部署。 |
| 记忆 | out-of-scope | 未读取或改写机器生成记忆。 |
| 工作区 | pending | 已分类、备份、归档截图；Git未集成差异与待确认清场仍保留。 |


## 用户确认后的清场结果

用户在阅读整理汇报后明确回复“可以删就删吧”，授权上述候选清理。

- 已用Git原生命令移除两条目录不存在的worktree登记；现存5个worktree保留，分支和源码未删除。
- 服务器/tmp中核验过的首次创作和本次审计归档、比对清单与日志已删除；两个root所有的快照使用已授权sudo删除，逐路径不存在检查通过。
- 本机两个Temp临时目录的递归删除被自动审批策略拒绝，原因为blocked by policy；没有换用其他方式绕过。311.1 MiB与84.4 MiB目录仍存在，属于pending-cleanup。
- 本地output中的源码备份、核验生产快照、测试记录与388个归档截图均保留。
- 清场后线上systemd active，ready HTTP200/database=true，release history仍为first-creation-20261014-2/success。

工作区清场仍为pending：仅余本机受策略阻止的两个临时目录；本地未上线功能仍待独立审阅集成。
