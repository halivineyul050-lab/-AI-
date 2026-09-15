# 图片消除实现计划

> 使用 subagent-driven-development 分配独立页面工作，本任务继续执行到测试与部署完成。

**目标：** 在网站内提供真正使用 LaMa 修复背景的图片消除工具。
**架构：** 原生 Canvas 编辑器 → Node 同源受限接口 → 短生命周期 Python CPU 推理进程。图片不发送第三方。
**技术：** Node 22、Canvas、Python 3.11、PyTorch CPU、Pillow、NumPy、LaMa TorchScript。

## 约束
- 原图 20MiB，工作图最长边 2048px；JSON 请求不超过 28MiB；CPU 推理最长边 512px。
- 一次一个推理任务，120秒超时，取消杀进程并等退出再释放槽位；临时文件清理。
- 不调整现有数据库，不覆盖既有工具修改，不将源站验收描述为公网域名验收。

## 任务
- [x] 模型试跑：下载来源明确的 TorchScript 模型至临时验证目录；记录校验和；使用本机已有 PyTorch 生成结果，测服务器 CPU/内存。部署依赖独立放置 `/opt/nikai-image-erase`。
- [x] 编辑器：创建 `image-erase.html/css/js`，实现加载图片、Canvas 选区历史、鼠标/触摸画笔与矩形、缩放显示、还原、比较、PNG 下载；调用设计中的接口，错误可见，取消可重试。
- [x] Python 推理：创建 `scripts/image-erase.py`，定义 `repair(image,mask,model)`，通过 `tests/image_erase_test.py` 验证原尺寸合成、透明度、空选区、选区外像素不变，然后接入 TorchScript。
- [x] Node 服务：创建 `backend/image-erase.mjs`，导出 `createImageEraser(options)` 返回 enabled/run；在 `tests/image-erase.test.mjs` 先验证 PNG 格式、大小、输入维度、并发和取消；接入 server.mjs 静态资源、CSP、路由、限流及 utilities.html 入口。
- [x] 验收：运行 `npm test`、Python 单元测试、真实模型图片修复；浏览器上传绘制、消除、比较和下载；检查选区外像素一致、消除区域确实变化。
- [x] 部署：备份受影响文件及环境配置；上传本次代码、独立 CPU 运行环境与模型，启动后真实调用源站接口，记录响应耗时和服务状态；失败回退本次改动。
