# 个人收款码充值与人工审核

用户已批准：默认审核直接到账，可选择审核发单次兑换码；收款码后台上传，未配置不开放付款；用户提交凭证，管理员核对实际收款后审核。

技术：现有Node HTTP、SQLite/MariaDB、原生HTML/CSS/JS；生产基底clean-routes-20261013-1，新增028迁移。图片以有尺寸/签名/大小校验的字节保存数据库，不接收外链。订单保存套餐金额/积分和收款码快照，不能用客户端金额。兑换码摘要供核销，原码加密仅返回订单本人；拒绝、完成不可再次审核。

- [x] 后端订单/图片/渠道配置服务及双数据库迁移；事务内一次审核、一次账务变化或发码，验证并发、越权、余额溢出、价格快照。
- [x] 服务端用户/管理员API、登录与频控、私密凭证读取、静态资源和充值中心路由；真实权限与失败测试。
- [x] 前台充值中心套餐/渠道/到账方式/二维码/凭证上传/我的订单，账户入口；后台收款码配置、审核列表与详情，默认仅待审，清晰审核提示。
- [x] 独立审阅，真实浏览器桌面/手机交互与完整回归，Maria隔离库实测。
- [x] 完整包按现有发布脚本上线，记录备份、版本与公网结果，同步本次代码并清理临时文件。

API约定：GET /api/v1/recharge/config；GET/POST /api/v1/account/recharges；GET /api/v1/account/recharges/:id；POST /api/v1/account/recharges/:id/proof（JSON {image:{mimeType,base64},note}）；GET /api/v1/recharge/assets/:id。管理员 GET/PUT /api/admin/v1/recharge/config、POST /api/admin/v1/recharge/channels/:channel/qr（JSON {image}）、GET /api/admin/v1/recharges?status=pending|approved|rejected、POST /api/admin/v1/recharges/:id/review（{decision:'approve'|'reject',reason}）。

DTO：config {channels:[{id:'alipay'|'wechat',enabled,ready,receiverName,qrAssetId}],reviewHours:24,notice,packages:现有套餐}；order {id,userId,userName,packageName,priceCents,credits,channel,delivery:'direct'|'code',status:'created'|'pending'|'approved'|'rejected',qrAssetId,receiverName,proofAssetId,note,reason,createdAt,submittedAt,reviewedAt,code（仅本人已批准code订单）}。POST订单{packageId,channel,delivery}。

补充：created支持取消未付款订单（POST /api/v1/account/recharges/:id/cancel），cancelled状态释放待处理数量，pending禁止取消。后台凭证Blob仅开放img-src blob，脚本/媒体策略仍禁止blob。
