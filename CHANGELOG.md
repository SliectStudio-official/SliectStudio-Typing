# Typing 更新日志

## Typing-260526.1708

### 新增功能
- 🔌 **SQLite/MySQL 双数据库支持**：通过 db-config.json 灵活切换
- 📡 **离线访问提醒**：橙色横幅提示当前处于离线状态
- 🏷️ **版本号配置**：统一管理版本信息

### 修复问题
- 🐛 敏感词列表永远加载为空
- 🐛 成绩数据无验证（speed/accuracy/time_seconds范围校验）
- 🐛 删除分类后文章category_id悬空
- 🐛 删除文章非原子操作（使用事务包装）
- 🐛 排行榜全量返回（添加LIMIT 500）
- 🐛 Service Worker预缓存不存在的API
- 🐛 JWT_SECRET安全警告
- 🐛 role空值不更新
- 🐛 email空白字符串处理
- 🐛 前端注册缺密码长度校验
- 🐛 公告列表加载失败（Incorrect DATETIME value）
- 🐛 注册时nickname未设置
- 🐛 无法清空邮箱
- 🐛 管理员编辑用户不同步nickname
- 🐛 错字记录批量插入未使用事务
- 🐛 MySQL连接未处理异常情况
- 🐛 更新用户信息遗漏nickname字段
