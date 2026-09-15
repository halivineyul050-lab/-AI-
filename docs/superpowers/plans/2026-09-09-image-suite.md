# 图片处理套件

用户确认三类全部需要，继续在现有分支和当前工作区实现，保留既有改动。

## 已确认范围
1. `/utilities/image-edit`：浏览器本地裁剪、旋转、改尺寸、压缩、PNG/JPEG/WebP格式转换。尺寸与透明背景处理清楚显示，允许撤销/重置，导出前显示实际大小。
2. `/utilities/image-background`：服务器抠图返回透明PNG，浏览器预览透明底、白底及自选底色并下载。
3. `/utilities/image-enhance`：服务器神经网络3倍超分辨率，提供清晰度强度调整、前后对比、PNG下载。大图缩小到输入最长边512px后处理并明确标注；不承诺恢复真实缺失细节。

## 架构与接口
全部复用 `/styles.css`、`/utility-theme.css`、`/utility-theme.js` 与既有导航。
输入文件最大20MiB，图片编辑工作图最长4096px/最多16Mi像素，抠图最长2048px，增强最长512px。
GET `/api/utilities/image-tools/status` → `{data:{background:boolean,enhance:boolean}}`。
POST `/api/utilities/image-tools/background` 或 `/enhance` JSON `{image:PNGdataURL}` → PNG二进制；错误 `{code,title,status}`。
CPU推理在独立Python进程，使用已有venv安装ONNX Runtime；抠图使用U2NetP，增强使用ONNX Model Zoo SubPixel CNN 3x。两种新任务共用单槽，60秒超时；取消后等进程退出再释放槽、清理临时文件。

## 执行清单
- [x] 基础编辑：独立 frontend 子任务，编写image-edit.html/css/js及纯计算核心与尺寸/旋转裁切相关测试；浏览器交互验收。
- [x] AI页面：独立 frontend 子任务，编写image-background.html、image-enhance.html、image-ai.css/js；核对alpha背景合成、对比与失败状态。
- [x] 模型后台：scripts/image-tools.py + backend/image-tools.mjs，先测尺寸、alpha保留、预处理边界与拒绝请求，再接入真实模型；记录来源和校验和。
- [x] 集成：server.mjs静态资源/CSP/路由；utilities.html三个入口；Node全套+Python测试，浏览器实际上传、导出、下载。
- [x] 部署：独立模型与依赖、配置路径，备份代码/env/nginx后发布；源站HTTPS真实抠图/增强结果校验。公网既有备案拦截如未解决必须明确。

完成记录：85 项 Node 测试、8 项 Python 测试通过；浏览器验证三工具，375px 无横向溢出；发布 image-suite-20260909，源站 HTTPS 真实图片验证通过。公网仍受备案拦截。
