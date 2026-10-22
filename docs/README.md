# 项目文档入口

更新：2026-10-22。经 SSH 发布历史、生产源码和公网就绪接口核验，当前生产发布为 `watermark-style-20261021-1`（2026-10-21 17:02:14 +08:00）；本地仍有未集成差异，不能整体发布。

## 当前使用与维护

- [项目介绍与启动](../README.md)
- [后端接口与数据库](../backend/README.md)：资讯多信源与热榜明确标为本地待发布。
- [唯一正式发布流程](production-release.md)：完整包、已授权SSH、服务器现有发布脚本；CI不部署。
- [前端页面与资源地图](frontend-structure.md)
- [设计系统](design-system.md)
- [当前工作区整理与待集成项](workspace-closeout-2026-10-22.md)
- [本地/生产业务差异审阅与修复](business-difference-review-2026-10-22.md)：价格脚本、游戏入口和热榜排名已在本地修复，未发布。

## 当前功能依据

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

- [资讯事件聚合与热榜设计](superpowers/specs/2026-09-29-ai-news-event-hot-ranking-design.md)：本地含迁移19、多信源关系、采编关联和热榜API；核验生产快照不包含这些实现。
- [主站布局设计](superpowers/specs/2026-09-29-main-site-editorial-redesign-design.md)：本地部分CSS与生产不同；不能用历史设计文档直接覆盖当前线上页面。

## 历史与生成产物

`deployment-*.md` 与 `release-*.json` 是逐次发布的历史凭证，保留原日期与备份路径；不替代当前发布流程。`superpowers/specs/`、`superpowers/plans/` 保留设计与实施过程，不以勾选状态证明上线。

截图、预览、PDF和本地备份放在 `output/`，由Git忽略；正式图片和运行资源留在 `public/assets/`。历史现场证据截图仍保留在原有 `docs/` 路径，避免破坏引用。

当前逐文件分类见 [集成清单](workspace-integration-2026-10-22.json)，核验边界和保留项见 [整理记录](workspace-closeout-2026-10-22.md)。[10月14日工作区清单](workspace-audit-2026-10-14.json) 与 [当时的worktree清单](worktree-inventory-2026-10-14.json) 仅用于历史回溯。
