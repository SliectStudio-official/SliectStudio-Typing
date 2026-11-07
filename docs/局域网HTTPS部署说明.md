# 局域网 HTTPS 部署说明（全校规模）

> 面向：机房/校园网里要把本站升级到 https 的运维。**本文件不涉及改代码**，三种方案都不需要动 `server.js`。

## 一、先搞清楚为什么要上 https

| 收益 | 说明 |
| --- | --- |
| **密码不再明文** | 现在是 `http://`，登录密码与 token 在校内网上是明文，谁在同一交换机抓到包就能看到 |
| PWA / 离线可用 | `Service Worker` 只在**安全上下文**（https 或 localhost）启用；局域网 http 下完全不可用（见坑库 K-46） |
| 剪贴板标准 API 可用 | 房间码复制可走 `navigator.clipboard`，不必按 `execCommand` 兜底 |
| 部分安全软件少插手 | 有些安全软件对明文 HTTP 的 PUT/DELETE 会 reset（这是 3.5 那次事故的成因）；上 https 后可能顺带消失，**但不保证**（它也可能做 TLS 中间人） |

## 二、三种方案（按“全校规模要做的客户端操作量”排序）

| 方案 | 客户端要做什么 | 一次性工作量 | 适用 |
| --- | --- | --- | --- |
| **① 公网域名 + Let's Encrypt（DNS 挑战）+ 内网 DNS** | **什么都不用做**（证书被公网信任） | 申请域名/配 DNS API + 一条内网 A 记录 | **有自己域名、能改校内 DNS —— 最省事，推荐全校用** |
| **② Caddy 内网 CA + 组策略/批处理分发根证书** | 域内机器由 GPO 自动装；非域机器跑一次 `.bat` | 一条 GPO 或一个共享 `.bat` | 有 AD 域控，或机房有统一运维 |
| ③ 每台机器手动装根证书 | 每台点一次“是” | 机器数 × 1 分钟 | ≤20 台还能忍，全校不行 |

> **不要**选“改 server.js 自己起 https + 自签证书”：证书要自己续、每台还要装根证书，维护成本最高。

## 三、方案 ①：公网域名 + Let's Encrypt（客户端零操作）

思路：证书给**域名**签，域名在校内 DNS 解析到内网 IP。客户端看到的是“合法证书 + 合法域名”，不需要装任何东西。

```text
1. 准备一个域名，例如 typing.example.edu.cn（学校已有域名最好）
2. 校内 DNS（或路由器 dnsmasq / Windows DNS）加一条 A 记录：
     typing.example.edu.cn  →  192.168.108.111
3. 服务器上用 Caddy 做反代，证书走 DNS-01 挑战（不需要公网 80/443 可达）：

   Caddyfile:
     typing.example.edu.cn {
         tls {
             dns cloudflare <你的_API_TOKEN>   # 或其它 DNS 插件
         }
         reverse_proxy 127.0.0.1:3000
     }

4. caddy run（或 caddy start 注册成服务）
5. 全校访问 https://typing.example.edu.cn  → 浏览器直接显示安全，零客户端操作
```

| 注意 | 说明 |
| --- | --- |
| DNS-01 不需要开放 80/443 | 纯内网也能签、能自动续期 |
| 内网 A 记录必须有 | 否则域名解析到公网，访问不到你的服务器 |
| 证书自动续期 | Caddy 自带，无需 cron |
| 防火墙 | 只放行 **443** 即可；3000 只给本机用 |

## 四、方案 ②：Caddy 内网 CA + 批量分发根证书

```text
1. caddy.exe 放服务器目录
2. Caddyfile:
     https://192.168.108.111 {
         tls internal
         reverse_proxy 127.0.0.1:3000
     }
3. 服务器上（管理员）：caddy trust
4. 取根证书：%APPDATA%\Caddy\pki\authorities\local\root.crt
5. 分发（二选一）：
     · 域内：组策略 → 计算机配置 → 策略 → Windows 设置 → 安全设置 → 公钥策略
             → 受信任的根证书颁发机构 → 导入 root.crt（一次下发全部机器）
     · 非域：把下面的 bat 放共享盘，机房机器各跑一次（管理员）
         certutil -addstore -f Root \\服务器\共享\root.crt
```

## 五、验收（三条就够）

| # | 检查 | 判据 |
| --- | --- | --- |
| 1 | 证书被信任 | 浏览器打开 `https://<域名或IP>`，地址栏是锁头、**没有任何警告** |
| 2 | 站点功能正常 | `/api/version` 返回 JSON；练习/比赛/管理页各走一遍 |
| 3 | 安全上下文生效 | 控制台执行 `window.isSecureContext` → **true**；`navigator.serviceWorker` 不是 undefined |

## 六、回滚

| 场景 | 做法 |
| --- | --- |
| 证书/代理出问题 | 停掉 Caddy，直接访问 `http://<内网IP>:3000`（服务本身没变，随时可退） |
| 客户端装了不该装的根证书 | 组策略移除，或 `certmgr.msc` → 受信任的根证书颁发机构 → 删除对应条目 |

