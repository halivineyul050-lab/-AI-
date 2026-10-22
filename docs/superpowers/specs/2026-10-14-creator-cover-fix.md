# 个人主页封面加载修复

现象：两张微信公众号封面返回“未经允许不可引用”，用户修改后仍不显示。

根因：公开配置revision5仍引用mmbiz.qpic.cn；携带Referer=https://ontimo.cn/时，两张地址均返回相同的2090字节JPEG占位；不带Referer时分别返回10594和32672字节的正常WebP。浏览器加载由默认来源策略发送Referer导致。

修复：只在creator.js的图片构造函数中，于设置src之前设置referrerPolicy=no-referrer；更新该页JS缓存版本，不修改已保存配置、其他页面或全站来源策略。

验收：使用真实公开数据和候选脚本，微信图片请求不含Referer，两张原图正常解码，尺寸1080×463及1080×608。第三条视频image为空，保留原有类型占位；第一篇OpenClaw条目所填URL实际为Manus图片，不擅自替换用户选择。
