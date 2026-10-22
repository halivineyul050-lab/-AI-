# 工作区整理与集成状态

> 最终状态：catalog归档及移除、热榜读取优化、SQLite补迁移修复与正式发布均已完成；热榜页面仍隐藏。下文保留该阶段当时状态，当前证据见 [最终收尾记录](final-closeout-2026-10-22.md)。

核验日期：2026-10-22（Asia/Shanghai）。本文保留首轮整理记录；后续最终状态见 [MariaDB验收与清理结果](mariadb-final-verification-2026-10-22.md)。首轮仅做备份、比对、版本归档与文档同步；后续已完成隔离数据库验收及三个干净worktree清理。未发布、回滚或变更生产数据库。10月14日的整理记录及旧清单保留为历史凭证。

## 已核验的生产基底

- SSH目标为项目规定的 `admin@47.93.245.219`，使用已有身份和 `StrictHostKeyChecking=yes`，未修改信任记录。
- 最后一条发布历史为 `watermark-style-20261021-1 / success`，时间2026-10-21 17:02:14 +08:00；快照前后再次读取记录一致。
- 现有回滚快照为 `/opt/nikai-ai-backups/releases/previous-20261021-165542-watermark-style-20261021-1`。
- 服务 `nikai-ai.service` 为active；内部与公网ready均HTTP200、`database=true`。
- 公网 `/news`、`/utilities/video-watermark`、`/nestdutio` 均HTTP200；引用资源版本分别为 `20261021-news8-1`、水印样式 `20261021-style-1`、原生预览 `20261021-native-preview-1`。此次仅核验响应和资源引用，未重做交互或付费生成验收。
- 公网 `/api/v1/news/hot?limit=1` 返回404，生产源码也未含热榜模块、文章来源关系模块与迁移019；资讯聚合/热榜仍仅本地存在。
- 现有生产发布脚本SHA-256：`65ae42f2f63f38cdede125c6f1ffaf2c45f376c09b5ef07457663d6b19fd1663`。

## 源码比对与归档边界

初始当前目录1004项Git变化：130个修改、1个删除、873个未跟踪文件。逐文件比较以 [集成清单](workspace-integration-2026-10-22.json) 为准；清单固定记录整理前现场，不随之后的Git提交改变。

| 与本次生产快照的关系 | 初始变化项数 | 处理 |
| --- | ---: | --- |
| 逐字节一致 | 424 | 归档为已与生产一致的本地成果；不再误称全部待上线 |
| 仅CRLF/LF不同 | 43 | 保留当前内容，由既有Git属性处理行尾；不为清洁制造业务改动 |
| 内容不同 | 50 | 保留本地版本和生产快照，按功能归档；不直接覆盖或发布 |
| 仅本地存在 | 486 | 包含文档、证据和本地热榜代码；归档保留，不等于待删除 |
| 两边都不存在 | 1 | 已退役的 `.github/workflows/deploy.yml`，保留删除状态 |

完整安全源码清单中，791文件与生产一致、43仅行尾不同、54内容不同、560仅本地存在；生产快照888文件均能在本地找到同路径文件，没有发现生产独有文件。此结论仅针对排除真实配置、数据和依赖后的源码范围。

本轮Git提交用于保存已有成果、规则与文档，不能作为代码已合并主分支或具备发布资格的证明。涉及内容差异的业务组，仍需在下次修改/发布时审阅具体差异；特别是server.mjs、database.mjs、app.js与主站CSS同时包含多项工作，不能按提交标题猜测可发布范围。逐文件功能分组是检索标签，不是完整依赖清单。

## 可恢复备份

本机备份位于 `output/workspace-backups/closeout-20261022/`，由Git忽略。真实.env、数据库、用户内容、依赖和工作区工具缓存未放入这些源码备份。

| 备份 | 内容 | SHA-256 |
| --- | --- | --- |
| current.zip | 当前项目1448文件，每文件解压内容哈希与备份前后源码一致 | `68fb8f3535bc32d6fa44fcd1ddd5ba8226a7016e85b545b8fea8d56bafdaf005` |
| catalog-mobile-optimization.zip | 关联脏worktree的662文件，每文件哈希验证通过 | `abe11d3336226cd2a320143b2d5f62337ee09c88d78a1d2bacffb1a0eb275e35` |
| production-watermark-style-20261021-1.tgz | 生产888文件；服务器生成的摘要、传输后摘要和解压逐文件哈希一致 | `f69fcbb7091d195259f795b939ea3a055cd12612c87acaa32dfb56a9f5cfe94b` |
| all-refs.bundle | 整理前全部Git引用与已提交历史 | `git bundle verify` 通过 |

备份相邻的manifest与backup-summary.json保存具体路径、文件哈希和当时Git状态；备份不是发布包。原始备份早于本轮文档同步，后续文档以Git提交为准。旧备份也保留，未因新建备份自动删除。

## 关联worktree与清理候选

五个有效worktree全部保留，未切换其分支或修改关联目录。`catalog-mobile-optimization` 的212项未提交改动已单独备份。

| 关联分支 | 初始未提交项数 | HEAD未包含提交数 | git cherry未匹配补丁数 |
| --- | ---: | ---: | ---: |
| codex/aihot-production-release | 0 | 2 | 2 |
| codex/catalog-mobile-optimization | 212 | 1 | 1 |
| codex/ci-main-trigger-20261008 | 0 | 6 | 5 |
| codex/frontend-foundation-current-main | 0 | 4 | 4 |

`git cherry`不统计合并提交；提交未匹配也不意味着工作区一定缺少对应实现，因此需要逐差异裁决，当前均不删除。本轮未fetch；有关origin/main的本地落后计数不是远端实时结论。

候选仍为旧 `.superpowers/` 暂存（约59.49 MiB）、旧output备份（本轮新增备份前约314.04 MiB）及截图（约91.77 MiB）。Temp中nikai前缀测试/制作目录未逐一确认占用与活跃状态，不加入可直接删除清单。正式public资源、data运行数据、发布凭证不作为垃圾处理。复核现场保留，实际清场需在本次结果汇报后明确授权。

## 验证与仍未闭合的事项

整理前本地Node完整测试883项：880通过、0失败、3跳过；225个JavaScript文件语法检查通过，Python图像测试8项通过，Logo核验138/138通过。3个跳过项是发布权限/切换/失败回滚的平台相关测试，不代表已在Windows重演Linux切换。

本轮不修改业务实现；整理后再次核验业务文件与已测试备份一致，并检查当前文档链接、暂存范围和Git归档结果。常见凭据模式扫描只命中测试中的示例字符串；这不是完整安全审计。历史HTML的22处空白问题未为整理而改写。

| 事实面 | 状态 | 边界 |
| --- | --- | --- |
| 代码 | verified-current | 测试现场保留并归档；本地/生产业务差异仍pending审阅与集成 |
| 运行态 | verified-current | 核验当前发布历史、服务、源码与公网响应；未进行发布 |
| 文档 | changed-and-verified | 当前版本、功能地图和整理入口同步；历史凭证保留 |
| 规则 | verified-current | AGENTS指向唯一SSH发布流程；CI不部署，退役工作流删除保留 |
| 记忆 | out-of-scope | 未读写机器生成记忆 |
| 工作区 | pending | 关联worktree及清理候选保留；本地归档不等于生产集成 |

## 本地归档结果

现有成果已按14组提交到当前分支，归档范围为1006个文件变化（原1004项加本轮两份状态文件）；提交索引与核验结果见 [归档凭证](workspace-organization-commits-2026-10-22.json)。业务文件逐字节保持测试现场内容，当前目录在归档后 `git status --porcelain -uall` 为空。关联worktree仍保留原状；这不代表整个项目的生产集成与清理已完成。未推送或发布。

Git对象连通性检查退出码0；另发现历史悬空对象（blob 823、tree 145），未运行gc或prune。引用备份bundle只覆盖可达历史，不覆盖这些悬空对象；当前.git原样保留，不能据此认定可清空历史对象。

## 后续业务差异审阅

在上述归档完成后，继续完成 [业务差异审阅与本地修复](business-difference-review-2026-10-22.md)：修正价格页内联脚本、自由都市目录入口和热榜候选截断。前文“业务文件不改动”的核验仅适用于归档阶段；本次后续修复的范围与测试以该审阅记录为准，生产仍未变更。
