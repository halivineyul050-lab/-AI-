# 生图快捷提示词模板实施计划

> **For agentic workers:** Execute inline in this session. Follow the project's production release runbook; do not deploy the dirty workspace.

**Goal:** 给生图页现有五个快捷灵感按钮加入可直接生成和编辑的完整中文提示词，并按唯一正式流程发布线上。

**Architecture:** 保持 HTML `data-prompt` 与现有点击处理器之间的数据流，只替换五个属性值并新增针对模板内容的静态回归测试。先取得当前生产快照，再只把审核过的页面、测试和发布记录叠加到完整干净发布目录。

**Tech Stack:** Node.js 22、Node.js 内置 `node:test`、静态 HTML、PowerShell OpenSSH、生产发布脚本。

## Global Constraints

- 五个按钮的名称、顺序和页面布局保持不变。
- 单条提示词长度低于 1000 字，无供应商专用参数和未填写占位符。
- 生产发布唯一入口是 `/opt/nikai-ai/scripts/release-production.sh`。
- 发布包以核验后的线上完整版本为基底，只叠加本次审阅文件。

---

### Task 1: 添加提示词内容回归测试

**Files:**
- Create: `tests/image-prompt-templates.test.mjs`
- Read: `public/image-generation.html`

- [x] 写测试解析五个 `.inspiration-chip` 按钮的标签与 `data-prompt`，核对数量、名称、长度、无占位符和分类关键词。
- [x] 在当前页面上运行该测试，确认因提示词仍是短描述而失败：电影感海报只有 22 字。

### Task 2: 更新五条完整提示词

**Files:**
- Modify: `public/image-generation.html`
- Test: `tests/image-prompt-templates.test.mjs`

- [x] 仅替换五个 `data-prompt` 值，不改变按钮、布局、脚本或 CSS。
- [x] 运行新增测试并确认五条内容均可直接使用且符合 1000 字限制；长度分别为 175、167、164、164、175 字。

### Task 3: 按生产基底发布并核验

**Files:**
- Modify in package: `public/image-generation.html`
- Add in package: `tests/image-prompt-templates.test.mjs`
- Add after success: `docs/deployment-image-prompt-templates-20260930.md`

- [x] 用已授权 SSH 核验生产主机指纹、当前版本、健康检查和发布脚本。
- [x] 下载排除密钥、数据与依赖目录的生产应用快照；只覆盖上述页面和测试。
- [x] 在完整临时目录运行生产发布清单中的依赖安装、语法检查、完整测试和 Logo 检查：本机 330 通过、2 跳过、0 失败；服务器 332/332 通过；92 个前端脚本检查通过；138 个 Logo 检查通过。
- [x] 计算并比对发布包和服务器 SHA-256，调用唯一生产发布脚本。发布包 SHA-256：`6677fb55c283bf965037718f2de6186bf73b1aee4dcf5fc115cc4fa15ffefd62`。
- [x] 核验服务、就绪 API、公网页面、页面脚本资源和五个真实模板值，记录发布 ID、备份路径及检查结果。
- [ ] 清理本机临时目录 `C:\Users\zhanglian2\AppData\Local\Temp\codex-nikai-image-prompt-templates-20260930-1`；本机执行策略拒绝递归删除。服务器端临时快照已清理，正式发布包已由发布脚本删除。
