# 图片、视频与实用工具页重设计实施计划

**状态：第 2 阶段完成（2026-09-29，创作工具页视觉重设计已复查）。**

**Goal:** 重设计实用工具目录、图片工作页、视频工作页和模型价格页，让用户更容易开始处理、理解状态并带走结果，同时保持现有业务与公开地址不变。

**Architecture:** 沿用静态 HTML、多页 CSS 和现有 JavaScript。公共外壳和共用控件继续由 `design-system.css`、`styles.css` 与 `utility-theme.css` 提供；图片、视频、价格和链接提取页保留各自的样式与状态结构。此阶段只改视觉相关 HTML/CSS，不改业务脚本和服务器。

**Tech Stack:** 原生 HTML、CSS、JavaScript；不新增依赖或构建步骤。

## 全局约束

- 按已确认的全用户端、逐页全面重设计范围继续；本阶段仅覆盖图片、视频和实用工具页。
- 保留现有路由、静态导航、表单字段、ID、ARIA、`data-*` 业务钩子和文件处理边界。
- 不改 `public/app.js`、图片/视频业务脚本、worker、核心算法、API 或 `server.mjs`。
- 复用现有设计 token；工具页新增视觉规则使用明确的 `.utility-tool-page` / `.utility-catalog` 范围，避免共享主题文件里的全局基础规则把游戏画布或游戏 HUD 一起改动。
- 不修改后台、游戏画布或账号页。
- 保护工作区原有的大量未提交变更；不暂存、不提交、不回退无关文件。
- 用户没有要求测试；本计划只做差异审阅与浏览器视觉检查，不运行自动化测试或发布。

## Task 1：统一工具页基础节奏与工具目录

**Files:**
- Modify: `public/utility-theme.css`
- Modify: `public/utilities.html` only when a visual grouping hook is needed
- Read: `public/design-system.css`, `docs/frontend-structure.md`

- [x] 收口工具页标题、辅助说明、处理/隐私标记、面板标题、上传区、主要动作和页脚的共用间距与焦点样式。
- [x] 让 `/utilities` 目录按内容类别和处理方式组织工具入口，沿用现有链接地址与卡片文案。
- [x] 工具工作区规则通过 `.utility-tool-page` 限定；目录规则通过 `.utility-catalog-page` 限定，未改游戏样式。
- [x] 检查工具目录桌面/平板/手机布局及工具页手机导航抽屉。

## Task 2：重设计图片工具工作区

**Files:**
- Modify: `public/image-generation.css`
- Modify: `public/image-edit.css`
- Modify: `public/image-ai.css`
- Modify: `public/image-erase.css`
- Modify: 对应图片工具 HTML，仅在语义/布局确需容器钩子时
- Read: 对应图片 JavaScript、core 与 worker（只理解保留的状态和钩子）

- [x] 收整 AI 生图入口：提示词/参考图、参数、生成状态、结果与历史继续按现有流程呈现。
- [x] 统一图片编辑、抠图/增强和物体消除的导入、画布、设置、状态及导出层级，同时保留本地与服务器处理差异。
- [x] 调整透明底棋盘格、画布缩放、长文案与按钮密度；修正手机生图参数标签换行。
- [x] 保留所有页面 DOM 钩子与现有深浅主题/移动布局行为。

## Task 3：重设计视频工具与价格页

**Files:**
- Modify: `public/video-frame.css`
- Modify: `public/video-crop.css`
- Modify: `public/video-gif.css`
- Modify: `public/video-mask.css`
- Modify: `public/video-pricing.html` only for scoped visual hooks/styles
- Read: 对应视频 JavaScript、core 与 worker

- [x] 统一视频预览、时间参数、导出设置、进度/取消、错误信息与结果的层级。
- [x] 让裁剪、转 GIF、马赛克/模糊在共享视觉语言下保留各自功能差异。
- [x] 收整模型价格筛选、表格、对比和导出区域；保留价格数据与内联行为。
- [x] 检查视频裁剪与遮挡在窄屏下的预览、筛选项和价格页桌面结构。

## Task 4：重设计链接提取页

**Files:**
- Modify: `public/link-extract.css`
- Modify: `public/link-extract.html` only for scoped visual hooks
- Read: `public/link-extract.js`

- [x] 明确链接输入、来源说明、提取结果、视频/音频/文案资源之间的层级。
- [x] 保留登录/验证提示、复制状态、独立下载动作和错误反馈。
- [x] 检查输入界面与手机布局；动态结果由后端 API 提供，本地静态预览未伪造其状态。

## Task 5：视觉复查与范围收尾

**Files:**
- Review: 本计划所列 HTML/CSS
- Update: 本计划完成记录

- [x] 检查桌面、平板和 390px 手机下的目录、AI 生图、图片编辑/AI 图片工具、视频工具和链接提取代表视图。
- [x] 检查浅色/深色主题、工具移动导航、状态样式及 reduced-motion 声明。
- [x] 审阅范围内差异；记录静态预览无法验证的后端 API 动态内容。
- [x] 未运行自动化测试，未暂存/提交，未发布生产。

## 完成记录

- 预览方式：本机静态 HTTP 服务 + Edge DevTools 协议，分别以 1440×1000、1024×900 和 390×844 视口检查代表页面；受本机浏览器工具不可用影响，使用无头 Edge 渲染截图并逐张查看。
- 目视复查：工具目录、AI 生图、图片编辑、AI 抠图、物体消除、视频裁剪、视频遮挡、分享链接提取与视频价格页；并检查目录/编辑/视频页面深色主题。
- 静态服务没有后端 API；模型列表、链接解析、动态结果和价格表数据未用伪造数据填充，也没有据此声称线上验证通过。
- 该阶段只改用户端工具目录、工具页 HTML 的页面 class、工具样式及本阶段计划文档；未更改处理算法、业务脚本、页面路由、表单字段、ID、API 或生产文件。

## 执行说明

- 一次完成一个页面组，并在组间复核 HTML 中的现有业务选择器。
- 只新增必要的布局钩子；不整文件格式化既有页面。
- 页面需要内容/结果区域时优先重排现有容器，避免重复拷贝业务数据节点。
