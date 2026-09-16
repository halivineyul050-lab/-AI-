# 休闲小游戏杂志式排版发布记录 · 2026-09-16

## 发布结果

- 线上地址：`https://ontimo.cn/games`
- 发布版本：`games-layout-20260916-9122940`
- 发布时间：`2026-09-16T17:14:51+08:00`
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260916-171432-games-layout.tgz`

## 变更内容

- 九张等权双列卡片改为用户选择的杂志式不对称拼贴。
- “一人不撤2 · 残铁战线”作为超大主卡；“一人不撤”和“用不后退”作为两张横向重点卡；其余六款组成三列紧凑卡片。
- 桌面端使用 12 列网格，中屏使用两列，手机端使用单列。
- 新增键盘焦点样式，保留原有链接、说明、控制方式、主题和减少动画设置。

## 验证证据

- TDD 红灯：新增角色类测试首次运行时按预期失败（缺少 `game-card--hero`）。
- 聚焦测试：`tests/production-games.test.mjs` 5/5 通过。
- 本地完整测试：153/153 通过，0 失败。
- 浏览器尺寸检查：1440px、1024px、390px 三档页面 `scrollWidth` 均等于视口宽度；九张卡片边界全部位于视口内。
- 生产发布测试：120/120 通过，0 失败。
- `nikai-ai.service` 与 Nginx 均为 `active`；生产健康接口返回 `status=ok`、`database=true`。
- 服务器源站 `/games` 返回 HTTP 200，并包含 `game-card--hero` 与 `games.css?v=20260916-2`。
- 三个发布文件与本地 SHA-256 完全一致：

```text
games.html                         49610bd816c4a1c1549b4626c19c570dcc15c877ef1ec1b9fbe0abc47523a53c
games.css                          ed5ffa4714668768e0e21f0efdc53e3235b5b9226572511e62273002491a8378
tests/production-games.test.mjs    880e8639d36c168e9806154a4ef343d69a4fb78cea3cddf428123756e4449bad
```

## 发布方式

沿用服务器现有安全发布流程：差量归档上传到已授权服务器后，由 `/opt/nikai-ai/scripts/release-production.sh` 先备份数据库与应用，再执行生产测试、重启服务并验证就绪状态；失败时自动恢复上述快照。
