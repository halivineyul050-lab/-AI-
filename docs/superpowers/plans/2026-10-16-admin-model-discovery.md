# 后台模型发现实施计划

**Goal:** 所有后台模型配置可获取服务商列表并选择模型。

**Architecture:** 共用安全模型发现模块与前端选择器。沿用各配置存储及管理员认证，不增加数据库表。

**Tech Stack:** Node.js、原生 JavaScript、node:test。

- [x] 添加模型发现单元测试，运行确认失败；实现 HTTPS 路径推导、密钥同址复用、限流响应与错误清洗。
- [x] 管理员统一 POST /api/admin/v1/model-discovery，按 scope 读取保存配置；新增权限和密钥测试。
- [x] 接入小助手、讲解、NeStudio、Skills、资讯摘要；图片平台与模型编辑器接入选择；修正根地址保存。
- [x] 验证自动加载、保留模型、失败重试、请求竞态；运行相关回归与语法检查。
- [x] 记录验证与范围。用户尚未明确要求发布，不执行生产切换。

验证记录：`docs/admin-model-discovery-verification-20261016.md`。
