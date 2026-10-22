# 发布凭证与数据库 CI 优化记录

日期：2026-10-22。分支：`codex/release-provenance-mariadb-ci`。本轮只改善发布校验、CI 和测试可靠性，没有上线业务代码；正式发布仍以 [最终收尾记录](final-closeout-2026-10-22.md) 中的 `news-persistence-20261022-1` 为准。

## 已实现

- 离线 `inventory` 固定生产基底、完整 Git commit 和覆盖白名单；拒绝脏文件混入、未批准改动与常见敏感路径。
- `seal` 校验实际 tgz 成员、各自大小与 SHA-256，再绑定整个归档哈希。独立审查发现的跨成员边界位移绕过已修复，并新增专门回归测试。
- `record` 检查发布结果与归档匹配，记录已核验的代码/数据库备份、回滚目录和健康状态。它不连接服务器，不代替人工核实或服务器发布脚本。
- Actions 新增真实 MariaDB 10.5.29 服务；自建随机测试库、运行现有七组真实验证、清理并上传结果。无生产配置或部署权限。
- 修复既有 Python job 的缓存配置：显式使用锁定版本的 `requirements-ci.txt`。
- 为临时 CI runner 的 `/tmp/chromium` 配置 AppArmor userns 许可，统一 checker 使用项目 Chromium，保留沙箱；Node job 设置 15 分钟上限。
- 项目历史浏览器测试等待实际目标 URL，避免工作区原本可见时过早断言旧地址。

具体用法见 [发布凭证与 MariaDB CI](release-provenance.md)。原 SSH 上传和生产切换方式未改变。

## 验证证据

- 本机首轮完整 Node 回归：943 项，940 通过，3 项平台跳过，0 失败。归档边界修复后相关测试 12/12；CI 浏览器问题修复后相关浏览器测试 8/8。
- 独立代码审查已复核归档修复及 CI 配置，未发现剩余阻断问题。
- 已核验代码提交：`7274c34c7e13c787aa4be7faf2baa5cfb1359c9f`。[实际 CI](https://github.com/halivineyul050-lab/-AI-/actions/runs/39749049093) 三项 job 全部成功：Node 共 944 项、942 通过、2 项平台跳过、0 失败；Python 8 项通过；真实 MariaDB 七组检查通过，`fixtureDropped=true`，结果 artifact 已上传。
- MariaDB 返回版本 `10.5.29-MariaDB-ubu2004`；1,001/10,001 条事件排名验证中位耗时分别为 33.96/296.85 ms，仅代表该 CI fixture，不作为生产响应时间承诺。
- 本机详细日志保留于 `output/release-ci-optimization-20261022/`，不纳入版本库。

## 范围与保留项

原来用户决定保留的三个临时目录未触碰。执行期间出现的 `public/creator.css`、`public/creator.html`、`public/creator.js` 与 `tests/creator-profile.test.mjs` 属于并行工作区改动，未纳入本轮提交；不能把整个工作区当作本轮发布包。
