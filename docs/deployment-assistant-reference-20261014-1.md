# 小助手参考图样式发布

- 发布 assistant-reference-20261014-1，2026-10-14 10:33:12 +08:00，成功。
- 基底 daily-ai-briefs-20261013-1；完整641文件，仅6个审阅文件变更。
- SHA256 8986cde99422f765161e0b6302cf746c9c8c20c458957391c606b8999d4a3d41，上传匹配。
- 已核验 admin@47.93.245.219 / iZ2ze0zvyl3al5cbqnk5fwZ；通过现有 /opt/nikai-ai/scripts/release-production.sh 发布。
- 代码备份 /opt/nikai-ai-backups/releases/previous-20261014-103154-assistant-reference-20261014-1
- DB备份 /opt/nikai-ai-backups/mariadb/nikai-ai-20261014-103303-2169516.sql.gz
- 无新增数据库迁移、无模型/额度/认证配置变更，首页原机器人图片保留。

## 实现

按用户参考图：浅紫白色大圆角宽卡片、圆头像标题、静态SVG操作图标、挥手机器人欢迎插画、三枚横向快捷提问、底部胶囊输入与紫色圆形发送。桌面宽960px/高至520px，手机宽度与可视高度自适应，推荐改竖排。发送后隐藏欢迎和插画以腾出聊天空间，重置恢复。停止按钮仍替换发送，保留拖动、位置记忆、4秒提示隐藏、Esc关闭与错误反馈。去掉全站焦点样式造成的输入栏内方框，键盘焦点仍在外层显示。

新增透明RGBA插画 assets/home/assistant-wave.png，由内置imagegen基于参考图风格生成。保留原图生成文件，项目资产副本711717字节。未加入附件上传入口。

## 验证

- 本地586测试：583通过、3环境跳过；服务器586全部通过。
- 全部JS语法检查与logos 138/138/138通过。
- 新回归覆盖快捷填入不发送、对话状态及重置、桌面宽卡片边界与手机短视口。
- 浏览器1588x990：欢迎卡片960x520，快捷填入、发送、回复工具卡、停止请求、重置恢复均正常；拖到左侧后卡片x168保持可见。
- 手机390x844：卡片366x620，文档宽390无横向溢出；390x360：卡片y8/h336，输入栏底部307.5px仍可见。
- 截图 docs/design-previews/20261014-assistant-desktop.png、20261014-assistant-mobile.png、20261014-assistant-conversation.png。浏览器聊天响应为本地验收数据，未调用付费模型。
- 线上首页引用 assistant.css/js?v=20261014-reference-1；HTTPS三资源HTTP200，CSS/JS/PNG SHA与候选全部匹配。
- 线上 assistant config enabled=true/ready=true；service active，health ready status=ok/database=true。
- 正式部署完成并核验后清理本次临时服务和发布包。本次没有执行关机操作。
