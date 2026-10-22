# 项目文档入口

更新：2026-10-22。当前生产发布为news-persistence-20261022-1，服务器与公网已核验；当前状态以 [最终收尾记录](final-closeout-2026-10-22.md) 为准。

## 当前使用与维护

- [项目介绍与启动](../README.md)
- [后端接口与数据库](../backend/README.md)：资讯多信源与热榜API已发布，页面热榜保持隐藏。
- [唯一正式发布流程](production-release.md)：完整包、已授权SSH、服务器现有发布脚本；CI不部署。
- [发布凭证与 MariaDB CI](release-provenance.md)：基底、Git commit、白名单、归档哈希与独立数据库验证。
- [前端页面与资源地图](frontend-structure.md)
- [设计系统](design-system.md)
- [最终收尾与正式发布](final-closeout-2026-10-22.md)
- [首轮工作区整理记录](workspace-closeout-2026-10-22.md)
- [本地/生产业务差异审阅与修复](business-difference-review-2026-10-22.md)：历史审阅与本地修复依据，最新上线状态见最终记录。
- [MariaDB最终验收与清理结果](mariadb-final-verification-2026-10-22.md)：真实数据库验证通过，前三棵旧worktree已移除；catalog后续清理与最新测试见最终记录。
- [关联worktree与资讯验证续查](worktree-followup-2026-10-22.md)：历史阶段清单和独有知识归档依据。

## 当前功能依据

- [资讯来源后端与数据库兼容修复发布](deployment-news-persistence-20261022-1.md)

- [视频水印样式发布](deployment-watermark-style-20261021-1.md)、[预览修复](deployment-watermark-preview-fix-20261021-1.md)
- [资讯最新八条发布](deployment-news-latest8-20261021-1.md)
- [原生小程序模拟预览](deployment-nestdutio-native-preview-20261021.md)


- [交互讲解独立二级入口发布](deployment-explain-placement-20261015.md)

- [交互讲解导航统一发布](deployment-explain-nav-20261015.md)

- [交互讲解真实AI生成修复与验收](deployment-explainer-ai-20261015.md)

- [交互讲解示例版发布与验收](deployment-explainer-demo-20261015.md)

- [周报自动投递发布与验收](deployment-weekly-digest-20261014.md)

- [反馈邮件通知发布与投递验收](deployment-feedback-email-20261014.md)
- [首次创作设计](superpowers/specs/2026-10-14-first-creation-design.md)、[案例图来源](first-creation-image-provenance.md)、[发布凭证](deployment-first-creation-2026-10-14.md)
- [抖音公开视频原型发布](deployment-douyin-public-20261014-1.md)、[提取页面布局发布](deployment-link-center-20261014-1.md)
- [图片积分发布](deployment-image-credits-20261013-1.md)、[任务可靠性发布](deployment-image-job-reliability-20261013-1.md)

## 保留的本地开发

- [资讯事件聚合与热榜设计](superpowers/specs/2026-09-29-ai-news-event-hot-ranking-design.md)：迁移19、多信源关系、采编关联和热榜API已随 news-persistence-20261022-1 发布；页面热榜继续隐藏。
- [主站布局设计](superpowers/specs/2026-09-29-main-site-editorial-redesign-design.md)：本地部分CSS与生产不同；不能用历史设计文档直接覆盖当前线上页面。

## 历史与生成产物

`deployment-*.md` 与 `release-*.json` 是逐次发布的历史凭证，保留原日期与备份路径；不替代当前发布流程。`superpowers/specs/`、`superpowers/plans/` 保留设计与实施过程，不以勾选状态证明上线。

截图、预览、PDF和本地备份放在 `output/`，由Git忽略；正式图片和运行资源留在 `public/assets/`。历史现场证据截图仍保留在原有 `docs/` 路径，避免破坏引用。

当前逐文件分类见 [集成清单](workspace-integration-2026-10-22.json)，核验边界和保留项见 [整理记录](workspace-closeout-2026-10-22.md)。[10月14日工作区清单](workspace-audit-2026-10-14.json) 与 [当时的worktree清单](worktree-inventory-2026-10-14.json) 仅用于历史回溯。
