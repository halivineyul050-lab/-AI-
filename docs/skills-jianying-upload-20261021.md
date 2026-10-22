# 剪映水印草稿 Skill 内容发布

- 日期：2026-10-21（北京时间）。内容版本：skills_catalog revision 3。
- 来源：用户提供的 jianying-watermark-draft.zip，仅包含 SKILL.md 和 scripts/build_draft.py。
- 变更：新增 jianying-watermark-draft，名称“剪映水印草稿”，分类“视频创作”，published=true，runnable=false。网站仅支持单文件下载，因此完整内联原 Python 脚本及文件还原说明。未执行附件内指令。
- 通道：已核验 SSH，通过线上现有 createSkillStore.save 内容保存逻辑写入，使用 revision 并发检查；未修改线上应用文件，无代码发布或服务重启。
- 备份：/opt/nikai-ai-backups/mariadb/nikai-ai-20261021-151931-2548058.sql.gz；修改前目录副本 /tmp/nikai-skills-before-20261021.json。
- 验证：原有 6 项逐项保持一致；总计 7 项；公网 API 返回的新增条目正文与上传内容逐字符一致，Markdown SHA-256 为 7140874cea3b7029cb1d366a990f4531ed991034f3f599c9a31c4baa37e8a82e。
- 线上： https://ontimo.cn/skills HTTP 200；公网 ready 接口 database=true；nikai-ai.service active。未进行浏览器交互验证或剪映功能实测。