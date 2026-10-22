# 自由都市 3D 上线记录

- 发布 ID：`free-city-20261008-1`（2026-10-08 13:49 CST）。
- 变更：新增程序化低多边形城市驾驶游戏；接入 `/games/free-city-3d`、游戏大厅（12 款）与 sitemap。Three.js 使用站内现有资源，点击开始后才加载。
- 发布基底：线上 `catalog-n1-20261008-1` 完整应用快照；只叠加本游戏目录、生产路由/sitemap、游戏大厅入口与必要样式/测试。未打包工作区其他更改。
- 发布包 SHA-256：`ab2f3f8f64b71198ac4b5d5a2508f2010f1f6f1bcb6c38e74283301a0dc4cf5b`，上传后校验一致。
- 验证：发布脚本干净树测试 353/353 通过；本机完整发布基底测试 350 通过、0 失败、3 跳过；JS 语法检查通过；Logo 138/138。
- 生产：`nikai-ai.service` active；本机与公网 readiness 均 200，`database=true`；发布历史 `success`。
- 公网检查：游戏大厅、游戏页、main.js、world.js、style.css、Three.js 和 sitemap 均 200；大厅显示 12 款并包含新游戏。Edge 浏览器点击公告后进入游戏，Canvas 1280×800，加载完成且无 page errors。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261008-134843-free-city-20261008-1`；数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261008-134925-1936648.sql.gz`。
- 注：发布脚本切换时一次即时 readiness curl 连接被拒绝；数秒后 service active 且本机/公网 readiness 均 200。Windows PowerShell 对公网证书链验证失败，公网资源核验由生产主机 curl 与 Edge 浏览器完成。
