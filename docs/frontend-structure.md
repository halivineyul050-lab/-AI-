# 前端页面与资源地图

更新日期：2026-09-29

本文记录页面入口、资源归属和当前例外，作为前端整理的导航页。公开 URL 由 `server.mjs` 映射到仓库根目录的静态文件；以 `/` 为起点的内容视图在首页客户端渲染。

## 页面分组

| 页面组 | 静态入口与公开地址 | 样式与脚本入口 | 当前结构与注意事项 |
| --- | --- | --- | --- |
| 主站与内容 | `index.html`；`/`、`/discover`、`/favorites`、`/guides`、`/rankings`、`/compare`、`/tutorials`、`/news`、`/advertise`、`/about`、`/standards`、`/terms`、`/privacy`、`/legal`、`/feedback`、`/category/:slug` | `design-system.css` → `styles.css`；`app.js` 与外部 Lucide | 多个内容视图共用同一 HTML 和大型 `app.js`。品牌导航、内容导航和页脚都在 `index.html`。内含 JSON-LD 脚本数据。 |
| 图片工具 | `image-generation.html` `/image-generation`；`image-edit.html` `/utilities/image-edit`；`image-erase.html` `/utilities/image-erase`；`image-background.html` `/utilities/image-background`；`image-enhance.html` `/utilities/image-enhance` | 共享 `design-system.css`、`styles.css`、`utility-theme.css`；每个工具自己的 CSS/JS。图片编辑另有 `image-edit-core.mjs`、`image-input.mjs`；生图另有 history 模块 | `image-background` 与 `image-enhance` 复用 `image-ai.css/js`；基础工具外观由 `utility-theme.css` 提供，两页不再加载图片消除工具的样式。 |
| 视频与实用工具 | `utilities.html` `/utilities`；`link-extract.html` `/utilities/link-extract`；`video-gif.html` `/utilities/video-to-gif`；`video-crop.html` `/utilities/video-crop`；`video-mask.html` `/utilities/video-mask`；`video-pricing.html` `/video-pricing.html` | 共享设计系统、主站样式、工具主题；独立工具 CSS/JS；视频页有 Worker 和 core 模块 | `video-frame.css` 只承载视频裁剪和遮挡工具共用的选区框、拖动手柄与播放进度条；`video-crop.css`、`video-mask.css` 各自保留功能规则。`link-extract.css` 独立消费设计 token。价格页含大段内联 CSS/JS，并有打印导出逻辑。 |
| 小游戏目录与本地游戏 | `games.html` `/games`；`game-2048.html` `/games/2048`；`memory-game.html` `/games/memory`；`breakout.html` `/games/breakout`；`snake.html` `/games/snake`；`gomoku.html` `/games/gomoku`；`flight.html` `/games/flight`；`never-retreat.html` `/games/never-retreat` | `game-shell.css`、各游戏 CSS/JS；棋类与动作游戏部分有 `*-core.mjs` | 游戏外壳共用主导航和工具主题；棋盘、canvas 和各自玩法区域保留独立视觉。 |
| 独立大型游戏 | `games/ironfront/index.html`、`games/tank-air-war/index.html`、`games/yiren-buche/index.html` | 每个游戏各自目录中的 CSS、JS、模型/纹理和 vendor 文件 | `server.mjs` 使用单独的受限目录路由；页面有自己的 `base` 路径、依赖和返回入口，不参加顶层静态资源整理。 |
| 认证 | `auth.html`（链接和表单通过 `auth.html` 上的状态展示登录/注册流程） | `design-system.css` → `auth.css`；`utility-theme.js`、`auth.js`；外部 Lucide | 有自己的账户面板结构，继续共享主题、基础控件与品牌语言。 |
| 运营后台 | `admin.html` `/admin.html`、`/admin` | `design-system.css` → `admin.css`；`admin-icons.js`、`admin.js` | 独立侧栏工作台，不使用前台主导航；需共享设计 token 和控件，不合并其导航结构。 |

## 共享基础

- `design-system.css` 定义全站品牌变量、浅色/深色主题和基础控件。
- `styles.css` 是主站样式清单，按顺序导入 `assets/css/site/site-shell.css`、`site-catalog.css`、`site-content.css`、`site-overlays.css` 和 `site-responsive.css`；共享变量与全局基础控件已归入 `design-system.css`。
- `utility-theme.css` 为工具与游戏提供共享别名、通用工作区控件、目录卡片、移动导航规则；图片/视频处理和框选样式由工具 CSS 负责。
- `utility-theme.js` 同时设置主题、监听主题切换，并动态添加移动菜单按钮。
- 页面主题初始化、偏好读取和切换由 `utility-theme.js` 负责；当前没有单独的 `theme-init.js` 或 `safe-storage.js`。
- 视频框选共享样式位于 `video-frame.css`，由 `server.mjs` 静态白名单提供。主导航数据位于 `scripts/frontend/site-navigation.json`，由 `scripts/build-site-navigation.mjs` 与两种模板生成到 20 个静态页面；HTML 中仍包含导航。主站 app header 保留搜索、分类、提交、收藏和比较交互；工具/游戏页继续使用主题开关与移动导航按钮。后台使用独立侧栏，认证页保留账户品牌头部。

## 页面资源明细

下表按 HTML 文件列出入口资源。版本查询参数为页面当前值；同名入口脚本和页面样式仍在仓库根目录。

| HTML 文件 | 页面/路由 | 样式加载顺序 | 页面脚本与例外 |
| --- | --- | --- | --- |
| `index.html` | 主站及 `server.mjs` 的 `publicAppRoutes`、`/category/:slug` | `design-system.css` → `styles.css` | `app.js`、外部 Lucide；JSON-LD 在 HTML 内。 |
| `admin.html` | `/admin.html`、`/admin` | `design-system.css` → `admin.css` | `admin.js`、`admin-icons.js`。 |
| `auth.html` | `/auth.html` | `design-system.css` → `auth.css` | `auth.js`、`utility-theme.js`、外部 Lucide。 |
| `image-generation.html` | `/image-generation` | `design-system.css` → `styles.css` → `utility-theme.css` → `image-generation.css` | `image-generation.js`、`image-generation-history.js`、`utility-theme.js`。 |
| `image-edit.html` | `/utilities/image-edit` | `design-system.css` → `styles.css` → `utility-theme.css` → `image-edit.css` | `image-edit.js`、`image-edit-core.mjs`、`image-input.mjs`、`utility-theme.js`。 |
| `image-erase.html` | `/utilities/image-erase` | `design-system.css` → `styles.css` → `utility-theme.css` → `image-erase.css` | `image-erase.js`、`utility-theme.js`。 |
| `image-background.html` | `/utilities/image-background` | `design-system.css` → `styles.css` → `utility-theme.css` → `image-ai.css` | `image-ai.js`、`utility-theme.js`。 |
| `image-enhance.html` | `/utilities/image-enhance` | `design-system.css` → `styles.css` → `utility-theme.css` → `image-ai.css` | `image-ai.js`、`utility-theme.js`。 |
| `utilities.html` | `/utilities` | `design-system.css` → `styles.css` → `utility-theme.css` | `utility-theme.js`。 |
| `link-extract.html` | `/utilities/link-extract` | `design-system.css` → `styles.css` → `utility-theme.css` → `link-extract.css` | `link-extract.js`、`utility-theme.js`。 |
| `video-gif.html` | `/utilities/video-to-gif` | `design-system.css` → `styles.css` → `utility-theme.css` → `video-gif.css` | `video-gif.js`、`video-gif-core.js`、`video-gif-worker.js`、`utility-theme.js`。 |
| `video-crop.html` | `/utilities/video-crop` | `design-system.css` → `styles.css` → `utility-theme.css` → `video-frame.css` → `video-crop.css` | `video-crop.js`、`video-crop-core.js`、`video-crop-worker.js`、`video-input-limits.js`、`utility-theme.js`。 |
| `video-mask.html` | `/utilities/video-mask` | `design-system.css` → `styles.css` → `utility-theme.css` → `video-frame.css` → `video-mask.css` | `video-mask.js`、`video-mask-core.js`、`video-mask-worker.js`、`video-input-limits.js`、`utility-theme.js`。 |
| `video-pricing.html` | `/video-pricing.html` | `design-system.css` → `styles.css` → `utility-theme.css` → inline styles | Inline comparison/export JavaScript; `utility-theme.js`; active navigation includes video pricing. |
| `games.html` | `/games` | `design-system.css` → `styles.css` → `utility-theme.css` → `games.css` → `game-shell.css` | `utility-theme.js`。 |
| `game-2048.html` | `/games/2048` | shared order → `game-2048.css` → `game-shell.css` | `game-2048.js`, `game-2048-core.mjs`, `utility-theme.js`。 |
| `memory-game.html` | `/games/memory` | shared order → `memory-game.css` → `game-shell.css` | `memory-game.js`, `memory-game-core.mjs`, `utility-theme.js`。 |
| `breakout.html` | `/games/breakout` | shared order → `breakout.css` → `game-shell.css` | `breakout.js`, `breakout-core.mjs`, `utility-theme.js`。 |
| `snake.html` | `/games/snake` | shared order → `snake.css` → `game-shell.css` | `snake.js`, `snake-core.mjs`, `utility-theme.js`。 |
| `gomoku.html` | `/games/gomoku` | shared order → `gomoku.css` → `game-shell.css` | `gomoku.js`, `gomoku-core.mjs`, `utility-theme.js`。 |
| `flight.html` | `/games/flight` | shared order → `flight.css` → `game-shell.css` | `flight.js`, `flight-core.mjs`, `utility-theme.js`。 |
| `never-retreat.html` | `/games/never-retreat` | shared order → `never-retreat.css` → `game-shell.css` | `never-retreat.js`, `never-retreat-core.mjs`, `utility-theme.js`。 |
| `baidu_verify_codeva-FSh1NIJkcR.html` | Search-engine verification file | none | Verification content only; not part of the application shell. |

`games/{ironfront,tank-air-war,yiren-buche}/index.html` are served by the dedicated game-directory handler, not by the top-level HTML map above.

## 静态资源路由

- `server.mjs` 的 `staticFiles` 明确登记顶层静态文件和 `assets/...` 路径；顶层页面、CSS、JS、Worker 和 vendor 文件需登记。主站拆分后的五个 CSS 模块已经逐一登记。
- `/games/ironfront/**`、`/games/tank-air-war/**`、`/games/yiren-buche/**` 由独立的目录受限处理器服务，不通过顶层 `staticFiles`。
- Logo 使用独立格式白名单路由。
- 调整 CSS/JS 的物理路径时，须同步调整 `staticFiles` 和 HTML 引用；本地文件存在并不代表服务器会公开该路径。
- `npm start` 直接启动 `server.mjs`，当前没有前端构建步骤。共享导航由显式的 `npm run frontend:navigation` 生成；导航模板和生成后的静态 HTML 一起纳入版本管理。

## 需逐步消除的结构漂移

1. 共享主题变量由 `design-system.css` 定义；后台只保留工作区尺寸变量，认证页保留映射到共享变量的本地兼容别名。
2. `utility-theme.js` 负责主题初始化、偏好同步和主题切换，也负责动态添加移动菜单按钮。
3. `video-frame.css` 明确拥有裁剪与遮挡页共用的框选视觉；工具目录卡片归 `utility-theme.css`。
4. 主导航项集中在 `site-navigation.json`；修改导航数据或模板后需运行 `npm run frontend:navigation` 更新静态 HTML 输出。
5. `video-pricing.html` 的样式、脚本仍有较大内联块。
6. `app.js`、`styles.css`、`admin.js`、`admin.css` 各自包含多个业务区块，后续需按稳定职责边界分批拆分，不能只按行数切文件。
