# NeStudio 自定义域名验收

- 域名：demo.ontimo.cn；作品97b79faf-3a04-4cd1-9b99-af0595666b32。
- 2026-10-16 A/TXT通过。阿里DNS最初反复返回NXDOMAIN，服务器解析配置已备份到/var/tmp/nikai-resolv-before-custom-domain-20261016.conf，并切换223.5.5.5/1.1.1.1。该文件由NetworkManager生成，后续网络配置重新生成时需复核。
- HTTP-01从公网返回阿里云备案拦截403，改用用户手动添加_acme-challenge.demo TXT的DNS-01签发。
- 证书/etc/letsencrypt/live/nkcustom-7ab6adc662860283fc460d6b，2027-01-14 06:11:19 UTC到期。此证书采用手动DNS验证，尚无自动续期，需到期前重新DNS验证；当前HTTP-01仍受入口拦截，不能承诺该域名自动续期。
- nginx配置备份/var/tmp/nikai-demo-before-tls-20261016.conf；nginx -t通过，已加载HTTPS。
- 真实complete接口验收后state=active；公网本机Node fetch GET200，版本头4d651a2e-c563-4500-a483-a56885faa586。Windows curl Schannel同一时段对主站和演示均连接重置，Node客户端正常，不能用该curl结果判断站点宕机。
- 公网域名实际表单POST201，重复相同请求返回同一记录duplicate=true，错误Origin403。测试记录ID c9de6cf0-5c5e-4bae-a726-3c53dc4cb406，仅含验收假数据。
- 为避免阻塞式证书签发后复用失效的HTTP keepalive连接，worker内部API请求使用Connection: close；跟随积分发布包保留源码，并更新root-owned基础设施副本。
