# 本机 Skills 整理与内容上传

2026-10-10：扫描本机 .codex/skills、.agents/skills 和插件缓存，内容哈希去重119份（本地43、系统5、插件缓存71）。缓存文件不代表已启用。完整清单见 local-skills-inventory-20261010.md。

首批公开上传：karpathy-guidelines、meeting-notes-and-actions、receiving-code-review、verification-before-completion、frontend-design（.agents独立版本）。完整单文件，无附属文件，无个人路径、私钥或实际密钥。其余有依赖的版本暂缓，未把插件缓存作为已安装技能发布。

通过已授权SSH调用线上现有createSkillStore.save内容保存逻辑，保留既有目录，并执行修订号检查；未修改线上代码、服务、模型配置或密钥。上传前完成数据库备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261010-163527-2010939.sql.gz。

目录从0条增加到5条，revision=1。公开API及Skills页面均验证5条，所有markdown与本地文件一致（保存逻辑裁去首尾空白）。会议纪要runnable=true，其余需本地编程工具runnable=false；executionReady=false，仍需管理员配置模型。
