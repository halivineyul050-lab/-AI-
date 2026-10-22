# 运营后台工作台精修实施计划

**状态：第 5 阶段完成（2026-09-29，1440/1024/390/330px 视口已手动复核）。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is executed inline in the current task and preserves all pre-existing worktree changes.

**Goal:** 整理后台桌面顶栏和窄屏指标布局，同时保留运营工作台结构与所有业务行为。

**Architecture:** 只在 `public/admin.css` 末尾增加有明确断点的视觉覆盖。宽屏采用紧凑单行顶栏，中等宽度将标题和操作拆成两层，手机以双列指标降低纵向滚动长度。

**Tech Stack:** 原生 HTML、CSS、现有静态页面与本地 Chrome 视觉预览。

## 全局约束

- 只调整 `public/admin.css`，后台 DOM、JavaScript/API、权限和页面数据不变。
- 保留独立后台侧栏、DOM 选择器、IDs、主题与表格局部滚动。
- 不运行自动化测试、不暂存/提交、不发布生产；保留所有已有工作区改动。

---

### 任务 1：整理桌面后台顶栏

**文件：**
- 修改：`public/admin.css`
- 参考：`public/admin.html` 顶栏中的标题、公告、实时状态、时间段、日期范围、暂停和刷新控件

- [x] 在 1380px 以上缩小顶栏水平留白与时间段间距，限制日期输入宽度，让标题和操作组留在一行。
- [x] 在 761–1379px 将标题与筛选区垂直排列；筛选区保留弹性换行，不压缩标题。
- [x] 在 760px 以下让实时状态保持自然宽度，并以网格将日期、分隔符和应用按钮排在一行。

### 任务 2：收整移动指标区

**文件：**
- 修改：`public/admin.css`
- 参考：`.kpi-grid` 与 `.kpi-card`

- [x] 在 361–760px 显示两列指标卡，减小图标与卡片内边距，并允许描述自然换行。
- [x] 在 360px 及以下保留单列指标卡。
- [x] 不改变图表与数据表的面板内横向滚动行为。

### 任务 3：本地视觉检查与记录

**文件：**
- 更新：本计划的任务状态
- 检查：桌面、平板和手机本地截图

- [x] 使用 1440px、1024px、390px 视口复核标题、筛选、导航和核心指标排布。
- [x] 补看 330px 极窄屏的日期控件与单列指标布局。
- [x] 检查页面滚动宽度未超过视口，复杂表格仍只在其容器内滚动。
- [x] 保持后台脚本及数据为空/不可用时的原始状态，不伪造 API 响应。
