# NeStdutio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; do not dispatch agents without explicit authorization.

**Goal:** 分阶段交付自然语言生成、可运行预览、发布、数据保存和独立源码交付；先完成安全、可测试的生成工作台闭环。

**Architecture:** 沿用现有 Node HTTP、身份认证、MariaDB/SQLite 和加密模型配置。项目、不可变版本、异步任务与作品发布分离；模型输出浏览器文件与声明式能力，平台不执行模型服务端代码。

**Tech Stack:** Node 22+、原生 HTML/CSS/JavaScript、现有数据库兼容层、现有 Playwright Core；源码 ZIP 使用经过审阅并锁定版本的归档库。

## Global Constraints

- 产品名称 NeStdutio，工作台 `/nestdutio`，主站「创作与效率」二级导航。
- 生成内容不得与主站同源执行，不得携带主站凭据。
- 首版三阶段全部交付前，不能将静态工作台称为完整产品。
- 生产发布严格使用 `docs/production-release.md`；工作区脏，必须从当前生产完整快照建立独立暂存目录。
- 不修改现有用户数据，不重置现有模型配置，不提交或打印密钥。
- 先实测主机容量、Cookie 域、DNS 和证书，再启用托管地址；检查不通过不得发布作品。
- 默认草稿每版本最多 30 个文件、单文件 256 KiB、总量 2 MiB；拒绝目录穿越、绝对路径、重复规范路径、服务端可执行文件及秘密文件。
- 默认每用户 1 个活动生成任务、全局 2 个，单任务总时限 180 秒，最多 2 次修复；后台允许在实测容量内调整。

## 阶段划分

本文件详细规划阶段一。阶段二、三是各自可验收的子项目，须分别基于届时实测基础设施写计划，不虚构当前未核验的域名配置。

1. 阶段一：项目、版本、生成、隔离预览、检查修复、静态源码下载。
2. 阶段二：独立托管、平台域名、发布更新、回滚与下线；验收外网可访问及旧版保护。
3. 阶段三：公开表单写入、作者数据管理、独立后端导出、自定义域名；验收跨设备持久化和跨租户隔离。

## 阶段一接口与文件边界

新增 `backend/nestdutio/{artifact,projects,config,jobs,generator,checker,preview,export,routes}.mjs`，分别管理产物校验、项目版本、模型配置、任务、上游调用、检查、隔离预览、归档及 HTTP 分派。新增 `public/nestdutio.{html,css,js}` 和 `public/admin-nestdutio.js`。不将所有逻辑塞入 `server.mjs`。

产物 `Artifact={schemaVersion:1,name,entry,files:[{path,content}],capabilities:[],acceptance:[{kind,target,value?}]}`；阶段一只接受静态与本地存储能力，真实云数据需求必须返回能力缺口，不生成成功假象。

HTTP：`GET/POST /api/v1/nestdutio/projects`；`GET /projects/:id`；`POST /projects/:id/tasks`；`GET /tasks/:id`；`GET /projects/:id/versions`；`POST /projects/:id/restore`；`GET /projects/:id/versions/:version/export`。以上路径省略共同前缀 `/api/v1/nestdutio`。均登录与校验项目归属。

任务状态 `queued → planning → generating → checking → repairing → ready|failed`。持久化输入、版本基底、状态、安全错误、预留凭据与幂等键。成功版本与结算同事务；失败与退回同事务。

### Task 1: 产物协议和拒绝边界

**Files:** `backend/nestdutio/artifact.mjs`、`tests/nestdutio-artifact.test.mjs`。

**Interface:** `validateArtifact(input) -> Artifact`，返回净化、限量的确定性数据；错误含固定 code 与字段路径，不包含源码正文。

- [ ] 写失败测试并运行 `node --test tests/nestdutio-artifact.test.mjs`。

```js
assert.throws(()=>validateArtifact({...valid,files:[{path:'../server.mjs',content:'x'}]}));
assert.throws(()=>validateArtifact({...valid,files:[{path:'/etc/passwd',content:'x'}]}));
assert.throws(()=>validateArtifact({...valid,entry:'missing.html'}));
assert.equal(validateArtifact(valid).entry,'index.html');
```

- [ ] 实现路径规范化、入口存在、文件数量/字节边界、后端/密钥文件拒绝、声明能力白名单；HTML/JS 不靠字符串过滤证明安全，执行安全由 Task 4 隔离保证。
- [ ] 加入 Windows 路径、编码分隔符、同名规范路径和超限用例，运行测试为绿。
- [ ] 只提交本任务文件。

### Task 2: 项目与不可变版本

**Files:** `backend/nestdutio/projects.mjs`、两类数据库迁移 `033_nestdutio.sql`、`tests/nestdutio-projects.test.mjs`。执行前确认 033 未被其他改动占用。

**Interfaces:** `createProjects(db)` 返回 `create(user,input)`、`list(user)`、`get(user,id)`、`saveVersion(user,id,artifact,baseVersion)`、`versions(user,id)`、`restore(user,id,version)`。所有方法在服务端检查归属；saveVersion 用基底版本防止覆盖并发修改。

- [ ] 写失败测试：用户 B 读取或修改用户 A 项目返回 404；版本内容不可改写；恢复创建新草稿，旧版本仍存在；错误基底返回 409。
- [ ] 建项目、版本、任务、配置、结算记录表；版本内容在数据库事务内保存，当前线上版本字段只由后续发布服务更新。
- [ ] 在 SQLite 测试基础上，执行既有 MariaDB 兼容测试与迁移映射检查。
- [ ] 运行 `node --test tests/nestdutio-projects.test.mjs tests/mariadb-compat.test.mjs`；如实际兼容测试文件名不同，先用 `rg --files tests -g '*mariadb*'` 定位，执行存在的对应文件。
- [ ] 只提交本任务文件。

### Task 3: 模型配置、任务与结算

**Files:** `backend/nestdutio/config.mjs`、`jobs.mjs`、`generator.mjs`；`tests/nestdutio-generation.test.mjs`、`tests/nestdutio-jobs.test.mjs`。

**Interfaces:** `createGenerator(config,checker,options).run(input,callbacks)`；`createJobs(db,projects,generator,billing).submit(user,projectId,input,key)`、`.get(user,id)`、`.shutdown()`。billing 使用现有积分服务的真实预留/结算接口，先查明签名，不新造旁路积分余额。

- [ ] 测试合法产物生成、修改携带当前版本、上游拒绝、JSON 非法、检查错误修复、重启恢复、并发上限。

```js
const a=jobs.submit(owner,project.id,input,'same-request-key');
const b=jobs.submit(owner,project.id,input,'same-request-key');
assert.equal(a.id,b.id);
assert.equal(await billing.reservationsFor(a.id),1);
```

- [ ] 配置复用现有加密盒与安全上游访问，固定上游协议；模型不持有 SSH 或部署权限。
- [ ] 持久化任务与幂等预留；JSON/协议/浏览器检查错误反馈最多两次；重启不盲目重放上游请求。
- [ ] 日志只保留任务号、阶段、状态和安全错误字段；成功、失败、重试和重复回调均不重复扣费。
- [ ] 运行本任务两个测试文件，再执行现有 credits、assistant 和 explainer 测试，确保配置与计费未回归。
- [ ] 只提交本任务文件。

### Task 4: 隔离预览与真实浏览器检查

**Files:** `backend/nestdutio/preview.mjs`、`checker.mjs`、`tests/nestdutio-preview.test.mjs`、`tests/nestdutio-checker.test.mjs`。

**Interfaces:** `createPreviewStore().put(artifact,{owner,expiresAt}) -> {id,url}`、`.revoke(id)`；`checkArtifact(artifact,{deadline}) -> {ok,issues,checks}`。

- [ ] 红测覆盖读取父页面存储、父窗口导航、内网请求、跨项目获取源码、超时脚本和超量网络请求。
- [ ] 开发预览使用独立本地源，线上使用实测后的无凭据预览源；iframe 仅授予必需权限，不授予 allow-same-origin。
- [ ] 检查浏览器上下文不带主站 Cookie，网络仅允许当前产物与固定能力接口，拒绝内网/元数据访问、未知外部脚本和弹窗下载。
- [ ] 检查入口、资源、控制台异常、桌面/手机视口及预先定义的核心操作；产物内验收描述只取固定类型，不作为任意测试脚本执行。
- [ ] 运行两个测试文件；将无效作品交给 Task 3 验证自动修复和最终失败退次。
- [ ] 只提交本任务文件。

### Task 5: 静态源码交付

**Files:** `backend/nestdutio/export.mjs`、`tests/nestdutio-export.test.mjs`，必要时审阅 `package.json` 与锁文件以加入 ZIP 库。

**Interface:** `createExport(artifact,{versionId}) -> {stream,filename,sha256}`；归档来自指定不可变版本，不重新向模型请求。

- [ ] 测试 ZIP 内文件与产物逐字一致、中文名称安全、无秘密文件、无绝对路径与目录逃逸。
- [ ] 静态资源完整随包，附 README 与运行命令；归档库必须锁定版本，不能调用模型生成的压缩命令。
- [ ] 将包解压至空目录，以固定静态服务启动，用浏览器重跑同一核心操作；不允许借用预览服务器资源。
- [ ] `node --test tests/nestdutio-export.test.mjs` 通过后只提交本任务文件。

### Task 6: 工作台、后台与导航

**Files:** `public/nestdutio.html`、`.css`、`.js`、`public/admin-nestdutio.js`、`public/admin.html`、`public/admin.js`、`scripts/frontend/site-navigation.json`、`backend/nestdutio/routes.mjs`、`server.mjs`、`tests/nestdutio-api.test.mjs`、`tests/nestdutio-ui.test.mjs`。

**Interface:** routes 导出 `handleNestdutio({request,response,user,pathname,services}) -> handled`；接入现有鉴权、同源防护、速率限制和静态白名单。不得直接复制工作区 server.mjs 到生产基底。

- [ ] 红测：未登录禁止创建/修改/下载，跨用户资源 404；公开配置不含密钥；XSS 文本使用 textContent；恢复任务先核验当前登录者。
- [ ] 实现需求入口、作品列表、双栏工作台、手机单栏切换、版本恢复和源码下载。所有“生成中/检查中”来自任务实际状态，不用计时器伪造成功。
- [ ] 发布入口在阶段二未完成前明确显示未启用，不提供看似成功的假地址。
- [ ] 管理配置沿用 `.provider-settings-panel` 共享布局，覆盖独立模型配置与资源限制，避免重复出现原理讲解后台裸样式问题。
- [ ] 使用导航生成脚本更新「创作与效率」入口，并审阅生成差异只包含预期修改。
- [ ] 浏览器验证桌面 1440×1000、手机 390×844：输入、生成、修改、刷新恢复、旧版查看、错误重试和下载；无水平溢出或页面异常。
- [ ] 运行 API/UI 测试和已有 shared-navigation、admin-provider-layout 测试，然后只提交本任务文件。

### Task 7: 阶段一整体验收与后续计划

- [ ] 用真实模型分别创建计算器、手机清单和多页面展示站；核心行为全部实测，不能仅检查 HTTP 200 或模型文字。
- [ ] 真实表单云数据需求在此阶段必须清楚显示能力缺口，不能用 alert 或 console.log 假装提交成功。
- [ ] 对三个作品下载包做干净环境运行验证，记下输入、版本、检查结果和真实限制；敏感文本不进日志。
- [ ] 执行 `npm ci`、`node --check server.mjs`、前端语法检查、`npm test`、`npm run logos:verify`。通过后记录验证文档。
- [ ] 基于只读实测写阶段二部署计划：Cookie 边界、独立托管根、反向代理、DNS、证书、候选版本原子切换和公网核验。
- [ ] 阶段二验收后写阶段三数据与独立运行时计划，覆盖公开写入/作者读取、SQLite 导出、初始化认证、自定义域名所有权及解除绑定。

## 自检与执行方式

范围映射：规格 1–6 对应 Task 1/3/4/6；7 对应 Task 2 和阶段三；8 对应 Task 4 和阶段二；9 对应阶段二；10 对应 Task 5 与阶段三；11 对应 Task 3/6；12–13 对应 Task 7 的真实验收和基础设施核验。

当前无应用运行代码改动，设计原型与正式产品区分。下一步在本会话按 executing-plans 顺序执行阶段一，不重复请求已确认的产品方向。
