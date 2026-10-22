# NeStdutio 数据应用发布记录（2026-10-16）

- 发布 ID：`nestdutio-data-20261016-2`，成功时间：2026-10-16 12:48:59 +08:00。
- 基底：线上完整 `nestdutio-header-20261016-1`；仅叠加 manifest 内 50 个经过审阅的文件，未打包脏工作区、配置密钥、数据库或用户内容。
- 发布方式：已授权 SSH + 服务器原有 `/opt/nikai-ai/scripts/release-production.sh`。
- 发布包 SHA-256：`2d0e0c923f93abbc9c29622f5851e32a6f55b5fcddc6c8973826bbcb1a75fde8`，上传前后相同。
- 回滚快照：`/opt/nikai-ai-backups/releases/previous-20261016-124558-nestdutio-data-20261016-2`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-124848-2267038.sql.gz`；兼容迁移 35、36 已应用。

## 范围与验证

增加声明式真实表单、作者数据分页/CSV、带固定 SQLite 后端的独立源码包、自定义域名所有权验证和独立证书任务。生成代码仍只作为网页资源，模型后端代码不执行。补充原生表单事件、非法请求不终止导出服务器、移除失败重试、DNS/移除竞态、数字完整匹配回归。保留主站基础样式以避免导航变形。

完整本地测试 707 项：704 通过，3 项 Windows 平台跳过，无失败。服务器正式预检 707/707 通过，无跳过；语法检查、138 个 Logo 资源验证通过。第一轮 `nestdutio-data-20261016-1` 因 root 预检浏览器与下载目录归属不同而在预检失败，未执行迁移或切换；测试已使用沙箱用户专属目录并保留真实下载检查，第二轮通过。

实际模型生成报名表单、继续修改保留字段、浏览器真实提交均通过。该实际生成作品导出到干净目录运行后可提交，独立进程重启仍能读取记录。另实际生成了持久化清单与两页网站，计算器重新生成后通过验收，并以独立等额本息公式核对本金120000、12期、年利率0与4.2两组月供及利息；不表示任意需求都能一次生成成功。

线上服务和域名 timer 为 active，就绪接口 HTTP 200、database=true；公网工作台与 CSS/JS 返回200，CSS/JS 摘要和归档一致，服务器 HTML 摘要和归档一致（公网 HTML 经主站模板渲染）。原站 `/styles.css` 引用仍在。

真实公网发布报名页，匿名提交入库1条，重复请求幂等；两个独立客户端使用作者会话均可读，匿名401、其他账号404、公开记录接口404，CSV实际下载内容正确，内部证书 API 公网404。验收临时账户及会话已删除；演示作品已移交唯一站点超级管理员，可从工作台继续管理。

- 演示作品：`97b79faf-3a04-4cd1-9b99-af0595666b32`
- 发布版本：`4d651a2e-c563-4500-a483-a56885faa586`
- 公网地址：https://demo-nestdutio-bab4fb85.apps.ontimo.cn
- 工作台：https://ontimo.cn/nestdutio?project=97b79faf-3a04-4cd1-9b99-af0595666b32

独立 root 证书任务与策略模块已核验摘要后安装到 `/usr/local/libexec/nikai-nestdutio-domains`；密钥仅服务器 root0600 环境文件持有。Nginx 配置检查通过，证书 timer 启用且空队列运行成功。原通配代理配置备份：`/var/tmp/nikai-nestdutio-nginx-before-data-20261016.conf`。

## 尚待用户 DNS 操作

用户选定 `demo.ontimo.cn`，已创建真实绑定 `1bf22156-e9a9-4b55-b1ca-3bb1f7ffb358`，当前 waiting_dns；尚未签发其证书，不能声称自定义域名公网验收完成。

- A：名称 `demo`，内容 `47.93.245.219`，仅 DNS。
- TXT：名称 `_nestdutio.demo`，内容 `nestdutio-verification=NZrguhuU3ndDpaclcNCwjE7Ub0H7O3JG`。

等待解析后，需经实际 verify API 入队、证书任务申请、HTTPS 当前版本检查和别名表单提交验证，再更新本记录。现有 apps/preview 通配证书为人工 DNS 验证，期限到2027-01-13，仍需人工续期；新自定义域名有独立 HTTP 验证与续期任务。
