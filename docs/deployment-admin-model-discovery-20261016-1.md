# 后台模型列表自动获取：生产发布

- 发布 ID：`admin-model-discovery-20261016-1`。
- 完成时间：2026-10-16 18:41:56（Asia/Shanghai）。
- 目标：`admin@47.93.245.219`，正式站点 `https://ontimo.cn/`。
- 通道：本机既有 SSH 身份、严格主机指纹校验，调用服务器既有 `/opt/nikai-ai/scripts/release-production.sh`；脚本 SHA-256 发布前后均为 `65ae42f2f63f38cdede125c6f1ffaf2c45f376c09b5ef07457663d6b19fd1663`。
- 基底：线上 `backtotop-20261016-1` 完整源码快照，SHA-256 为 `082f1847beacb43bc0cca524780a1bf07e8c9c47c2601f56284c0ba7b3847090`。
- 发布包 SHA-256：`46c9f60c274585750b7c2efc81c4b28cdd7f9cd65c4766fe848c7acf624df602`，上传前后一致。
- 代码回滚快照：`/opt/nikai-ai-backups/releases/previous-20261016-183749-admin-model-discovery-20261016-1`。
- 数据库备份：`/opt/nikai-ai-backups/mariadb/nikai-ai-20261016-184145-2299837.sql.gz`。
- 数据库迁移：无新增迁移。

## 范围与隔离

后台小助手、原理讲解、NeStudio、Skills 在线执行、资讯 AI 摘要及图片模型统一支持获取服务商模型列表后选择。支持根地址、版本地址与完整聊天接口地址，保留已保存模型，提供刷新和错误提示，避免旧请求覆盖新输入。读取列表不触发生成或修改已有模型配置。

仅叠加发布清单中的 24 个审阅文件及清单本身。`server.mjs` 只从生产文件添加模型发现 import、静态白名单及管理员路由；工作区中未发布的资讯接口等差异未纳入。保留生产 package.json、锁文件、全部迁移、原有迁移断言及其他生产文件。保留 `.env.example`；发布包排除真实环境文件、数据库、用户数据、依赖和 Git 目录。

清单：`deployment-admin-model-discovery-20261016-1.manifest.json`。

## 测试与上线验证

- 本地干净发布目录使用与服务器相同的 Node v22.18.0。`npm ci` 成功；服务入口与 121 个前端脚本语法检查通过；全量 742 项：739 通过、3 项 Windows 条件跳过、0 失败；138 个图标校验通过。
- Linux 发布脚本干净目录全量测试 742/742 通过，0 失败、0 跳过。没有修改或跳过工作区曾失败的迁移断言；这些断言在生产基底中原本正确。
- 发布独立审阅无阻断项。归档路径和文件类型检查通过；所有相对生产基底的改动均在审阅清单内。
- 服务为 `active`；回环及真实公网健康接口 HTTP 200、`database=true`；release history 标记本版本 `success`。
- 正式站点 Chrome 读取首页及 `/admin` 均为 HTTP 200；新选择器与后台脚本版本 `20261016-models-1` 已存在；8 个相关 JS/CSS 公网 HTTP 200，内容摘要全部匹配发布包。匿名模型发现请求返回 401。公网首页 JavaScript 错误为 0。
- 服务器 24/24 个审阅文件摘要与发布清单相同。
- 通过服务器运行环境中已有管理身份进行只读 API 验证，未输出或保存令牌与密钥。小助手和 Skills 各返回 9 个模型，且当前模型在列表中；资讯摘要返回 7 个模型；图片平台返回 4 个模型。讲解与 NeStudio 当前继承小助手配置。
- 资讯摘要当前保存的模型未出现在服务商返回列表中；已保留原配置，告知用户在后台确认后自行选择，没有擅自更换。

证据：`admin-model-discovery-public-evidence-20261016.json`、`admin-model-discovery-live-model-evidence-20261016.jsonl`。真实生产模型列表检查不执行生成、保存配置或修改计费。

## 清理

验证证据已保存到项目 docs。临时文件清理命令被自动审批以 `blocked by policy` 拒绝，未执行，未提供更具体原因。服务器基底临时归档 `/tmp/nikai-model-discovery-base-20261016-1.tgz` 和本地临时发布目录 `C:/Users/zhanglian2/AppData/Local/Temp/nikai-model-discovery-20261016-1` 均确认仍然存在；未尝试绕过策略清理。服务器正式回滚与数据库备份按发布脚本保留。此清理限制不影响已成功发布的版本。
