# 主站编辑式重设计实施计划

**状态：第 1 阶段实施完成；视觉检查已完成；自动化测试按计划未运行。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重设计主站首页和内容视图，让工具搜索、精选内容及各类内容页拥有清楚、紧凑且一致的视觉层级，同时保持现有路由和交互行为。

**Architecture:** 沿用单个静态 `index.html`、客户端视图切换和现有 CSS 模块。首页结构由 `index.html` 的语义容器表达，主站布局和页面视觉分别归属 `site-shell.css`、`site-catalog.css`、`site-content.css` 与 `site-overlays.css`，断点规则留在 `site-responsive.css`。尽量不修改 `app.js`，所有既有业务钩子和数据流保持原样。

**Tech Stack:** 原生 HTML、CSS、JavaScript；Node.js 静态服务；不新增依赖或构建步骤。

## Global Constraints

- 继续使用原生 HTML、CSS 和 JavaScript，不改变已有功能和公开地址。
- 保留现有品牌标识、紫色主色、浅色/深色主题和站点导航内容。
- 搜索、分类筛选、排序、收藏、比较、视图切换、导航、提交反馈和浏览器历史行为保持不变。
- 尽量不改 `public/app.js`。如需调整 DOM，必须保留所有业务选择器、`data-view`/`data-view-link` 钩子、表单字段名、ARIA 状态和事件目标。
- 不新增前端框架、构建步骤、依赖、公开路由或后端接口。
- 本阶段不重写工具页、游戏、账号或后台；这些页面组遵循本阶段确认的视觉语言，各自另行设计和实施。
- 工作区当前有大量既存改动。只修改与本阶段有关的文件，不回退、格式化或提交其他既存改动。
- 用户没有要求测试；不新增或运行自动化测试。完成后只做代码差异审阅和页面视觉检查。

---

## 文件地图

- `public/index.html`：主站所有视图的静态 DOM，包含首页 Hero、内容容器、页面操作区、数据挂载点和表单。
- `public/design-system.css`：全站主题变量和基础控件；先消费现有变量，仅当方案确实缺少共用 token 时才作最小改动，避免破坏尚未重设计的页面组。
- `public/assets/css/site/site-shell.css`：主站外壳、跳转链接、头部、侧栏、按钮、输入控件和工具 logo。
- `public/assets/css/site/site-catalog.css`：首页 Hero、信任说明、精选/最新内容、分类、筛选器和工具目录卡片。
- `public/assets/css/site/site-content.css`：发现、榜单、对比、任务指南、资讯、广告合作、关于、政策和反馈视图。
- `public/assets/css/site/site-overlays.css`：主站共用的详情抽屉、比较托盘、弹窗、Toast 和页脚。
- `public/assets/css/site/site-responsive.css`：主站响应式、移动筛选、无障碍动效规则及 SEO 工具详情样式。只编辑本阶段作用于 `index.html` 视图的规则；不改 `.seo-tool-*` 和 `.seo-collection-*` 动态详情页面规则。
- `public/app.js`：导航、路由、搜索、筛选、收藏、对比、数据渲染和表单行为。本计划不改其实现。

## Task 1：整理主站外壳与跳转链接

**Files:**
- Modify: `public/assets/css/site/site-shell.css`
- Modify: `public/assets/css/site/site-responsive.css`
- Read: `public/design-system.css`
- Read: `public/index.html`

**Interfaces:**
- Consumes: `--bg-page`、`--bg-surface`、`--bg-subtle`、`--text-primary`、`--text-secondary`、`--text-muted`、`--border`、`--brand`、现有圆角与阴影 token。
- Preserves: `#site-header`、`.site-header-inner`、`.site-nav`、`.sidebar-drawer`、`.main-area`、`.view`、`.skip-link[href="#main-content"]` 和所有导航/操作按钮 ID。

- [x] **Step 1: 将跳转链接调整为只在键盘可见焦点时显示。** 保持链接处于页面 DOM 的第一个可操作位置；空闲状态移出可见区域，`:focus-visible` 时固定显示在吸顶导航下方并使用品牌背景、足够对比度和清楚的焦点样式。不要用 `display:none`、`visibility:hidden` 或 `tabindex=-1` 隐藏链接。
- [x] **Step 2: 收口主站 header、侧栏和正文外壳的间距。** 在 `site-shell.css` 中沿用现有 `--header-height` 与正文宽度，统一 header 内部间距、logo/文字对齐和主导航按钮高度；只修改主站选择器，保留小屏抽屉的显隐和焦点行为。
- [x] **Step 3: 统一主站公共操作控件的层级。** 调整 `.primary-button`、`.secondary-button`、`.text-button`、`.icon-button`、`.select-control` 和 `.global-search` 的高度、边框、焦点环与 hover 状态；颜色全部引用已有设计变量。
- [x] **Step 4: 目视检查外壳状态。** 查看首页默认状态、键盘 Tab 聚焦跳转链接、头部移动菜单打开状态；确认链接未持续覆盖 header、按钮标签未截断且现有导航 DOM 未改变。

## Task 2：首页改为编辑式目录入口

**Files:**
- Modify: `public/index.html`
- Modify: `public/assets/css/site/site-catalog.css`
- Modify: `public/assets/css/site/site-responsive.css`
- Read: `public/app.js`

**Interfaces:**
- Consumes: `#hero-search-form`、`#hero-search-input`、`#hero-hotwords`、`#directory-tool-total`、`#directory-category-total`、`#featured-tool-grid`、`#newest-tool-grid` 及现有热门词/精选工具数据。
- Produces: 桌面双栏、移动单栏的 Hero 结构；保留 `#hero-title`、表单及所有数据挂载点 ID，`app.js` 无需知道新的视觉布局。

- [x] **Step 1: 将 Hero DOM 分成主内容和目录侧栏。** 在 `public/index.html` 为现有眉标、标题、说明、搜索框和热门搜索增加主栏容器；将现有统计块置于语义侧栏。复用 `#directory-tool-total` 与 `#directory-category-total`，不要复制动态数字节点。
- [x] **Step 2: 把人工核验提示放入侧栏信息组。** 保留“人工核验”文案和图标，保留“持续更新”“透明标识”两项信任说明；用代码搜索确认没有业务脚本依赖 `.trust-band-item` 的位置或顺序。
- [x] **Step 3: 用 12 栏以内的网格实现桌面 Hero。** 在 `site-catalog.css` 中令主栏容纳标题、搜索和热门任务，侧栏容纳统计/核验信息；减少上下 padding 和 hero 下边距，让首页精选区提早出现。保留紫色只用于交互和关键信息，大面积 Hero 使用页面/表面 token。
- [x] **Step 4: 对齐 Hero 之后的首页内容节奏。** 调整 `.trust-band`、`.home-section`、`.home-section-heading` 和 `.featured-tool-grid` 的间隔与卡片层级，避免信任说明、精选区标题和工具卡片之间出现重复的大段留白。
- [x] **Step 5: 处理移动端断点。** 在 `site-responsive.css` 对 Hero 使用单列布局；搜索框允许输入区收缩，提交按钮仍可识别；热门搜索可换行；信任说明改为可读的单列或紧凑两列，不产生横向滚动。
- [x] **Step 6: 目视检查首页。** 观察 1440×900、1024×768 和 390×844 三种视口；确认统计值仍由原节点显示、搜索表单仍可提交、精选/最新容器仍存在，首屏内容顺序符合设计稿。

## Task 3：统一主站内容视图，但保留内容类型差异

**Files:**
- Modify: `public/assets/css/site/site-content.css`
- Modify: `public/assets/css/site/site-catalog.css`
- Modify: `public/assets/css/site/site-responsive.css`
- Modify: `public/index.html` only when a view needs a semantic wrapper or a layout hook

**Interfaces:**
- Preserves: 每个视图的 `data-view-section` 和 ID；`.page-header`、`.filter-panel`、`.tool-grid`、`.collection-grid`、`.ranking-page-grid`、`.news-layout`、`.policy-layout`、`.feedback-layout` 等现有行为选择器。
- Consumes: 页面各自已有的动态内容、筛选控件、表单与公开说明。

- [x] **Step 1: 建立一致的页面标题区。** 在 `site-content.css` 中归一化 `.page-header`、`.compact-header`、`.title-row`、辅助描述与 action slot 的字号、对齐和垂直节奏；保留榜单、发现、教程、资讯等视图已有标题内容。
- [x] **Step 2: 收口目录类视图的卡片和筛选区域。** 让发现集合卡片、榜单条目、教程条目及工具分类遵循同一表面、边框和焦点语言；保留各自的列数、排名信息和任务分类表达。
- [x] **Step 3: 单独整理资讯与编辑型页面。** 统一文章列表、广告合作、关于、政策、法律和反馈页的标题/正文间距及表单控件；保留政策目录、资讯侧栏、合作步骤和反馈表单等页面专属结构。
- [x] **Step 4: 限定正文长度与窄屏重排。** 在 `site-responsive.css` 调整上述主站类的网格列数、列表信息折行和操作区堆叠；不改 `.seo-tool-*`、`.seo-collection-*` 规则以及独立工具页 CSS。
- [x] **Step 5: 逐个检查 SPA 视图切换后的样式。** 至少查看 `/discover`、`/rankings`、`/news`、`/feedback` 和一个政策视图，确认页面标题/操作区不挤压，政策目录和表单字段仍完整。

## Task 4：协调共用弹层并做整体验收

**Files:**
- Modify: `public/assets/css/site/site-overlays.css`
- Modify: `public/assets/css/site/site-responsive.css`
- Read: `public/index.html`
- Read: `public/app.js`

**Interfaces:**
- Preserves: `#detail-drawer`、`#compare-tray`、`.app-dialog`、`.toast-region`、所有 dialog 表单控件、`[hidden]` 状态和关闭/返回焦点语义。
- Consumes: Task 1 的公共控件、表面与间距语言。

- [x] **Step 1: 只协调主站共用浮层的视觉。** 令详情抽屉、比较托盘、工具提交弹窗和 Toast 复用已建立的边框、按钮、表单与焦点样式；不调整其打开/关闭动画或 JavaScript 状态。
- [x] **Step 2: 检查移动端浮层和比较托盘。** 确认弹窗不超出可视高度、比较托盘不遮挡主要操作，详情抽屉底部操作可以触达；保留 safe-area 与 reduced-motion 规则。
- [x] **Step 3: 检查主题和差异范围。** 对照浅色与深色主题，搜索本次 diff 中是否意外覆盖其他页面组或删掉现有内容；确认所有改动只落在主站范围文件。
- [x] **Step 4: 汇总视觉结果与未验证项。** 记录首页和代表性内容视图在桌面/手机的检查结果、尚未覆盖的视图以及是否存在与现有结构有关的限制。不要运行自动化测试或发布生产。

## 执行说明

- 每个任务完成后审阅该任务的差异，确认仅包含任务文件；不要使用整文件格式化，因为这些文件已有工作区改动。
- 在本阶段内不要改后续页面组；完成主站阶段后，再为工具、游戏和账号页分别创建设计稿和实施计划。
- 本计划不含自动化测试步骤；如用户之后明确要求测试或验证，再按其要求补充。

## 视觉检查记录（2026-09-29）

- 首页检查了 1440×900、1024×768 和 390×844；搜索、热门词、统计、核验提示、信任说明和精选工具顺序清楚，移动端无横向溢出。
- 检查了发现、榜单、资讯、反馈、用户协议和收录标准视图；主站标题、文章列表、侧栏、表单和政策目录可读，政策目录在手机端自动换行显示全部入口。
- 检查了深色主题、移动导航抽屉、键盘聚焦时的主内容跳转链接、手机比较托盘、工具详情抽屉和提交工具弹窗；比较托盘工具名已改为单行省略，抽屉底部操作和弹窗内容均可触达。
- 视觉预览使用静态 HTTP 服务，后端 API 返回 404，因此动态结果使用前端回退数据；线上 API 和真实生产页面未验证。
- 未运行自动化测试，也未发布生产。
