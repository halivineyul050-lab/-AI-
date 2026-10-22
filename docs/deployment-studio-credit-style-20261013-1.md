# 生图积分栏样式 — 发布记录

- 发布ID：studio-credit-style-20261013-1；成功时间：2026-10-13T14:49:48+08:00。
- 基底：assistant-launcher-20261013-1，完整707文件，仅叠加image-generation.html/css及样式缓存测试。
- 充值改为紧随余额的32px高透明描边小按钮，文案充值+；积分账户为轻量链接，消耗与余额采用灰色层次，去除右侧孤立布局。手机采用两行布局；直接跳转/recharge保留。
- 本地552通过/3环境跳过，服务器555全部通过；全量JS语法、138个Logo检查通过。原选择器横向排版规则保持在媒体规则之后。
- 浏览器：充值按钮约61x32、透明背景、细边框；390px下容器与滚动宽度均358px；点击进入/recharge。截图保存在docs/design-previews/20261013-studio-credit-desktop.png及mobile.png。
- 公网：服务active，ready status=ok/database=true，真实生图HTML具有compact actions及/recharge链接、新缓存；线上CSS SHA256与候选一致。
- 代码备份：/opt/nikai-ai-backups/releases/previous-20261013-144836-studio-credit-style-20261013-1。
- 数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261013-144939-2141507.sql.gz；无迁移。
- SHA256：8b63fc11747563740703888c9e59f7fa061ed3a3229b589de2949f3c76985db7。
