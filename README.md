# 局域网打字练习网站

一个功能完善的局域网打字练习平台，支持多人竞技排行、个人进步追踪和丰富的内容管理，适合学校、培训机构或企业内部部署使用。

## 功能特性

- **双模式练习**：限时模式与完成全文模式
- **实时统计**：速度、准确率、进度条可视化
- **文章管理**：多分类文章库，支持投稿审核与私人文章
- **排行榜**：总榜、本周榜、今日榜、游客榜
- **用户系统**：注册登录、练习历史、错字分析、数据统计
- **后台管理**：仪表盘、用户/文章/分类/公告管理、数据库管理
- **主题切换**：亮色/暗色模式
- **PWA 支持**：支持离线缓存

## 环境要求

- Node.js >= 16
- Python 3.x（用于文章爬虫功能）

## 快速启动

### Windows

双击运行项目根目录下的 `start.bat` 文件即可启动：

```
start.bat
```

或在命令行中执行：

```cmd
start.bat
```

### 手动启动

1. 安装 Node.js 依赖：

```bash
npm install
```

2. 安装 Python 依赖（可选，用于文章爬虫）：

```bash
pip install -r requirements.txt
```

3. 启动服务器：

```bash
npm start
```

## 首次使用

系统首次启动时会自动跳转到初始化页面，请按提示创建管理员账户。

启动成功后，在浏览器中访问：

- 本机：`http://localhost:3000`
- 局域网：`http://<本机IP>:3000`

## 项目结构

```
LanTest/
├── public/              # 前端静态资源
│   ├── index.html       # 主页面
│   ├── admin.html       # 管理后台
│   ├── profile.html     # 个人中心
│   ├── script.js        # 主页面逻辑
│   ├── style.css        # 样式文件
│   └── ...
├── server.js            # Express 服务端
├── crawler.py           # 文章爬虫脚本
├── start.bat            # Windows 启动脚本
├── start.ps1            # PowerShell 启动脚本
├── package.json         # Node.js 依赖
├── requirements.txt     # Python 依赖
└── version.json         # 版本信息
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite3 (better-sqlite3) |
| 前端 | 原生 HTML / CSS / JavaScript |
| 认证 | JWT + bcryptjs |

## 默认端口

服务默认运行在 `3000` 端口，如需修改请编辑 `server.js` 中的 `PORT` 变量。

## 开源协议

MIT
