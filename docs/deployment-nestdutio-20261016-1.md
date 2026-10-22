# NeStdutio 首版发布记录

- 发布：`nestdutio-20261016-1`，2026-10-16 10:02:41 +08:00。
- 正式入口：<https://ontimo.cn/nestdutio>。创作与效率二级导航已加入入口。
- 基底：核验后的生产完整版本 `explain-validation-20261015-1`，只叠加本次审阅文件；未整体发布脏工作区。
- 归档 SHA-256：`f9acc28c0d5b838c9f6db470b5a73d753f6f462829dabb5bdc614e0e63faf982`，本机与服务器一致。
- 唯一切换命令：服务器现有 `release-production.sh`；发布历史为 success。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261016-100017-nestdutio-20261016-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-100230-2251242.sql.gz`。
- MariaDB 迁移：033、034。回滚代码不撤销数据库迁移。

## 范围与验证

自然语言生成静态网页、对话修改、不可变版本、独立源预览、沙箱浏览器验收、源码 ZIP、独立模型配置与积分结算；作品子域名发布、草稿隔离、更新、下线、回滚和失败保留旧版。修复发布最终检查前重启时恢复旧版的边界问题。

本地完整测试 684 项：681 通过、3 项环境跳过、0 失败；133 个 JavaScript 文件语法检查通过，138 个 Logo 资源校验通过。服务器既有发布脚本在干净目录执行 684 项测试，全部通过，无跳过。

真实模型生成计数器通过服务器沙箱浏览器检查。临时验收账号与作品完成公网 HTTPS 首次发布、草稿不影响线上、更新、回滚及下线 404；验收账号、会话、作品与版本在 finally 中删除。另通过主站 API 取得真实独立预览链接，在沙箱浏览器执行点击并验证结果，确认预览 HTTPS 和反向代理可用。

桌面与 390px 手机浏览器验证页面可打开、无横向溢出，以及未配置时发布入口不可执行。正式页面、配置 API、就绪接口均可访问；模型配置为继承助手且启用，ready=true，previewReady=true，publishingEnabled=true；当前每次生成 20 积分。服务 active，数据库健康。

## 基础设施和维护

- Nginx：`/etc/nginx/conf.d/nikai-nestdutio.conf`，安装前确认不存在同名配置，`nginx -t` 成功后 reload。apps 转发 4186，preview 转发 4185，独立于主站源。
- systemd：`/etc/systemd/system/nikai-ai.service.d/nestdutio.conf`，只提供 origin/port 环境配置；没有放宽现有服务沙箱。
- 证书：`nestdutio-wildcard`，覆盖两类通配子域名，到期 2027-01-13。仍为人工 DNS 验证，不能自动续期；运维须在到期前重新完成 Certbot DNS 验证并检查 Nginx 加载结果。
- 本次诊断命令没有输出密钥、管理员令牌或真实配置文件内容。

## 当前边界

这一版支持静态网页和浏览器本地保存。云端表单、跨设备数据库、业务登录、支付、自定义域名绑定，以及小程序和原生 APP 尚未接入；工作台会明确提示，不模拟提交成功。完整静态源码可独立运行，但不包含尚未实现的云端后端。
