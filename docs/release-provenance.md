# 发布凭证与 MariaDB CI

本工具只做离线校验与记录。正式上传、切换和回滚仍必须遵循 [唯一正式发布流程](production-release.md)，CI 不部署。推送或检查通过不表示已上线。

## 发布包的来源记录

先提交并审阅本次代码，固定完整 Git commit。按正式流程核验当前生产版本并取得完整代码基底，以及逐文件 SHA-256 清单。基底 JSON 格式为 `{"files":[{"path":"server.mjs","sha256":"完整64位小写哈希"}]}`，必须包含完整应用所有文件；不是只列本次修改。

在项目外建立暂存目录，只覆盖明确审阅的文件。覆盖文件必须来自指定 commit 的 Git blob；可用 `git archive --format=tar --output=<overlay.tar> <完整commit> -- <文件列表>` 再用 tar 解包到暂存目录。不要用 PowerShell 文本重定向复制代码，以免改变换行或二进制内容。`overlays.json` 是本次覆盖路径的 JSON 数组，例如 `["backend/example.mjs","tests/example.test.mjs"]`。所有路径使用仓库相对路径和 `/`。

下列示例中的路径、ID、commit 和基底清单都必须替换为本次实际核验值；所有凭证和归档放在暂存目录外。输出文件必须不存在，工具拒绝覆盖旧凭证。

```powershell
node scripts/release-artifact.mjs inventory --stage D:/release/stage --baseline D:/release/baseline.json --baseline-release-id CURRENT-PRODUCTION-ID --release-id NEW-RELEASE-ID --source-commit FULL-40-CHAR-COMMIT --overlays D:/release/overlays.json --out D:/release/inventory.json
```

inventory 校验完整基底、额外/缺失文件、覆盖文件与已提交内容的一致性，拒绝常见敏感路径、链接及生产切换脚本覆盖。它不扫描任意文件内容中的所有凭据，也不替代人工审阅。当前不支持删除基底文件，删除需求须单独设计与审阅。

按正式流程在完整暂存树运行测试；安装产生的 `node_modules` 不得进入发布包。生成只含应用源码的完整 tgz 后，核验实际归档内容：

```powershell
node scripts/release-artifact.mjs seal --inventory D:/release/inventory.json --archive D:/release/application.tgz --out D:/release/receipt.json
```

seal 逐成员核对路径、大小、SHA-256，拒绝链接、额外目录、重复或缺失成员，记录完整归档哈希。压缩包和解压内容均限制为 256 MiB。receipt 单独随发布记录保存，不塞入已经封存的归档。封存后不得重新打包；上传后核对服务器哈希与 receipt 相同，再调用现有服务器发布脚本。

发布者核实服务状态、内外网 ready 和备份后，将实际结果整理为 JSON：`releaseId`、`status: "success"`、`remotePackageSha256`、`service: "active"`、`ready: {"database":true}`、`publicReady: {"database":true}`，以及服务器实际返回的 `databaseBackup`、`codeBackup`、`rollbackSnapshot` 三个 `/opt/nikai-ai-backups/` 下路径。

```powershell
node scripts/release-artifact.mjs record --receipt D:/release/receipt.json --result D:/release/verified-server-result.json --out D:/release/deployment-record.json
```

record 只检查已核验结果的格式和包标识一致性，不连接服务器，不替代真实页面/API 检查，也不构成服务器签名证明。把凭证与测试结果、Git commit、发布记录一起留存，禁止写入私钥、真实环境变量、管理员令牌或数据库内容。

## 真实 MariaDB 检查

GitHub Actions 的 `mariadb` job 使用临时 MariaDB 10.5.29 服务，绑定 `127.0.0.1:33307`，不读取 `.env` 或生产密钥。`scripts/verify-mariadb-ci.mjs` 要求显式 CI 标记、回环地址、高端口和专用 CI 凭据，拒绝继承 `NIKAI_DB_*` 配置。

入口随机创建 `nikai_verify_*` 数据库，执行现有迁移、持久化、去重、回滚、数据库锁竞争及热榜规模验证；外部付费调用使用固定测试替身。成功或失败都会尝试删除自建数据库并关闭连接；删除失败也会使检查失败。任务结束后临时服务容器销毁。固定的 CI 容器密码仅用于一次性测试服务。

成功结果作为 `mariadb-verification` artifact 保存 7 天，包含版本、验证项和计时，不含连接密码。失败以 job 日志为准，不能把纯单元测试当作真实 MariaDB 验证。

运行机制参考 [GitHub 服务容器说明](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers) 和 [MariaDB 官方镜像](https://hub.docker.com/_/mariadb)。
