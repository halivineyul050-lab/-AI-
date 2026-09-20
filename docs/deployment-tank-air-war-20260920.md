# 坦克飞机大战发布记录 · 2026-09-20

## 发布结果

- 线上地址：`https://ontimo.cn/games/tank-air-war`
- 游戏大厅：`https://ontimo.cn/games`
- 发布版本：`tank-air-war-20260920-a94fd23`
- 发布提交：`a94fd23`
- 发布时间：`2026-09-20T12:23:22+08:00`
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260920-122303-tank-air-war.tgz`

## 变更内容

- 新增“坦克飞机大战”独立游戏路由和完整静态资源。
- 游戏页新增固定的“返回休闲小游戏”入口，并完成手机端适配。
- 休闲小游戏大厅增加第十张游戏卡片和坦克雷达主题封面。
- 服务端补充游戏目录路由、静态资源访问和路径穿越保护。
- 站点地图加入游戏地址。

## 验证证据

- TDD 聚焦测试：30/30 通过，覆盖游戏路由、静态资源、返回入口、大厅卡片、站点地图和路径穿越保护。
- 本地完整测试：158/158 通过，0 失败。
- 本地浏览器检查：桌面端主菜单、设置、帮助、战绩和开始作战流程正常；WebGL 画布与 HUD 正常显示；390px 手机视口横向溢出为 0；控制台无错误。
- 生产发布测试：129/129 通过，0 失败。
- `nikai-ai.service` 与 Nginx 均为 `active`，健康接口返回 `status=ok`、`database=true`。
- 线上游戏首页、样式、主脚本、Three.js、图标、游戏大厅和站点地图均返回 HTTP 200。
- 线上游戏页包含正确的资源基址和返回链接；游戏大厅包含“坦克飞机大战”入口；站点地图包含游戏地址。
- 19 个发布文件 SHA-256 全部与本地一致。关键文件：

```text
games.html                         506fa49e2be6ee7266cc3fa1a92cc58aca70c68b645a7324a377594515e7d6fa
games.css                          45ffdca52411521610a4b7bc433ef5d9933bca9831649625b37b1ee9a4547ae7
server.mjs                         9fcada91b85c941a1a1828b58365e2588f2730a56a39631d821fc49421ea65ce
games/tank-air-war/index.html      62ed2254b918a4eee664da61220520da607a941083b482e9a2f0708507c8299c
games/tank-air-war/js/main.js      c7378d79b1e439884667f69edb3c466a6c291f6f1345190af85752563ecfda7b
```

## 发布与回滚

发布复用既有 SSH 通道与 `/opt/nikai-ai/scripts/release-production.sh`。发布流程在切换文件前创建应用快照，执行生产测试并检查服务就绪状态，失败时自动恢复。

如需手动回滚，将回滚快照解压恢复到 `/opt/nikai-ai`，重新启动 `nikai-ai.service`，再检查 `/api/v1/health/ready`。
