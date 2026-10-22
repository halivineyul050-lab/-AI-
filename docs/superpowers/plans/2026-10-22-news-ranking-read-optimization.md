# 热榜读取优化执行计划

设计已获用户批准，按writing-plans与TDD执行。

- [ ] tests/news-hot-ranking.test.mjs添加超过1000候选和大正文读取边界验证，先运行红灯。
- [ ] backend/database.mjs最小优化，保持全量候选和所有关联来源，运行相关测试。
- [ ] 真实MariaDB相同规模复测，记录样本及平台限制；完整测试、独立复审。
- [ ] catalog备份逐文件核验，将212项处置凭证写入正式文档；保留历史分支与备份。
- [ ] 核验当前生产基底、按production-release.md制作最小覆盖完整发布包，在干净目录验证后经规定脚本发布并核验公网。
