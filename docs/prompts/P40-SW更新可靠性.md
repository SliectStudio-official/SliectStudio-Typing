# P40-Service Worker 更新可靠性（发版后浏览器不再吃旧 SW）

> 读的提示词就是本文件。开工时算本文件 sha256，写进执行报告第一行。
> 你是执行方 AI。改 4 个前端文件里的注册代码 + `style.css` 加一个小提示条。**不用重启。**

## 0. 事故背景（真实线上）

用户服务器升级到 `3.5` 后，管理页所有**写**请求报 `Failed to fetch`、但 GET 能显示数据。排查结论：

1. 服务端与局域网完全正常（我用 `curl` 打 PUT 返回 `200 {"selected":[]}`）；
2. 浏览器里跑的还是**旧版 Service Worker**（3.4 那个有 `NETWORK_ONLY_PREFIXES` 未定义缺陷的版本）；
3. 旧 SW 把 `/api/*` 的 GET 从**缓存**吐出（所以表格有数据），而 PUT 不缓存、在 SW 里抛 `ReferenceError` → 页面看到的就是 `Failed to fetch`。

根因：`navigator.serviceWorker.register('service-worker.js')` **没有版本参数、也没有禁用 HTTP 缓存**，SW 脚本可能长时间命中浏览器 HTTP 缓存，导致“服务端已更新、前端还在跑旧 SW”。

## 1. 要改什么

| # | 位置 | 要求 |
| --- | --- | --- |
| A1 | `public/script.js`（约 1741）、`public/home.js`（约 630）、`public/admin.js`（约 3213）、`public/profile.js`（约 1235） | 注册改为：`navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })` |
| A2 | 同上四处 | 注册成功后立即 `reg.update().catch(()=>{})`；并监听 `document.visibilitychange`（页面变可见时）再 `reg.update()` 一次 |
| A3 | 同上四处 | 监听 `navigator.serviceWorker.addEventListener('controllerchange', ...)`：**不要自动 reload**（正在打字会被打断），改为显示顶部提示条「本站已更新，点此刷新」 |
| A4 | `public/style.css` | 新增提示条样式（复用端口漂移横幅那套视觉，另起 class `sw-update-banner`），出现时固定在顶部、不遮挡导航 |
| A5 | 四处注册代码重复 | 允许**收拢到一个函数**（如 `ensureServiceWorker()`）放在被多处引用的文件里（`script.js` 里已有类似工具函数风格，按现有做法即可）；若你觉得跨文件共享成本更高，就各自重复这三行，**不要为此新增文件或依赖** |

## 2. 验收（关键：模拟“旧 SW 仍在跑”的场景）

| # | 场景 | 判据 |
| --- | --- | --- |
| 1 | 注册参数生效 | DevTools → Application → Service Workers：`Update on reload` 不必勾选也能更新；在 Console 执行 `await navigator.serviceWorker.getRegistration()` 后贴 `registration.updateViaCache`（应为 `none`） |
| 2 | **改 SW 后一次刷新即生效** | ①当前 SW 正常；②把 `service-worker.js` 里某个 `console.log('SW v1')` 改成 `v2`；③**只按一次普通刷新**（不 Ctrl+F5）；④Console（SW 上下文）里出现 `v2`（贴前后两条日志） |
| 3 | 更新提示条 | 用 DevTools 里 `Update` 按钮触发新 SW 接管：页面顶部出现「本站已更新，点此刷新」，**不自动 reload**（贴横幅文案与 `location.href` 未变） |
| 4 | 打字不被打断 | 在代码模式里正在输入时触发 SW 更新：页面**不自动跳转**，输入内容还在（贴输入前后长度） |
| 5 | 管理页写操作 | 强制切换到新 SW 后，在管理页点「语言分类」开关：`PUT /api/admin/code-languages` 返回 **200**（贴状态码） |
| 6 | 回归 | 五个页面加载正常、离线打开仍可用（SW 仍已注册、Cache Storage 有 `typing-*`）；控制台 0 错误 |

## 3. 允许改什么 / 不许改什么

| 允许 | 不许 |
| --- | --- |
| `public/script.js`、`public/home.js`、`public/admin.js`、`public/profile.js` 的注册段、`public/style.css`（横幅样式） | 改 `service-worker.js` 的缓存策略、改业务逻辑、改 `VERSION`、加依赖、改 `server.js` |

## 4. 停止点

- 若 `updateViaCache: 'none'` 在目标浏览器上报错（老内核不支持）→ 用 try/catch 回退到普通 `register()`，报告里说明；
- 若 `controllerchange` 在“首次安装”时也会触发（导致刷新提示误报）→ 停，先报你观察到的时序，我决定是否只在已有 controller 时才提示。

## 5. 交付格式

四段式 + `docs/reports/P40-执行报告.md`，第一行写本文件 sha256；§2 六条逐条贴读数（第 2、3 条必须附日志/截图）。

