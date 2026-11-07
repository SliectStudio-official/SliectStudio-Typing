# 分发说明（releases/）

> 这里的 zip 是**可直接分发的整包**，由 `node make-release.mjs` 生成。
> 不要手工拷项目目录去分发——目录里有数据库、密钥与内部文档。

## 当前包

| 项 | 值 |
| --- | --- |
| 文件 | `LanTest-3.0.261106.2038.zip` |
| 产物版本 | 3.0.261106.2038（唯一真值 `VERSION`） |
| 数据规范版本 | v2（唯一真值 `CONTRACT_VERSION`） |
| 文件数 / 压缩后体积 | 29 / 0.13 MB |
| sha256 | `1d310c0111de8fadd38f5795bbfd2975dcb55c65a12d01a57e9f24d45caa5745` |

## 包里有什么

运行代码与前端、离线安装脚本、白名单依赖声明、样例配置、版本真值文件、`set-version.ps1`（版本唯一写入口）、分发说明与许可证。

## 包里**没有**什么（这是刻意的）

| 排除项 | 原因 | 用户怎么补 |
| --- | --- | --- |
| `data/`（数据库与 WAL） | 含真实用户数据 | 首次启动自动建库 |
| `db-config.json` | 含明文 MySQL 密码 | 复制 `db-config.sample.json` 改名为 `db-config.json` 后填自己的值 |
| `launcher.config.ps1` | 含 JWT 密钥 | 首次运行 `start.bat` 选「2 Production」自动生成，**切勿与他人共用同一密钥** |
| `docs/`、`AGENTS.md`、`.trae/` | 内部规划文档与漏洞清单 | 不需要 |
| `public/avatars/` 下的图片 | 真实用户上传的头像 | 目录首次启动自动创建 |
| `node_modules/` | 体积大且与本机 ABI 绑定 | `launcher.ps1` 会自动 `npm install` |
| `node-v22.14.0-x64.msi` | 30 MB，仅离线装机需要 | 需要时重新生成：`node make-release.mjs --with-node-msi` |

## 部署三步

1. 解压到目标目录（路径别带空格更省事）。
2. 双击 `start.bat` → 首次选「2 Production Deploy」；脚本会检测/安装 Node 22.14.0、装依赖、生成密钥与配置、启动服务。
3. 首次打开页面会跳出初始化向导，**必须在服务器本机完成**（局域网其它机器会被 403 拦下，这是 P3 的安全取舍）。

## 升级提醒

- 升级前备份 `data/`、 `db-config.json`、 `launcher.config.ps1` 三样；升级只替换代码文件。
- 客户端第一次刷新会拉新资源（P5 的内容指纹 + P6 的 SW 版本注入）；异常时让用户 Ctrl+F5。
- 版本可复核：`powershell -NoProfile -ExecutionPolicy Bypass -File set-version.ps1 -Check`。

## 重新生成

`node make-release.mjs` → 自动白名单复制、敏感值审计、压缩，审计不过不会产出 zip。
发版前先改版本：`powershell -File set-version.ps1 -Minor`（或 `-Major` / 缺省刷新时间段）。
