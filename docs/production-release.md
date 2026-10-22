# 线上发布流程（唯一现行流程）

> **优先级最高：任何 AI 或维护者发布到 ontimo.cn，都必须按本文件执行。** 正式发布使用本机已授权 SSH 和服务器现有发布脚本；GitHub Actions 仅运行 CI，不部署生产。Git 推送、CI 通过都不等于已上线。

## 固定发布通道

- 服务器：`47.93.245.219`，SSH 用户：`admin`。
- 身份验证：复用当前 Windows 用户配置的 `~/.ssh/ontimo_production_ed25519`，并设置 `StrictHostKeyChecking=yes`。不要在项目内保存 SSH 私钥、口令、Bearer Token 或 API Key。
- 唯一切换入口：`sudo -n /opt/nikai-ai/scripts/release-production.sh <发布包> <发布 ID>`。
- 发布 ID 只用 1–64 位英文字母、数字、点、下划线或连字符，例如 `image-preview-20260929-1`。

## 标准步骤

### 1. 先确认线上目标和工作区范围

阅读本文件和本次变更；确认页面/API 的线上目标、需要带上的代码/测试/迁移文件，以及工作区中的未提交改动。使用已授权 SSH 只读核对主机指纹、`/opt/nikai-ai`、当前页面文件、发布脚本和健康状态。

工作区若有本次任务以外的改动，不得把工作区整体打包。以服务器当前完整应用为基底下载源代码快照；快照必须排除线上 `.env`、`.mariadb.cnf`、`data/`、`imports/`、`node_modules/` 和 `.git/`。只将本次经过检查的文件、相关测试以及必需配置/迁移覆盖到临时发布目录。**保留 `.env.example`**；排除真实的 `.env`，不要用会连 `.env.example` 一起排除的宽泛规则。

如果本次改变依赖、数据库迁移、服务入口或静态白名单，要把对应锁文件、迁移、测试和运行时代码一并纳入，不能只拷贝页面文件。临时目录和发布包放在项目目录之外，发布结束后清除本次创建的临时文件。

### 2. 在完整临时目录中验证

在临时发布目录运行与服务器一致的 Node 版本：

```powershell
npm ci
node --check server.mjs
Get-ChildItem public -Recurse -File -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }
npm test
npm run logos:verify
```

任何失败都停止发布，先修复或说明原因。服务器发布脚本会在另一个干净暂存目录重复安装锁定依赖、检查 JavaScript 并运行完整测试；不得通过删除测试、跳过失败项或修改线上代码绕过预检。

### 3. 制作并核验完整发布包

使用 [发布凭证工具](release-provenance.md) 固定生产基底、完整 Git commit 与覆盖白名单，生成 inventory；完整包制作后使用 seal 校验实际归档并保存 receipt。上传后重算的包哈希必须与 receipt 相同。真实上线核验后用 record 保存备份路径与健康结果。工具不执行上传或切换，以下 SSH 通道保持唯一。

发布包必须是可独立运行的完整应用树，至少包含 `package.json`、`package-lock.json`、`server.mjs`、`public/`、`backend/`、`scripts/`、`tests/` 和 `scripts/active-database-backup.mjs`、`scripts/apply-production-migrations.mjs`。排除 `.git/`、`node_modules/`、`data/`、`imports/`、`.env` 和 `.mariadb.cnf`；确认 `.env.example` 仍在包中，确认包内没有密钥、数据库、备份或用户数据。

计算发布包 SHA-256；上传后在服务器重算，两个值必须一致。发布包不匹配、缺少测试/迁移文件或包含敏感文件时停止。

### 4. 上传并运行现有发布脚本

PowerShell 示例（`$Archive` 指向刚才核验的完整发布包）：

```powershell
$SshKey = Join-Path $env:USERPROFILE '.ssh\ontimo_production_ed25519'
$Target = 'admin@47.93.245.219'
$ReleaseId = 'feature-20260929-1'
$RemoteArchive = "/tmp/nikai-release-$ReleaseId.tgz"

scp -i $SshKey -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes $Archive "${Target}:$RemoteArchive"
ssh -i $SshKey -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes $Target "sha256sum $RemoteArchive"
```

比对上传前后的摘要相同后，再执行：

```powershell
ssh -i $SshKey -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes $Target `
  "sudo -n /opt/nikai-ai/scripts/release-production.sh $RemoteArchive $ReleaseId"
```

不要在服务器直接改 `/opt/nikai-ai` 中的页面或代码；不要调用其他发布脚本，不要把新脚本上传后用 `sudo bash /tmp/...` 执行。现有发布脚本会串行锁定发布、测试完整归档、备份活动数据库与旧代码、应用兼容迁移、保留服务器配置和用户数据、切换目录、重启服务并检查就绪接口。预检失败会在切换前中止；切换或健康检查失败会尝试自动恢复旧版本。

### 5. 验证线上并留下记录

必须同时验证服务器和真实公网结果：

```powershell
ssh -i $SshKey -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes $Target `
  "sudo -n systemctl is-active nikai-ai.service; curl -fsS http://127.0.0.1:4174/api/v1/health/ready; sudo -n tail -n 1 /opt/nikai-ai-backups/releases/release-history.log"
curl.exe -fsS https://ontimo.cn/api/v1/health/ready
```

确认服务为 `active`、就绪接口 HTTP 200 且 `database=true`、release history 中本次发布为 `success`。再访问本次页面/API，检查引用的缓存版本、静态资源 HTTP 状态、实际交互及浏览器控制台。只有公网结果也符合预期，才能报告“已上线”。

每次成功发布都在 `docs/` 新增一条简短记录，包含发布 ID/时间、变更范围、回滚快照路径、测试结果、服务与线上验证结果。真实历史记录是审计证据，保留它们；它们不是其他发布流程。

## 回滚

发布脚本会在 `/opt/nikai-ai-backups/releases/` 保存完整的 `previous-*` 版本并写入 `release-history.log`。发现生产异常时先确认失败版本和对应快照，再使用服务器 `/opt/nikai-ai/scripts/rollback-production.sh` 恢复，并重新检查服务及健康接口。代码回滚不会撤销已执行的 MariaDB 迁移，也不会恢复用户内容；数据库恢复是单独的灾难恢复操作，不得将本地种子数据覆盖线上。

## 旧说明的处理

- `.github/workflows/deploy.yml` 已退役并删除，避免与已验证的 SSH 发布通道冲突。
- `.github/workflows/ci.yml` 继续用于自动测试，不进行生产发布。
- `docs/上线前检查清单.md` 仅保留为旧链接入口，详细要求以本文件为准。
- `docs/deployment-*.md` 是逐次发布的历史记录，保留作审计与回溯，不得将旧命令当作现行操作步骤。
