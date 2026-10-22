# 发布凭证与MariaDB CI实施计划

按writing-plans和TDD执行，已批准范围见同日design。

- [ ] scripts/release-artifact.mjs：目录白名单、Git提交对应、包成员与内容校验、发布成功记录；tests/release-artifact.test.mjs先红后绿。
- [ ] scripts/verify-mariadb-ci.mjs：CI隔离、随机数据库、复用真实验证、finally清理；tests/mariadb-ci.test.mjs先红后绿。
- [ ] .github/workflows/ci.yml新增MariaDB10.5.29 service任务和只读结果artifact，不增加部署权限或真实密钥。
- [ ] 文档同步唯一发布流程，定向与完整测试、独立复审；提交推送并读取实际CI结果。不发布业务页面或改生产脚本。
