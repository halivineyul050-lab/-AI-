# 游戏目录与游戏外壳重设计实施计划

**状态：第 3 阶段完成（2026-09-29，目录、七个浏览器小游戏与三个独立大型游戏已做浏览器视觉复核）。**

**Goal:** 完成用户端小游戏目录、七个浏览器小游戏和三个独立大型游戏的页面外壳重设计，同时保留游戏本身玩法与视觉语言。

**Architecture:** 继续使用当前静态多页前端。目录由 `games.html` 和 `games.css` 管理；七个浏览器小游戏通过 `game-shell.css` 统一外壳，保留各自 CSS 的棋盘/场景配色；三个大型游戏仅在各自目录的现有 `style.css` 中调整现有菜单、设置、战绩、暂停和结束层。

**Tech Stack:** 原生 HTML、CSS、JavaScript；不加依赖，不加构建步骤。

## 全局约束

- 覆盖现有 `/games`、七个浏览器小游戏和三个独立大型游戏入口，不更改公开地址。
- 保留用户已有改动；不改 JavaScript、core、canvas 绘制、存储、游戏状态、资源路径、vendor 文件或服务端路由。
- 玩法画布、棋盘、HUD 数据与游戏配色属于玩法内容，本阶段不得被统一品牌样式盖掉。
- 后台不是本次用户端范围。
- 不运行自动化测试、不暂存/提交、不生产发布；仅做浏览器视觉检查。

## Task 1：整理小游戏目录

**Files:**
- Modify: `public/games.css`
- Modify: `public/games.html` only for existing card grouping/layout hooks

- [x] 保留现有 10 个游戏入口、标题、描述、顺序与路由。
- [x] 调整精选卡、宽卡和标准卡的层级、内容密度、焦点/悬停样式与小屏布局。
- [x] 继续使用现有各游戏类型插画，不增加虚构玩法宣传或功能。

## Task 2：统一七个浏览器小游戏外壳

**Files:**
- Modify: `public/game-shell.css`
- Modify: `public/game-2048.css`, `public/memory-game.css`, `public/breakout.css`, `public/snake.css`, `public/gomoku.css`, `public/flight.css`, `public/never-retreat.css` only when a page-specific outer-shell override is needed

- [x] 对齐标题、返回链接、说明文字、状态/HUD、主次按钮、设置/成绩面板和操作提示。
- [x] 保留各自棋盘/画布、像素/游戏色、游戏内 Overlay 和触控布局。
- [x] 检查 1440px 桌面与 390px 手机下棋盘/画布和可触达控制。

## Task 3：收整三个独立大型游戏外壳

**Files:**
- Modify: `public/games/ironfront/assets/style.css`
- Modify: `public/games/tank-air-war/style.css`
- Modify: `public/games/yiren-buche/style.css`

- [x] 只调现有主菜单、设置、帮助、战绩、暂停和结算层的层级与控件样式。
- [x] 保留全屏 canvas/3D 场景、HUD、菜单项、设置项、模态框 ID 和现有事件钩子。
- [x] 检查主菜单及代表设置状态；手机下核对菜单、强制横屏提示和触控区域。

## Task 4：浏览器视觉复核和范围收尾

**Files:**
- Review: 本计划列出的 HTML/CSS
- Update: 本计划完成记录

- [x] 检查游戏目录、七款浏览器小游戏与三个独立大型游戏代表状态。
- [x] 检查浅色/深色、1024px 平板、1440px 桌面、390px 手机、菜单/设置状态与 reduced-motion 声明。
- [x] 审阅差异与工作区状态；游戏资源在静态预览加载。账号与生成式工具相关动态 API 不属于本阶段。
- [x] 不运行自动化测试、不暂存/提交、不发布生产。

## 完成记录

- 目录在桌面、平板和手机均保留 10 个入口；游戏卡片信息、插画与路由未更改。
- 七个浏览器游戏使用共享的标题、返回链接、焦点与表面样式；棋盘、画布、HUD、玩法色和触控布局仍由各游戏自己控制。
- 三款独立游戏保留全屏场景及原主题色；收整了返回控件、菜单容器、设置边界与键盘焦点，补充 reduced-motion 下的装饰动画降频/停用。
- 浏览器视觉检查使用本机静态预览；未运行测试、未暂存或提交、未发布。

## 执行说明

- 共享样式只覆盖游戏外壳专用类，不使用 `utility-theme.css` 新增全局游戏规则。
- 对三个独立大型游戏谨慎修改，因为其菜单、设置、HUD 与 canvas 同属一个专用页面；限定 `style.css` 选择器并逐屏检查。
- 页面代码和资源保持现有路径，不整文件格式化。
