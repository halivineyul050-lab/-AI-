# 泥壳AI界面设计系统

全站以紫色卡片为主视觉。公共页面、账号页、后台、实用工具和价格页使用相同的页面底色、卡片、边框、阴影、圆角和交互色；小游戏只统一页面外壳，玩法区域继续保留各自配色。

## 核心资源

- `design-system.css`：全站唯一的颜色、字体、间距、圆角、阴影、状态色、全局基础控件和浅色/深色主题来源。
- `styles.css`：主站样式清单，按固定层级导入 `assets/css/site/site-shell.css`、`site-catalog.css`、`site-content.css`、`site-overlays.css` 和 `site-responsive.css`；不再定义全局 token。
- `utility-theme.css`：工具与部分游戏页面共用的工作区控件、目录卡片和移动导航；页面按“设计系统 → 主站公共样式 → 工具公共主题 → 功能样式”加载。视频裁剪与遮挡共享的选区交互由 `video-frame.css` 提供。
- `game-shell.css`：小游戏的页面宽度、介绍区和游戏容器外壳。
- `auth.css`、`admin.css`：对应业务区域的页面细节，消费设计系统变量；后台可保留独立的工作台布局。

## 使用规则

新页面按“`design-system.css` → 页面组公共样式 → 功能样式”加载。颜色应使用 `--bg-page`、`--bg-surface`、`--text-primary`、`--text-secondary`、`--border`、`--brand` 和语义状态色变量（包括 `--success`、`--warning`、`--danger`、`--info`、`--coral`、`--amber`、`--blue`）。卡片使用共享圆角和阴影变量；主要按钮使用 `--brand-gradient`。不要在 `styles.css`、`utility-theme.css` 或业务页 CSS 里重新定义这些全局变量。

深色模式通过根元素的 `data-theme="dark"` 启用，并与 `nike-theme` 本地偏好同步。未保存偏好时跟随系统主题。游戏画布、棋盘和主题插画可以保留独立色彩，但其外围卡片需使用共享边框、圆角和阴影。

导航项在 `scripts/frontend/site-navigation.json` 维护；修改数据或模板后运行 `npm run frontend:navigation`，并提交重新生成的静态 HTML。公共 token 与基础控件归 `design-system.css`，主站布局归 `assets/css/site/`，工具和游戏保留各自功能布局与玩法视觉。
