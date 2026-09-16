# AI 生图导航与占位页发布记录 · 2026-09-16

## 发布结果

- 线上地址：`https://ontimo.cn/image-generation`
- 发布版本：`ai-image-placeholder-20260916-e3285e1`
- 发布时间：`2026-09-16T18:04:45+08:00`
- 回滚快照：`/opt/nikai-ai-backups/releases/release-20260916-180424-ai-image-pla.tgz`

## 变更内容

- 全站 19 个静态页面的主导航增加“AI 生图”，位于“小工具”之前。
- 首页桌面导航与移动侧栏同步增加入口。
- 新增 `/image-generation` 紫色大卡片占位页，预告提示词创作、参考图编辑和多尺寸输出。
- 页面明确说明后续接入 GPT 图片生成 API；当前没有提示词输入、图片上传、生成请求或外部 API 调用。
- 服务端注册新页面和样式，并将新地址加入动态与静态站点地图。

## 验证证据

- TDD 红灯确认：实现前 `/image-generation` 返回 404，主导航缺少入口。
- 聚焦测试：6/6 通过。
- 本地完整测试：155/155 通过，0 失败。
- 浏览器检查：1440px、1024px、390px 三档页面 `scrollWidth` 均等于视口宽度；1440px 导航完整显示，中小屏正常折叠。
- 生产发布测试：126/126 通过，0 失败。
- `nikai-ai.service` 与 Nginx 均为 `active`，健康接口返回 `status=ok`、`database=true`。
- 线上 `/image-generation`、`/`、`/utilities`、`/games` 均返回 HTTP 200；新页面文案、首页导航和 sitemap 入口均已核验。
- 25 个发布文件 SHA-256 全部与本地一致。关键文件：

```text
image-generation.html    be9febe5833b18fe173f1987eb7c55b093128c5bbb49c7f1054aa38b337e713c
image-generation.css     f0a898810979d44d7f30f7bc80c062b0cf73ce104e005109df367da5e7fab07b
server.mjs               2cff4811c43b43cfeb241f47214af52eac63d1936cf0828a533c7c10e1eeadde
index.html               fafe42dbc9c9403a50e559b8cbeb99a96fe3338f448386ebc580a1f3df984c0e
sitemap.xml              2dfd0a3812f9a71778a40034cbb0885f426a1a4b7b447676faf49e886f262da3
```

## 发布方式

通过既有已授权 SSH 通道上传最小发布包，由 `/opt/nikai-ai/scripts/release-production.sh` 完成数据库备份、应用快照、生产测试、服务重启和就绪检查；失败时自动恢复上述快照。
