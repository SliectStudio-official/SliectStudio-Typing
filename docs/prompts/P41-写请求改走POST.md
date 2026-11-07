# P41-管理页写操作改走 POST（绕过“代理/安全软件拦 PUT·DELETE”）

> 读的提示词就是本文件。开工时算本文件 sha256，写进执行报告第一行。
> 你是执行方 AI。改 `server.js`（3 行中间件）+ `public/admin.js`（写请求统一走 POST）。**做完必须重启。**

## 0. 事故背景（已定位到客户端，不是我们服务端）

用户服务器上，浏览器（另一台电脑）访问 `http://192.168.108.111:3001`：

| 测试 | 结果 |
| --- | --- |
| `PUT /api/version`（路径根本不存在） | **`net::ERR_CONNECTION_RESET`** |
| `POST /api/admin/code-languages` | **404**（服务器正常响应） |
| 服务器本机 `curl -X PUT` 打同一 LAN 地址 | **200 `{"selected":[]}`** |

结论：**那台客户端对「PUT（以及 DELETE）」的出站请求被掐断**（安全软件的 HTTP 扫描 / 代理扩展的典型行为），而 POST 放行。表现就是管理页所有写操作 `Failed to fetch`（改语言分类、删用户、改配置全都失败）。

我们无法要求用户卸载安全软件，所以让**写请求走 POST**，服务端认一个覆盖头。

## 1. 服务端（`server.js`）

| # | 要求 |
| --- | --- |
| A1 | 在 `express.json()` 之后、所有路由之前加一个极小的中间件：若 `req.method === 'POST'` 且存在 `x-http-method-override`，把 `req.method` 改成该值（只接受 `PUT` / `PATCH` / `DELETE`，其它值忽略并原样保留 POST） |
| A2 | 该中间件不写日志噪音（只在 `NODE_DEBUG` 或调试开关下打印），不改任何路由代码 |
| A3 | 头名大小写不敏感（`req.headers` 已是小写，直接用 `x-http-method-override`） |
| A4 | **安全边界**：只允许上面三个方法；不允许覆盖成 GET/POST（避免被拿来绕过 CSRF 之类的语义）；不新增任何端点 |

## 2. 前端（`public/admin.js`）

| # | 要求 |
| --- | --- |
| B1 | 加一个统一的写请求封装（例如 `async function apiWrite(url, options)`）：`method` 为 `PUT`/`PATCH`/`DELETE` 时，实际发出 **POST**，并带上 `x-http-method-override: <原方法>` 头；`GET` 请求与现在完全一致 |
| B2 | 把管理页里所有写请求改用该封装：语言分类开关、代码素材增删改、上下架、文章编辑保存、分类增删、用户增删改、公告、敏感词、数据库配置、清空排行榜、备份创建/删除/恢复、审核等——**逐处替换，不留裸 `method: 'PUT'/'DELETE'`** |
| B3 | 报错文案保持原样（`e.message` 仍抛给 toast）；不改变任何业务逻辑与参数 |
| B4 | 搜一遍确认：`grep -n "method: *'PUT'\|method: *'DELETE'" public/admin.js` **结果为 0 行** |

## 3. 验收（逐条贴读数）

| # | 场景 | 判据 |
| --- | --- | --- |
| 1 | 中间件生效 | `curl -X POST -H "x-http-method-override: PUT" -H "Content-Type: application/json" -H "Authorization: Bearer <token>" --data-binary @body.json http://127.0.0.1:<port>/api/admin/code-languages` → **200 `{"selected":[]}`**（贴响应） |
| 2 | 非法覆盖被忽略 | 同上但头值为 `GET` → 请求仍按 POST 处理（得到 404 或原 POST 语义），**不会变成 GET**（贴状态码与响应） |
| 3 | 删除类也能过 | `POST + override: DELETE` 删除一条测试成绩 → 200；`grep` 里 admin.js 已无裸 DELETE |
| 4 | 管理页全流程 | 用一个**只放行 GET/POST 的代理**（或用 Chrome DevTools 的 Request blocking 模拟阻断 PUT/DELETE）时：语言分类开关、删除用户、保存公告、创建备份 全部成功（各贴一条读数） |
| 5 | 回归 | 普通模式：练习、比赛建房/匹配、个人中心、排行榜 各一条读数；`node --check server.js` 与 `node --check public/admin.js` 无输出；控制台 0 错误 |
| 6 | 其它页面不受影响 | `script.js`/`race.js`/`profile.js` 的写请求若也有 PUT/DELETE（成绩提交、退出比赛等），**本批不改**，但要列出清单说明它们仍走原方法（贴 grep 结果） |

## 4. 允许改什么 / 不许改什么

| 允许 | 不许 |
| --- | --- |
| `server.js`（method-override 中间件）、`public/admin.js`（写请求封装与替换） | 新增端点、改业务逻辑、改其它页面的写请求、改 `VERSION`、加依赖 |

## 5. 停止点

- 若你发现管理页有写请求**不是** `fetch`（例如 `XMLHttpRequest`）→ 停，先报清单；
- 若替换过程中发现某处用了 `FormData`（如备份上传）→ **不要**强行改（`FormData` + POST 本来就正常），只处理 JSON 的 PUT/DELETE，报告里说明；
- 若 `x-http-method-override` 与现有中间件冲突（例如 body 解析顺序）→ 停，先报。

## 6. 交付格式

四段式 + `docs/reports/P41-执行报告.md`，第一行写本文件 sha256；§3 六条逐条贴读数；附 `grep` 的两条结果（PUT/DELETE 已清零、其它页面清单）。

