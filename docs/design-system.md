# 泥壳AI界面设计系统

全站以紫色卡片为主视觉。公共页面、账号页、后台、实用工具和价格页使用相同的页面底色、卡片、边框、阴影、圆角和交互色；小游戏只统一页面外壳，玩法区域继续保留各自配色。

## 核心资源

- `design-system.css`：颜色、间距、圆角、阴影、焦点和深色模式。
- `utility-theme.css`：工具页布局与通用组件。
- `game-shell.css`：小游戏的页面宽度、介绍区和游戏容器外壳。
- `styles.css`、`auth.css`、`admin.css`：对应业务区域的页面细节。

## 使用规则

新页面先加载 `/design-system.css`，再加载页面样式。颜色应使用 `--bg-page`、`--bg-surface`、`--text-primary`、`--text-secondary`、`--border`、`--brand` 和状态色变量。卡片优先使用 `--radius-xl`、`--shadow-sm`；主要按钮使用 `--brand-gradient`。

深色模式通过根元素的 `data-theme="dark"` 启用，并与 `nike-theme` 本地偏好同步。未保存偏好时跟随系统主题。游戏画布、棋盘和主题插画可以保留独立色彩，但其外围卡片需使用共享边框、圆角和阴影。
