# 视频模型价格表发布记录 · 2026-09-15

## 实际发布方式

本次沿用 2026-09-08 和 09-09 成功使用的方式：从已授权本机 SSH 上传差量包，在 47.93.245.219 上执行 `/opt/nikai-ai/scripts/release-production.sh`。GitHub 推送成功不等于生产发布成功；GitHub Actions #22 已失败，不能作为上线凭证。

发布版本 `video-pricing-20260915`，服务器成功时间 `2026-09-15T10:32:23+08:00`。

上传差量包仅包含四个文件：

- `video-pricing.html`：用户提供的完整价格表。
- `index.html`：桌面和移动导航增加“视频模型价格”。
- `server.mjs`：基于发布前下载的生产文件，只增加价格页白名单与此页专用 CSP。
- `tests/video-pricing.test.mjs`：价格页可访问与 CSP 隔离回归测试。

本地 server.mjs 比生产多出三个游戏的路由；本次差量发布保留生产原有路由，没有用整份本地 server.mjs 覆盖生产。未上传本地配置、数据库、模型、报告或研究资料。

## 验证

- 发布前本地全量测试 124/124 通过。
- 浏览器实际显示 17 个模型、23 行（含分组）；1080p 切换、人民币换算、对比表 17 行、导出弹窗通过。
- 生产全量测试 107/107 通过，脚本输出 `Release completed: video-pricing-20260915`。
- `nikai-ai.service` 和 Nginx 均 active；数据库健康状态 ok。
- 源站证书校验正常：`curl --resolve ontimo.cn:443:127.0.0.1 https://ontimo.cn/video-pricing.html` 返回 HTTP 200、63941 字节、no-store。
- CSP 仅对此价格页允许原文的内联脚本、事件处理器和 ai.fun.tv 连接，主站及后台脚本策略不变。
- 实时更新界面保留，但本次未使用平台登录令牌调用计费 API，不能据此声称跨域实时更新已经实测。
- 四个文件上传后及发布后 SHA-256 均一致。

```text
server.mjs                    72c7ad8e2a3e28ae193fb29212fc7f181b748817f327cde3d8bd84e2c2b03bdb
index.html                    75891aa80bc0bfa58df2a8e7e1d8fbb86c2fcf32777faf5de811cc0352683773
video-pricing.html            9afaf38fdfc9b231591079a8641930d37f34c276f214ca8c66cccd5e10ae925f
tests/video-pricing.test.mjs   48fc5b2cc10667bf4bd2c9ab8da4da0ca80300a4c6d2d3908de2022bc597e050
```

## 备份与恢复

既有发布脚本已执行数据库备份和代码快照。代码快照：
`/opt/nikai-ai-backups/releases/release-20260915-103208-video-pricin.tgz`。

发布历史：`/opt/nikai-ai-backups/releases/release-history.log`。
必要时用既有 `rollback-production.sh` 和上述代码快照恢复。

## 公网状态

发布后本机复查：公网 HTTP 返回 403，页面标题 `Non-compliance ICP Filing`，内容指向阿里云备案拦截页；公网 HTTPS 连接被重置。此现象与 09-08/09-09 部署记录一致。

结论：新页面已实际发布至生产服务器，源站正常；公网域名仍受云平台备案拦截，不能声称所有公网访客已可访问。需通过域名备案/接入管理处理，不是反复推送代码能够解决的问题。
