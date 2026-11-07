# P6-服务端杂项与 SW 收尾

> 读的提示词就是本文件。开工时把本文件 sha256 算出来，写进执行报告第一行。
> 你是本项目的执行方 AI。开工前读 `AGENTS.md` 的 §0、§4、§5、§7，再读 `docs/CURRENT.md` 五块。
> 本批四项：先把 P5 没验收通过的那条（K-19）真正收尾，再清三条服务端杂项。**全部落在 `server.js` 与 `public/service-worker.js`，不改其它前端文件。**

## 0. 上一轮不确定项的处理决定

| 不确定项 | 决定 | 理由 |
| --- | --- | --- |
| P5 未达成项：资源变化时缓存名不轮换 | 本批 A 组收尾，方案改为「服务端给 `/service-worker.js` 注入版本注释 + SW 每次启动解析缓存名」 | 只改资源不改 SW 字节时浏览器不会触发更新；把版本写进 SW 响应体，字节就会变，更新必然触发。这样也不用动三个前端注册文件 |
| `theme-toggle.js` 实际未被 HTML 引用（我上一批的假设错误） | 本批起，凡涉及「某文件被引用」的验收项，执行方先 grep 确认，若不存在就在报告里写明并改验等价口径 | 上一批已按此处理，做法正确 |
| K-12 删 `data/db-config.json` | **本批不做**，等用户批准 | 删除既有文件需批准 |
| K-11 `launcher.ps1`、K-16 / K-15 前端 | 拆到后续批次（`launcher.ps1` 与 `public/admin.js` 各一批） | 一次一个模块，避免同一提交里混两种回归面 |
| 跨模块豁免 | 批准本批动 `server.js`（A+B 组）与 `public/service-worker.js`（A 组），两次提交、各自可回滚 | SW 的版本注释必须由服务端提供，两者不可拆 |

## 1. 冻结清单

| 项 | 值 |
| --- | --- |
| 允许改动的模块 | `server.js`（A 组：SW 版本注入；B 组：密码校验、端口、响应头）、`public/service-worker.js`（A 组） |
| 允许的依赖 | 不新增 |
| 允许的新文件 | `docs/reports/P6-执行报告.md` |
| 允许的临时产物 | `tmp/` 下任意文件（含数据库备份） |
| 禁止触碰 | `public/*.html`、`public/admin.js` / `script.js` / `profile.js` 的 SW 注册行、`public/*.css`、`db-config.js`、`launcher.ps1`、`package.json`、`version.json`、`data/` 下库文件、表结构 |

## 2. 逐项交付

### A 组（先做，单独提交）：K-19 让缓存名真正轮换

| # | 交付物 | 位置 | 要求 |
| --- | --- | --- | --- |
| A1 | SW 版本注入 | `server.js`，就近放在 HTML 重写中间件附近、`express.static` 之前 | 新增 `GET /service-worker.js`：读 `public/service-worker.js` 原文，在最前面拼一行 `// asset-version: <assetVersion>`（用已有的 `assetVersion` 常量），响应头 `Content-Type: application/javascript; charset=utf-8` 与 `Cache-Control: no-cache, no-store, must-revalidate`。**不得修改文件本体**，只改响应 |
| A2 | 缓存名不再依赖 install | `public/service-worker.js` | 删掉「只在 install 里给 `CACHE_NAME` 赋值、运行期当常量用」的做法：改为 `getCacheName()`（单例 Promise，内部 `fetch('/api/asset-version', {cache:'no-store'})`，成功返回 `'typing-' + version`，失败返回 `'typing-fallback'`；**失败时把 Promise 置回 null 以便下次重试**）。所有 `caches.open(...)` 与 activate 里的比较都改成 `await getCacheName()` |
| A3 | 预缓存清单同源 | 同文件 | 预缓存清单与缓存名**共用同一次 fetch**（install 只允许请求 `/api/asset-version` 一次，Network 面板可核）；取不到时退回静态清单 |
| A4 | 清掉遗留参数 | 同文件 `CRITICAL_ASSETS` | `'/loading-indicator.js?v=2'` 改成 `'/loading-indicator.js'`；fallback 清单统一用不带查询参数的裸路径 |

实现约束：**不许动** IndexedDB 离线文章、离线回退策略、`postMessage` 协议、三个前端文件里的 `register('service-worker.js')`（保持原样——SW 响应体字节会随版本变化，浏览器自然会检测到更新）。install 里原有的 `catch` 不阻断语义保留。

### B 组（A 组通过后，单独提交）：K-18 / K-10 / 安全响应头

| # | 交付物 | 位置 | 要求 |
| --- | --- | --- | --- |
| B1 | K-18 密码校验收拢 | `server.js` | 新增 `validatePassword(pw)`：长度小于 6 返回 `'密码至少6位'`，`Buffer.byteLength(pw,'utf8') > 72` 返回 `'密码不能超过 72 字节'`，合法返回 null。**五处统一调用它**：注册、`PUT /api/auth/me`、`PUT /api/user/password`、`PUT /api/admin/users/:id`、`POST /api/bootstrap/create-admin`（最后一处是本次要补的缺口）。返回文案与状态码沿用现有 400 约定，不要改文案 |
| B2 | K-10 端口读环境变量 | `server.js` 第 17 行 | `const PORT = Number.parseInt(process.env.PORT, 10) || 3000;`；启动日志打印实际监听的端口号。监听地址、其它启动逻辑不变 |
| B3 | 安全响应头 | `server.js`，放在 `compression` 之前 | 三个头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: same-origin`。**本批不加 CSP**（页面里有大量内联脚本、`onload=` 属性与 cdn.jsdelivr.net 的 Chart.js，硬加会破页面）；请在报告里把「为什么暂不加 CSP」写进不确定项 |

## 3. 验收口径

### A 组（这一组是 P5 的补考，必须真验）

| 步骤 | 期望 |
| --- | --- |
| `curl -s http://localhost:3000/service-worker.js` 的前两行 | 第一行是 `// asset-version: <12位十六进制>`，值与 `GET /api/asset-version` 的 `version` 完全一致；第二行起与源文件一致 |
| `curl -I http://localhost:3000/service-worker.js` | `Cache-Control: no-cache, no-store, must-revalidate`，`Content-Type: application/javascript` |
| 临时给 `public/theme-toggle.js` 追加一行注释 → 重启 → 再看 `/service-worker.js` 首行 | 版本号变化（贴改前/改后两行） |
| 浏览器（已装 SW）打开 `admin.html` | DevTools → Application → Service Workers 出现「有新版本 / waiting」并完成更新；刷新后 Cache Storage 里出现 **`typing-<新版本>`**，旧 `typing-<旧版本>` 被删除 |
| 在 DevTools 里 Stop Service Worker 后刷新页面 | 写缓存仍落在 **`typing-<当前版本>`**，不再出现 `typing-fallback`（这是 P5 未通过的那条） |
| Network 面板看 install 期间 | `/api/asset-version` 只请求 **1 次** |
| 离线刷新 `index.html` | 仍能打开并显示离线提示；离线文章列表仍可读到 2 篇；控制台无 install/activate 报错 |
| 首装失败路径 | 临时让 `/api/asset-version` 返回 500 → SW 能 install，缓存名 `typing-fallback`；恢复后再触发一次 SW 更新，缓存名纠正为 `typing-<版本>` |
| 复原 | `public/theme-toggle.js` 恢复原样，sha256 与改动前一致（贴哈希），`/service-worker.js` 首行回到原版本号 |

### B 组

| 步骤 | 期望 |
| --- | --- |
| 注册 / `PUT /api/auth/me` / `PUT /api/user/password` / `PUT /api/admin/users/:id` 四处用 73 字节密码 | 全部 400 `密码不能超过 72 字节`；用 72 字节均 200 |
| `POST /api/bootstrap/create-admin` 用 73 字节密码（在无管理员的实例上测，或用 `tmp/` 里的空库副本） | **400**（这是 K-18 的原始缺口，必须补上）；72 字节 200 |
| 六位以下密码 | 仍返回 `密码至少6位`（文案未变） |
| `$env:PORT=3055` 后启动 | 监听 3055，启动日志打印 3055；不设 `PORT` 时仍 3000 |
| `curl -I http://localhost:3000/` | 三个响应头都在；页面正常渲染 |
| 图表回归 | `admin.html` 仪表盘 Chart.js 能画出图（证明没被响应头或 CSP 影响） |
| 回归 | 删文章 200、登录 200、`/api/asset-version` 200、`admin.html` 资源引用仍带 `?v=`、`/api/admin/db/users` 无 `password_hash` |

命令行示例（带凭据的操作在浏览器 Console 做，凭据不进命令行）：

```powershell
node --check server.js
node --check public/service-worker.js
curl.exe -sI http://localhost:3000/service-worker.js
curl.exe -s http://localhost:3000/service-worker.js | Select-Object -First 2
curl.exe -sI http://localhost:3000/
curl.exe -s http://localhost:3000/api/asset-version
```

## 4. 停止点

- 注入版本注释后 SW 里出现语法错误或注册失败 → 停（很可能是注释插到了 shebang 或字符串里，先贴首 3 行）
- 页面白屏、离线回退失效、离线文章读不到 → 停（说明动了不该动的地方）
- 加响应头后 Chart.js 或页面样式异常 → 停，先回退该头再报
- 端口改成读环境变量后，`launcher.ps1` 的端口逻辑出现冲突 → 停，报告里写明，不要顺手改 `launcher.ps1`
- 需要改前端注册行、需要改 HTML、需要新依赖 → 停
- 任一验收与期望不符且原因不明

## 5. 交付格式

四段式加执行报告，写进 `docs/reports/P6-执行报告.md`，第一行写 `docs/prompts/P6-服务端杂项与SW收尾.md` 的 sha256。报告必须含：

1. 改了什么：A / B 两组分开列。
2. 怎么验证：A 组要贴 `/service-worker.js` 首行的改前/改后、Cache Storage 的名字清单（含 Stop SW 之后那一次）；B 组要贴四处 + 初始化接口的 73 字节结果与端口日志。
3. 怎么回滚：两组各自改回哪几行；A 组额外写「删除 `/service-worker.js` 路由并把 SW 改回 install 内赋值」。
4. 不确定项：必须包含「为什么不加 CSP」「`theme-toggle.js` 已复原且哈希一致」。
5. 数据结构与关系清单：预期「无变化」。
6. 上线提示：一句话说明「客户端第一次刷新即完成 SW 换版；异常时 Ctrl+F5」。

## 6. 本轮不做

- K-12 删除 `data/db-config.json`（等用户批准）
- K-11 `launcher.ps1`（下一批）、K-16 / K-15 前端 `admin.js`（下一批）
- K-04 成绩上报契约、K-05 改密不失效（两项待用户批准立项）
- 版本号体系（等用户文档）；不改 `package.json` / `version.json` / 前端版本显示
- CSP、HSTS、Permissions-Policy（只加 §2 的三个头）
