# 统计准确性和展示修正

- 版本：`analytics-clarity-20261020-2`
- 成功时间：2026-10-20 15:37:37 +08:00。
- 目标：已核验的 `admin@47.93.245.219`，使用服务器既有 `release-production.sh`。
- 发布包 SHA-256：`4034e38bc3d48601fa47a5b20b3bfdf167e9c89c2f5f3f8e06fe56fa1bde7d27`，上传前后相同。
- 代码备份：`/opt/nikai-ai-backups/releases/previous-20261020-153136-analytics-clarity-20261020-2`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261020-153724-2502248.sql.gz`。
- 无新增迁移，无历史数据重写。

## 范围

以当前完整生产快照为基底，只叠加 14 个经过审查的文件：`backend/monitoring.mjs`、`backend/mariadb-compat.mjs`、`public/admin.css`、`public/admin.html`、`public/admin.js`、`public/app.js`、`public/index.html`、`public/seo-analytics.js`、`server.mjs`，以及 5 个相关测试文件。服务入口只修改 5 处 SEO 统计脚本缓存版本。工作区的其他新闻功能、迁移和改动未发布。

修正 MariaDB JSON 字符串提取，恢复来源和设备的中文分类；日均 UV 按每日去重 UV 之和求平均；维度 UV 占比分母采用整个窗口去重 UV；无效、缺失维度计为未知；今天按昨天同一时刻比较（覆盖午夜与不足一小时）。无上期基数时界面不再显示虚假的百分比增长。页面名称改为中文，并去除粘连的内部页面类型。

来源、设备区域展示中文解释、浏览次数、访客数和浏览占比条，说明缺失来源、浏览器去重及设备推断的限制。单页跳出指标改名为“单页无互动占比”，明确是窗口内会话的代理指标。官网点击指标直接标明分子与分母。

两套设备采集脚本不再把电脑微信浏览器自动识别为手机；无 Mobile 标识的 Android 识别为平板。历史没有原始设备信息，未重算旧分类。

## 验证

- 独立审查通过：14 文件（11 修改、3 新增），无缺失或额外污染。
- 完整本地回归：825 项，822 通过、0 失败、3 项既有 Windows 环境跳过；之后仅修正浏览器测试的 DOM 刷新竞态，该测试在 Windows 和 Linux 单独通过。
- 最终完整服务器回归：825 通过、0 失败、0 跳过。
- JavaScript 语法检查通过，138 个工具图标校验通过。
- 浏览器测试覆盖 1440、390、320 像素，校验中文分类、比例条、无上期浏览提示、无横向溢出和页面错误。
- 第一轮 `analytics-clarity-20261020-1` 因浏览器测试跨自动刷新读取节点尺寸失败，在 preflight 中止，未切换生产。修正为一次读取一致 DOM 快照，保留全部断言，随后重新执行正式发布流程。
- `nikai-ai.service` active；就绪接口 HTTP 200、`database=true`；release history 为 success。
- 受保护的真实统计 API HTTP 200：15:37:58 北京时间窗口内 PV 73、UV 7；来源 direct 73/7、电脑 72/6、手机 1/1。来源和设备 PV 分别与总 PV 相等；标签为中文且没有 JSON 引号；比较窗口为昨天同一时刻。
- 从服务器通过正式域名 HTTPS 获取 `/admin`，引用新缓存版本；`admin.js`、`admin.css`、`app.js` 的域名响应摘要与发布包一致。
- 本机直连 `https://ontimo.cn/api/v1/health/ready` 在发布前后都出现连接重置；服务器侧正式域名访问成功。公网可达性仍有这一外部验证限制，不能把服务器更新结果描述为所有客户端访问均已验证。

## 数据解释

73 次浏览、7 个浏览器访客标识与截图时的数据库记录一致，不代表 7 位已确认真人。direct 表示没有收到来源信息，可能包含输入网址、收藏、聊天链接或隐私设置隐藏来源，不能还原缺失的历史来源。设备依据浏览器信息推断，历史错误分类无法据现有数据可靠重算。

## 临时文件

已尝试对校验过的本机 Temp 子目录执行原生 PowerShell `Remove-Item -LiteralPath ... -Recurse -Force`，自动审批策略拒绝（`blocked by policy`）。未改用其他方式绕过；保留 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-analytics-20261020/`（源码基底、最终包、独立 stage、测试和发布日志）。服务器 `/tmp/nikai-analytics-base-20261020.tgz`、`/tmp/nikai-analytics-20261020.tgz`、`/tmp/nikai-analytics-20261020-v2.tgz` 和 `/tmp/nikai-analytics-qa-20261020/` 亦保留，后者的 node_modules 只是指向服务器依赖的符号链接。未包含或下载真实环境文件、数据库、用户内容或密钥。
