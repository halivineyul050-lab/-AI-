# Native Preview Implementation Plan

**Goal:** 已生成原生工程可在右侧默认交互预览，并保留源码。

**Architecture:** 服务端包装原生工程为受现有隔离预览服务约束的 web 模拟作品；浏览器运行独立模拟运行时，主站不执行生成代码。

**Tech Stack:** Node.js、原生浏览器 JS、现有 Playwright 测试。

## Constraints

不改变原始工程、计费、验证状态；不增加依赖；不冒充微信真实能力。保持其他工作区改动。

## Tasks

- [x] 测试先行：增加原生模拟浏览器测试，确认缺少转换器时失败。
- [x] 实现 backend/nestdutio/native-preview.mjs 包装与 backend/nestdutio/native-preview-runtime.js 隔离运行时。
- [x] 在版本 preview 路由接入原生包装，保持发布/数据接口禁止原生访问。
- [x] public/nestdutio.js/html/css 增加预览/源码切换、错误回退和手机画布。
- [x] 运行交互、安全与现有原生/网页回归测试，记录实际验证及限制。
