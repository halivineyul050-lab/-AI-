# 原生微信小程序发布衔接

本站保存 AppID、版本说明和用户手工检查项；编译、扫码预览、上传、审核与正式发布由官方微信侧完成。无需向本站提供 AppSecret、登录凭据、管理员令牌。检查项勾选与“可交接”仅表示用户确认，不能证明微信已编译或审核通过。

## 准备

1. 在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序，取得 AppID，并配置本次上传者的开发者权限。
2. 安装 [官方微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，由本人扫码登录，在设置 → 安全设置中手工开启服务端口。
3. 从作品页导出指定的原生小程序版本，解压后导入含 `project.config.json` 的目录。在工具里确认真实 AppID，编译源码并修复错误。
4. 按项目实际用途配置合法域名、隐私声明和权限，完成主要流程真机测试。

## Windows 本地命令

以下命令在仓库根目录执行；导出包中脚本位于根目录时去掉 `scripts/` 前缀。需要已安装 Node.js。默认工具路径为 `D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat`，不同电脑通过 `--cli "C:/实际安装目录/cli.bat"` 指定本人安装的官方工具。

```powershell
node scripts/nestdutio-wechat-devtools.mjs doctor
node scripts/nestdutio-wechat-devtools.mjs islogin
node scripts/nestdutio-wechat-devtools.mjs preview --project "D:/我的小程序" --qr-output "D:/我的小程序-preview.png"
node scripts/nestdutio-wechat-devtools.mjs upload --project "D:/我的小程序" --version "1.0.0" --description "首次体验"
```

`doctor` 仅检查本地官方工具文件存在，不打开窗口、不登录、不联网；`islogin` 调用官方 CLI 查询登录情况。预览和上传要求有效 AppID 与原生 `compileType` 配置，本站保存 AppID 时统一转为小写。二维码必须输出到尚不存在的本地 `.png` 路径，输出目录须预先存在；失败、超时或没有有效 PNG 文件均返回非零退出码。PNG 检查覆盖完整分块、CRC、IHDR/IDAT/IEND、尺寸、解压上限和扫描行过滤器；文件最大 8 MiB，像素流最大 32 MiB，不支持隔行 PNG。该检查证明官方 CLI 输出了有效图像，并不验证二维码内容或扫码成功，仍需本人在微信中扫描确认。

上传必须显式执行 `upload` 并同时提供版本号和说明。脚本直接用官方工具目录内的 `node.exe` 运行 `cli.js`，以独立参数调用，禁用 shell；不会执行生成作品里的 JS 或安装依赖。只应把 `--cli` 指向本人可信的官方工具安装目录。

## 审核与发布

上传成功后，进入微信公众平台版本管理，按平台要求补全类目、隐私和审核材料，由账号负责人提交审核，并在审核通过后确认发布。本地脚本不提供提交审核或正式发布命令。

## 当前验证边界

2026-10-21 已通过官方 [CLI V2 文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html) 核对 `islogin`、`preview --project --qr-format image --qr-output`、`upload --project --version --desc` 参数。自动测试覆盖设置与所有权、输入白名单、外部状态边界、独立进程参数和失败处理；未代用户扫码登录、编译、真机测试、上传、审核或发布。真实项目仍需在已登录并开启服务端口的官方工具内验证。
