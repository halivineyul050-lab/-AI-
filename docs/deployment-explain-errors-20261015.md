# 交互讲解生成失败修复

发布版本：`explain-errors-20261015-1`，2026-10-15 13:12:02 +08:00，release history 为 success。

用户报告“生成失败，请稍后重试”，原请求在11:56:29返回502、耗时46.68秒。旧后端没有记录细分原因，因此不能断言原请求的具体上游错误。使用用户同题“车是怎么制作的”复现：模型返回200，但生成汽车制造阶段切换时使用eq/gte比较，原安全表达式引擎不支持，校验报Unsupported expression；重试还观察到超时与无效JSON。另确认前端错误读取body.error.message，而接口实际返回Problem JSON的code/title/requestId，导致所有错误被笼统提示覆盖。

本次仅覆盖8个审阅文件：backend/explainer.mjs；public/explain.js、explain.html、explain-ai.mjs、explain-scene.mjs；tests/explain-ai.test.mjs、explain-ai-api.test.mjs、explain-errors.test.mjs。增加安全的eq/gte/lte比较，保留表达式白名单；前端按实际错误码区分校验、截断、超时、服务拒绝、额度和并发，并显示请求编号。诊断日志只记录阶段、次数、HTTP状态、固定枚举校验原因、长度等，不含问题正文、模型原始输出、地址或密钥；自动修正请求带上白名单校验原因。没有依赖、数据库迁移或模型配置变化。

以当前线上explain-placement-20261015-1完整源码为基底，排除真实配置、用户数据和依赖；基底SHA256为c334ec9185d83de24b04eaa79c6f3f4b4d52cabe994e88fabb52244261ffed47。完整发布包SHA256为575b14a4acb960d59a39eaedc1cafcccc8b8fed886dddec620aed89087e2067c，上传前后一致，使用现有release-production.sh发布。

- 代码快照：`/opt/nikai-ai-backups/releases/previous-20261015-131034-explain-errors-20261015-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261015-131152-2226931.sql.gz`。
- 本机完整629项：626通过、3项平台跳过、0失败；服务器629项全部通过。完整JavaScript语法检查、138项Logo验证通过。
- 修复前回归测试确认失败，修复后比较运算、错误提示、请求编号、退款与安全日志回归通过。
- 候选代码调用真实已配置模型，同题成功生成“汽车核心制造流程交互演示”，19元素、4控制项。诊断使用只读配置和空额度结算器，未占用真实用户额度。
- 真实公网Chrome确认explain.js缓存版本errors-1，模块gte运算可运行，配置ready=true、健康database=true、控制台无脚本错误；服务active。模拟接口仅用于错误文案与390px无横向溢出回归，与真实模型验收分开记录。

上线后使用临时普通会员，通过真实https://ontimo.cn/api/v1/explain/generate提交同题，HTTP200，耗时30545毫秒，返回“汽车基础制造流程交互演示”。临时会员、会话、额度记录随后删除，删除会员数量1；未改动真实用户额度。将本次真实结果通过分享参数加载公网页面，4个滑块正常，拖动冲压力度后SVG变化，控制台无错误。截图output/interactive-explainer/car-manufacturing-production.png。生成排版仍有局部边缘裁切，结构可运行不代表模型的布局和内容质量全部合格；本次不以模拟结果代替真实生成成功。

隔离目录位于系统Temp，遵守此前清理策略限制，不尝试绕过被拒绝的递归清理。服务器本次临时探针、结果、基底与发布归档在验收后删除，正式版本与回滚备份保留。
