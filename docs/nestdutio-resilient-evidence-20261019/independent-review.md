独立审查初次发现P2：失败历史查询完整语法检查启动大量同步子进程，10次检查实测27503ms；逐inline标签重复进程进一步放大。
修复：canResume只比较指纹/版本/过期状态，history每条仅一次jobs.get；HTML批处理单文件至多1个5秒语法进程，独立module作用域、不link/evaluate/import。复查17/17定向通过，无新增P1/P2。
根集成真实DB+Chrome+checker：HTML只生成1次，app.js两次length失败退款，继续新执行仅补app.js，第3次完整输出通过真实点按；旧failed新ready，固定扣费仅成功一次，390px无溢出。
迁移断言与视频取帧同步适配复审通过：保留原有验收断言，无弱化或绕过。
