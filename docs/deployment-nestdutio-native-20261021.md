# NeStudio 原生小程序与成本核算发布记录

- 发布 ID：`nestdutio-native-20261021-1`。
- 成功时间：2026-10-21 11:09:18 +08:00。
- 正式入口：已授权 SSH `admin@47.93.245.219`，服务器现有 `release-production.sh`；发布历史为 `success`。
- 基底：线上 `analytics-clarity-20261020-2` 完整源码快照，仅叠加本轮 NeStudio 代码、测试与文档。没有带入工作区其他资讯改动、真实配置、数据库或用户内容。
- 范围：逐请求 Token / 采购成本核算、管理端用量报告、网页业务检查和续写修复、微信原生工程生成与导出、目标隔离、AppID 配置与发布准备、本地微信开发者工具 CLI。迁移 43、44 已应用。
- 发布包 SHA-256：`82c8f38eaa016ddb2cd7c3155ab86b04929b49eacc97ae8ca0afd982d54deaa4`，上传前后相同。
- 本地 Node 22.18.0：869 项，866 通过、3 跳过、0 失败；依赖、全部前端脚本语法、服务入口语法、138 个图标检查通过。
- 服务器 Node 22.18.0：869 项全部通过，无跳过；发布脚本完成备份、迁移、切换与就绪检查。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261021-110904-2535256.sql.gz`。
- 回滚目录：`/opt/nikai-ai-backups/releases/previous-20261021-110237-nestdutio-native-20261021-1`。
- 服务：`nikai-ai.service` 为 active；内部和公网 `/api/v1/health/ready` 均返回 `status=ok,database=true`。
- 公网浏览器：`https://ontimo.cn/nestdutio` 正常加载；JS/CSS 缓存版本为 `20261021-native-1`；网页/微信小程序目标按钮切换生效；原生说明显示需微信编译与手机验证；无横向溢出、无失败资源，交互期间捕获的 error/unhandledrejection/console.error 为零。
- 公网 API：配置返回 web/wechat 两种目标，均已就绪；生产仍为每次 20 积分的 fixed 模式，未擅自改变商业定价。管理端用量接口在当前已登录浏览器会话返回 200。
- 静态核验：线上 HTML、JS、CSS SHA-256 与经过测试的发布包一致，新版管理端脚本与工作台 JS/CSS 均 HTTP 200。
- 本机直接 curl HTTPS 曾连接重置；服务器外网 HTTPS 与本机真实浏览器均验证成功。截图捕获超时，未将其计为成功证据。
- 微信验证边界：用户尚无 AppID，微信开发者工具编译、真实预览二维码、手机业务测试与上传仍待完成；本次上线未代替微信审核或发布，也未为线上验收发起额外付费模型生成。
