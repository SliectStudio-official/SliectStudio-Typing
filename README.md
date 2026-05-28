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
- **双数据库**：SQLite / MySQL 灵活切换

## 环境要求

- **Node.js v22 LTS**（⚠️ 不支持 v23/v24，better-sqlite3 无预编译包）
- Python 3.x（可选，用于文章爬虫功能）

## 快速启动

### Windows（推荐）

双击 `start.bat` 即可一键启动，脚本会自动完成：

1. 检测/安装 Node.js v22 LTS 环境
2. 安装 npm 依赖
3. 启动服务器并打开浏览器

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

## 环境安装失败排查

### 问题1：npm 不是可识别的命令

**原因**：Node.js 未安装或未加入 PATH。

**解决**：双击 `start.bat`，脚本会自动检测并安装 Node.js v22 LTS。

### 问题2：better-sqlite3 编译失败 / gyp ERR!

**原因**：安装了 Node.js v23 或 v24，better-sqlite3 对这些版本没有预编译二进制包，需要从源码编译，而系统缺少 C++ 编译工具链。

**解决**：

1. 卸载当前 Node.js（控制面板 → 卸载 Node.js）
2. 安装 Node.js **v22 LTS**：https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
3. 或使用国内镜像：https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-x64.msi
4. 安装时勾选 **Add to PATH**
5. 重新双击 `start.bat`

**离线安装**：如果部署机无法联网，将 `node-v22.14.0-x64.msi` 放到项目根目录，双击 `start.bat` 会自动检测并安装。

### 问题3：npm install 网络超时

**解决**：切换 npm 镜像源：

```bash
npm config set registry https://registry.npmmirror.com
```

然后重新运行 `start.bat`。

### 问题4：端口被占用

服务默认使用 3000 端口，脚本会自动尝试 3000-3010 范围内的可用端口。

## 数据库配置

项目支持 SQLite 和 MySQL 双数据库，通过 `db-config.json` 切换：

```json
{
  "type": "sqlite",
  "sqlite": { "path": "./data/typing.db" },
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "typing",
    "charset": "utf8mb4"
  }
}
```

将 `type` 改为 `mysql` 并填写连接信息即可切换。

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
├── db-config.js         # 数据库适配层
├── db-config.json       # 数据库配置
├── launcher.ps1         # 一键启动脚本
├── crawler.py           # 文章爬虫脚本
├── start.bat            # Windows 启动入口
├── package.json         # Node.js 依赖
├── requirements.txt     # Python 依赖
└── version.json         # 版本信息
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite3 (better-sqlite3) / MySQL (mysql2) |
| 前端 | 原生 HTML / CSS / JavaScript |
| 认证 | JWT + bcryptjs |

## 默认端口

服务默认运行在 `3000` 端口，如需修改请编辑 `server.js` 中的 `PORT` 变量。

## 开源协议

MIT