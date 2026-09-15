# 休闲小游戏部署 · 2026-09-09

发布 casual-games-20260909 完成。大厅 /games，四游戏 /games/never-retreat、/games/snake、/games/gomoku、/games/flight。主站及既有工具页面均在小工具旁增加休闲小游戏导航，移动抽屉同步。游戏卡片移出 /utilities；旧 /utilities/never-retreat 返回301到新路由。

验证：项目106项测试通过（生产发布再次通过）；游戏核心19项涵盖碰撞、计分、胜负、AI堵棋和移动边界。浏览器验证五子棋人机2手、悔棋退回0手、本地双人五连获胜；贪吃蛇开始/暂停/继续/撞墙结束/重开；飞行器运行得分290后死亡、重新挑战与重开恢复3护盾、暂停；375px三个新游戏与大厅无页面横向溢出。修复了射击游戏P键长按反复切换、按钮空格被拦截，以及五子棋暗色面板变量。

服务器 /opt/nikai-ai，既有release-production.sh完成数据库及代码备份。快照 /opt/nikai-ai-backups/releases/release-20260909-164800-casual-games.tgz。源站HTTPS证书验证通过，大厅/四游戏/四核心模块均200、旧链接301，服务active。

公网复查 http://ontimo.cn/games 仍403、HTTPS请求失败；既有阿里云备案拦截问题未解决，不能宣称公网可访问。游戏本身无需后台模型或新增依赖。
