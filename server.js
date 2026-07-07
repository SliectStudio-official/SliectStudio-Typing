const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const compression = require('compression');
const { execFile } = require('child_process');
const {
  loadConfig, saveConfig, createDatabase,
  isMySQL, nowLocaltime, curDate, dateFn, daysAgo, coalesceEmptyDesc,
  getMySQLCreateSQL, getSQLiteCreateSQL, runMigrations, seedData
} = require('./db-config');

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'typing-practice-jwt-secret-key-2026');
if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
if (!process.env.JWT_SECRET) {
  console.warn('[安全警告] JWT_SECRET 未设置，使用硬编码密钥。生产环境请务必设置环境变量 JWT_SECRET。');
}

app.use(compression({
  level: 6,
  threshold: 256,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // HTML files: short cache, always revalidate
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    // CSS/JS: long cache with revalidation
    else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
    // Images/avatars: very long cache
    else if (/\.(jpg|jpeg|png|gif|webp|ico|svg)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
    // Service worker: no cache
    if (filePath.endsWith('service-worker.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const avatarDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeId = String(req.user.id).replace(/[^0-9]/g, '');
    const name = safeId + '_' + Date.now() + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持 jpg/png/gif 格式'));
  }
});

const txtUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.txt') cb(null, true);
    else cb(new Error('仅支持 txt 格式'));
  }
});

let db;
let currentConfig;

async function initDatabase() {
  currentConfig = loadConfig();
  db = await createDatabase(currentConfig);
  console.log(`数据库类型: ${currentConfig.type === 'mysql' ? 'MySQL' : 'SQLite'}`);

  const createSQL = currentConfig.type === 'mysql' ? getMySQLCreateSQL() : getSQLiteCreateSQL();
  await db.exec(createSQL);
  await runMigrations(db);
  await seedData(db);
}

function normalizeDateTimeInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace('T', ' ').slice(0, 19);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized) ? normalized + ':00' : normalized;
}

function parseDatabaseValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = normalizeDateTimeInput(value);
    return normalized !== null ? normalized : value;
  }
  return value;
}

function calculateDifficulty(content) {
  const charCount = content.length;
  const punctuationCount = (content.match(/[，。！？、；：""''《》（）\[\]{},.!?;:'"()<>\/\\@#$%^&*+=~`]/g) || []).length;
  const specialCount = (content.match(/[0-9@#$%^&*+=~`\/\\<>]/g) || []).length;
  const chineseCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const score = (charCount / 100) * 0.3 + (punctuationCount / Math.max(1, charCount)) * 30 + (specialCount / Math.max(1, charCount)) * 40 + (chineseCount / Math.max(1, charCount)) * 5;
  const difficulty = score < 15 ? 1 : score < 30 ? 2 : 3;
  return { difficulty, difficulty_score: score };
}

async function containsSensitiveWord(text) {
  const row = await db.get("SELECT value FROM settings WHERE `key` = 'sensitive_words'");
  if (!row || !row.value) return null;
  const words = row.value.split(',').map(w => w.trim()).filter(w => w);
  for (const word of words) {
    if (word && text.includes(word)) return word;
  }
  return null;
}

async function hasAdminUser() {
  const row = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  return row.count > 0;
}

async function getActiveAnnouncement() {
  const nl = nowLocaltime(db);
  const emptyCheck = isMySQL(db) ? '' : " OR start_time = ''";
  const emptyCheck2 = isMySQL(db) ? '' : " OR end_time = ''";
  const row = await db.get(
    `SELECT * FROM announcements
     WHERE is_active = 1
       AND (start_time IS NULL${emptyCheck} OR start_time <= ${nl})
       AND (end_time IS NULL${emptyCheck2} OR end_time >= ${nl})
     ORDER BY
       CASE level
         WHEN 'warning' THEN 1
         WHEN 'site-wide' THEN 2
         WHEN 'notification' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT 1`
  );
  return row || null;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'token无效或已过期' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
}

app.get('/api/bootstrap/status', async (req, res) => {
  try {
    const needsBootstrap = !(await hasAdminUser());
    res.json({ needsBootstrap });
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/bootstrap/create-admin', async (req, res) => {
  try {
    if (await hasAdminUser()) {
      return res.status(400).json({ error: '管理员账户已存在' });
    }
    const { username, email, password, passwordConfirm } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度2-20字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: '两次输入的密码不一致' });
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, email, password_hash, role, nickname) VALUES (?, ?, ?, ?, ?)', username, email || null, hash, 'admin', username);
    await db.run("UPDATE settings SET value = 'false' WHERE `key` = 'needs_bootstrap'");
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username, nickname: username, email: email || '', role: 'admin' } });
  } catch (e) {
    res.status(500).json({ error: '创建管理员失败: ' + e.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const bootstrapRow = await db.get("SELECT value FROM settings WHERE `key` = 'needs_bootstrap'");
    if (bootstrapRow && bootstrapRow.value === 'true') {
      return res.status(403).json({ error: '请先完成系统初始化' });
    }
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度2-20字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    if (email && email.trim()) {
      const emailExisting = await db.get('SELECT id FROM users WHERE email = ?', email.trim());
      if (emailExisting) {
        return res.status(400).json({ error: '邮箱已被注册' });
      }
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, email, password_hash, role, nickname) VALUES (?, ?, ?, ?, ?)', username, email || null, hash, 'user', username);
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username, nickname: username, email: email || '', role: 'user' } });
  } catch (e) {
    res.status(500).json({ error: '注册失败: ' + e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname || user.username, email: user.email || '', role: user.role } });
  } catch (e) {
    res.status(500).json({ error: '登录失败: ' + e.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, email, role, created_at, nickname, avatar FROM users WHERE id = ?', req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ ...user, avatar: user.avatar ? '/avatars/' + user.avatar : '' });
  } catch (e) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

app.put('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const resolvedEmail = email !== undefined ? email : user.email;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: '修改密码需要提供当前密码' });
      }
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(400).json({ error: '当前密码不正确' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码至少6位' });
      }
      const newHash = bcrypt.hashSync(newPassword, 10);
      if (username && username !== user.username) {
        const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', username, user.id);
        if (existing) {
          return res.status(400).json({ error: '用户名已存在' });
        }
        await db.run('UPDATE users SET username = ?, email = ?, password_hash = ?, nickname = ? WHERE id = ?', username, resolvedEmail, newHash, username, user.id);
        const token = jwt.sign({ id: user.id, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username, nickname: username, email: resolvedEmail || '', role: user.role } });
        return;
      }
      await db.run('UPDATE users SET email = ?, password_hash = ? WHERE id = ?', resolvedEmail, newHash, user.id);
      res.json({ success: true });
      return;
    }

    if (username && username !== user.username) {
      const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', username, user.id);
      if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      await db.run('UPDATE users SET username = ?, email = ?, nickname = ? WHERE id = ?', username, resolvedEmail, username, user.id);
      const token = jwt.sign({ id: user.id, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username, nickname: username, email: resolvedEmail || '', role: user.role } });
      return;
    }

    await db.run('UPDATE users SET email = ? WHERE id = ?', resolvedEmail, user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '更新失败: ' + e.message });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, email, role, created_at, nickname FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (username && username !== user.username) {
      const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', username, req.params.id);
      if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
      }
    }
    const updates = [];
    const params = [];
    if (username) { updates.push('username = ?'); params.push(username); updates.push('nickname = ?'); params.push(username); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '角色必须为 admin 或 user' });
      }
      updates.push('role = ?'); params.push(role);
    }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: '密码至少6位' });
      }
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(password, 10));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }
    params.push(req.params.id);
    await db.run('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?', ...params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '更新用户失败: ' + e.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT role FROM users WHERE id = ?', req.params.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (user.role === 'admin') {
      const adminCount = (await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")).count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: '不能删除唯一的管理员账户' });
      }
    }
    await db.transaction(async (tdb) => {
      await tdb.run('DELETE FROM scores WHERE user_id = ?', req.params.id);
      await tdb.run('DELETE FROM error_logs WHERE user_id = ?', req.params.id);
      await tdb.run('DELETE FROM private_articles WHERE user_id = ?', req.params.id);
      await tdb.run('UPDATE articles SET author_id = NULL WHERE author_id = ?', req.params.id);
      await tdb.run('DELETE FROM users WHERE id = ?', req.params.id);
    })();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除用户失败: ' + e.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const cats = await db.all('SELECT * FROM categories ORDER BY id');
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: '获取分类失败' });
  }
});

app.post('/api/categories', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }
    const existing = await db.get('SELECT id FROM categories WHERE name = ?', name);
    if (existing) {
      return res.status(400).json({ error: '分类已存在' });
    }
    const result = await db.run('INSERT INTO categories (name) VALUES (?)', name);
    res.json({ id: result.lastInsertRowid, name });
  } catch (e) {
    res.status(500).json({ error: '创建分类失败: ' + e.message });
  }
});

app.put('/api/categories/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }
    await db.run('UPDATE categories SET name = ? WHERE id = ?', name, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '更新分类失败: ' + e.message });
  }
});

app.delete('/api/categories/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.transaction(async (tdb) => {
      await tdb.run('UPDATE articles SET category_id = NULL WHERE category_id = ?', req.params.id);
      await tdb.run('DELETE FROM categories WHERE id = ?', req.params.id);
    })();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除分类失败: ' + e.message });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    const categoryId = req.query.category_id;
    const difficultyFilter = req.query.difficulty;
    const search = (req.query.search || '').trim();

    let isAdmin = false;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        if (decoded.role === 'admin') isAdmin = true;
      } catch (e) {}
    }

    let whereClauses = [];
    let params = [];

    if (!isAdmin) {
      whereClauses.push("a.status = 'approved'");
    }

    if (categoryId) {
      whereClauses.push('a.category_id = ?');
      params.push(categoryId);
    }

    if (difficultyFilter) {
      whereClauses.push('a.difficulty = ?');
      params.push(difficultyFilter);
    }

    if (search) {
      whereClauses.push('(a.title LIKE ? OR a.content LIKE ? OR a.source LIKE ?)');
      const keyword = '%' + search + '%';
      params.push(keyword, keyword, keyword);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const articles = await db.all(
      `SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id ${whereStr} ORDER BY a.id DESC`,
      ...params
    );

    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取文章列表失败' });
  }
});

app.post('/api/articles', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, category_id, source } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: '标题不能超过200字符' });
    }
    if (content.length > 50000) {
      return res.status(400).json({ error: '内容不能超过50000字符' });
    }
    if (!category_id) {
      return res.status(400).json({ error: '请选择分类' });
    }
    const { difficulty, difficulty_score } = calculateDifficulty(content);
    const result = await db.run('INSERT INTO articles (title, content, category_id, source, status, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?)', title, content, category_id, source || '', 'approved', difficulty, difficulty_score);
    const article = await db.get('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?', result.lastInsertRowid);
    res.json(article);
  } catch (e) {
    res.status(500).json({ error: '创建文章失败: ' + e.message });
  }
});

app.put('/api/articles/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, category_id, difficulty_override } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: '标题不能超过200字符' });
    }
    if (content.length > 50000) {
      return res.status(400).json({ error: '内容不能超过50000字符' });
    }
    const existing = await db.get('SELECT * FROM articles WHERE id = ?', req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '文章不存在' });
    }
    const autoResult = calculateDifficulty(content);
    const finalDifficulty = (difficulty_override >= 1 && difficulty_override <= 3) ? difficulty_override : autoResult.difficulty;
    const finalScore = autoResult.difficulty_score;
    const nl = nowLocaltime(db);
    await db.run(`UPDATE articles SET title = ?, content = ?, category_id = ?, difficulty = ?, difficulty_score = ?, updated_at = ${nl} WHERE id = ?`, title, content, category_id || existing.category_id, finalDifficulty, finalScore, req.params.id);
    const article = await db.get('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?', req.params.id);
    res.json(article);
  } catch (e) {
    res.status(500).json({ error: '更新文章失败: ' + e.message });
  }
});

app.delete('/api/articles/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.transaction(async (tdb) => {
      await tdb.run('DELETE FROM articles WHERE id = ?', req.params.id);
      await tdb.run('DELETE FROM scores WHERE article_id = ?', req.params.id);
    })();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除文章失败: ' + e.message });
  }
});

app.post('/api/articles/submit', authMiddleware, async (req, res) => {
  try {
    const { title, content, category_id } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: '标题不能超过200字符' });
    }
    if (content.length > 50000) {
      return res.status(400).json({ error: '内容不能超过50000字符' });
    }
    const sensitiveTitle = await containsSensitiveWord(title);
    if (sensitiveTitle) {
      return res.status(400).json({ error: '标题包含敏感词: ' + sensitiveTitle });
    }
    const sensitiveContent = await containsSensitiveWord(content);
    if (sensitiveContent) {
      return res.status(400).json({ error: '内容包含敏感词: ' + sensitiveContent });
    }
    const { difficulty, difficulty_score } = calculateDifficulty(content);
    const result = await db.run('INSERT INTO articles (title, content, category_id, source, status, author_id, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', title, content, category_id || null, '', 'pending', req.user.id, difficulty, difficulty_score);
    res.json({ id: result.lastInsertRowid, title, status: 'pending' });
  } catch (e) {
    res.status(500).json({ error: '提交文章失败: ' + e.message });
  }
});

app.get('/api/articles/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const articles = await db.all("SELECT a.*, c.name as category_name, u.username as author_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN users u ON a.author_id = u.id WHERE a.status = 'pending' ORDER BY a.id DESC");
    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取待审核文章失败' });
  }
});

app.put('/api/articles/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, review_msg } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '状态必须为 approved 或 rejected' });
    }
    await db.run('UPDATE articles SET status = ?, review_msg = ? WHERE id = ?', status, review_msg || '', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '审核文章失败: ' + e.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const articleId = req.query.article_id;
    const period = req.query.period || 'all';
    const categoryId = req.query.category_id;
    const guest = req.query.guest === 'true';

    let whereClauses = [];
    let params = [];

    if (articleId) {
      whereClauses.push('s.article_id = ?');
      params.push(articleId);
    }

    if (period === 'today') {
      whereClauses.push(`${dateFn('s.created_at', db)} = ${curDate(db)}`);
    } else if (period === 'week') {
      whereClauses.push(`s.created_at >= ${daysAgo(7, db)}`);
    }

    if (categoryId) {
      whereClauses.push('a.category_id = ?');
      params.push(categoryId);
    }

    if (guest) {
      whereClauses.push('s.user_id IS NULL');
    } else {
      const allowGuestRow = await db.get("SELECT value FROM settings WHERE `key` = 'allow_guest_leaderboard'");
      if (!allowGuestRow || allowGuestRow.value !== 'true') {
        whereClauses.push('s.user_id IS NOT NULL');
      }
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const scores = await db.all(
      `SELECT s.*, a.title as article_title, u.avatar, u.nickname FROM scores s LEFT JOIN articles a ON s.article_id = a.id LEFT JOIN users u ON s.user_id = u.id ${whereStr} ORDER BY s.speed DESC, s.accuracy DESC LIMIT 500`,
      ...params
    );

    scores.forEach(s => {
      if (s.avatar) s.avatar = '/avatars/' + s.avatar;
    });

    res.json(scores);
  } catch (e) {
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

app.post('/api/leaderboard', async (req, res) => {
  try {
    const { nickname, speed, accuracy, time_seconds, article_id, source } = req.body;
    if (!nickname || speed === undefined || accuracy === undefined) {
      return res.status(400).json({ error: '昵称、速度和准确率不能为空' });
    }
    if (typeof speed !== 'number' || speed < 0 || speed > 1000) {
      return res.status(400).json({ error: '速度数据异常' });
    }
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100) {
      return res.status(400).json({ error: '准确率数据异常' });
    }
    if (time_seconds !== undefined && (typeof time_seconds !== 'number' || time_seconds < 0 || time_seconds > 86400)) {
      return res.status(400).json({ error: '时长数据异常' });
    }

    const sensitiveWord = await containsSensitiveWord(nickname);
    if (sensitiveWord) {
      return res.status(400).json({ error: '昵称包含敏感词: ' + sensitiveWord });
    }

    const auth = req.headers.authorization;
    let userId = null;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        userId = decoded.id;
      } catch (e) {}
    }
    const ip = req.ip || req.connection.remoteAddress || '';
    const result = await db.run('INSERT INTO scores (user_id, nickname, speed, accuracy, time_seconds, article_id, ip_address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', userId, nickname, speed, accuracy, time_seconds || 0, article_id || null, ip, source || 'normal');
    const score = await db.get('SELECT s.*, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.id = ?', result.lastInsertRowid);
    res.json(score);
  } catch (e) {
    res.status(500).json({ error: '提交成绩失败: ' + e.message });
  }
});

app.delete('/api/leaderboard/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM scores WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除成绩失败' });
  }
});

app.delete('/api/leaderboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM scores');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '清空排行榜失败' });
  }
});

app.get('/api/my-scores', authMiddleware, async (req, res) => {
  try {
    const scores = await db.all('SELECT s.*, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.user_id = ? ORDER BY s.created_at DESC', req.user.id);
    res.json(scores);
  } catch (e) {
    res.status(500).json({ error: '获取成绩失败' });
  }
});

app.post('/api/crawl', authMiddleware, adminMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: '请输入URL' });
  }
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'URL必须以http://或https://开头' });
  }
  const crawlerPath = path.join(__dirname, 'crawler.py');
  if (!fs.existsSync(crawlerPath)) {
    return res.status(500).json({ error: '爬虫脚本不存在，请确保 crawler.py 已放置在项目根目录' });
  }
  execFile('python', [crawlerPath, '--url', url, '--preview'], { timeout: 30000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf-8' }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: '爬虫执行失败: ' + (stderr || error.message) });
    }
    try {
      const result = JSON.parse(stdout.trim());
      result._source_url = url;
      res.json(result);
    } catch (e) {
      res.json({ title: '', content: stdout.trim(), _source_url: url });
    }
  });
});

app.post('/api/crawl/save', authMiddleware, adminMiddleware, async (req, res) => {
  const { title, content, category_id, source } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  if (!category_id) {
    return res.status(400).json({ error: '请选择分类' });
  }
  try {
    const sensitiveTitle = await containsSensitiveWord(title.trim());
    if (sensitiveTitle) {
      return res.status(400).json({ error: '标题包含敏感词: ' + sensitiveTitle });
    }
    const sensitiveContent = await containsSensitiveWord(content.trim());
    if (sensitiveContent) {
      return res.status(400).json({ error: '内容包含敏感词: ' + sensitiveContent });
    }
    const { difficulty, difficulty_score } = calculateDifficulty(content.trim());
    const result = await db.run(
      'INSERT INTO articles (title, content, category_id, source, status, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?)',
      title.trim(), content.trim(), category_id, source || '', 'approved', difficulty, difficulty_score
    );
    const article = await db.get(
      'SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?',
      result.lastInsertRowid
    );
    res.json({ id: result.lastInsertRowid, category_name: article ? article.category_name : '', saved: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败: ' + e.message });
  }
});

app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, nickname, avatar, email, role, created_at FROM users WHERE id = ?', req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    let maskedEmail = user.email || '';
    if (maskedEmail && maskedEmail.includes('@')) {
      const parts = maskedEmail.split('@');
      const local = parts[0];
      const domain = parts[1];
      if (local.length > 2) {
        maskedEmail = local[0] + '***' + local[local.length - 1] + '@' + domain;
      }
    }
    res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar ? '/avatars/' + user.avatar : '',
      email: maskedEmail,
      role: user.role,
      created_at: user.created_at
    });
  } catch (e) {
    res.status(500).json({ error: '获取个人资料失败' });
  }
});

app.put('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length === 0) {
      return res.status(400).json({ error: '昵称不能为空' });
    }
    if (nickname.length > 30) {
      return res.status(400).json({ error: '昵称最长30字符' });
    }
    await db.run('UPDATE users SET nickname = ? WHERE id = ?', nickname.trim(), req.user.id);
    res.json({ success: true, nickname: nickname.trim() });
  } catch (e) {
    res.status(500).json({ error: '更新昵称失败' });
  }
});

app.post('/api/user/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    try {
      const oldUser = await db.get('SELECT avatar FROM users WHERE id = ?', req.user.id);
      if (oldUser && oldUser.avatar) {
        const oldPath = path.join(avatarDir, oldUser.avatar);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch(e) {}
        }
      }
      await db.run('UPDATE users SET avatar = ? WHERE id = ?', req.file.filename, req.user.id);
      res.json({ success: true, avatar: '/avatars/' + req.file.filename });
    } catch (e) {
      res.status(500).json({ error: '上传头像失败' });
    }
  });
});

app.put('/api/user/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '修改密码失败' });
  }
});

app.get('/api/user/history', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const total = (await db.get('SELECT COUNT(*) as count FROM scores WHERE user_id = ?', req.user.id)).count;
    const scores = await db.all(
      'SELECT s.id, s.speed, s.accuracy, s.time_seconds, s.created_at, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ? OFFSET ?',
      req.user.id, limit, offset
    );

    res.json({
      scores,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

app.get('/api/user/stats', authMiddleware, async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days) || 30);

    const totalPractices = (await db.get('SELECT COUNT(*) as count FROM scores WHERE user_id = ?', req.user.id)).count;
    const keystrokeRow = await db.get('SELECT COALESCE(SUM(time_seconds * speed / 60), 0) as total FROM scores WHERE user_id = ?', req.user.id);
    const totalKeystrokes = Math.round(keystrokeRow.total);
    const timeRow = await db.get('SELECT COALESCE(SUM(time_seconds), 0) as total FROM scores WHERE user_id = ?', req.user.id);
    const totalTimeSeconds = timeRow.total;

    const df = dateFn('created_at', db);
    const da = daysAgo(days, db);
    const dailyStats = await db.all(
      `SELECT ${df} as date, AVG(speed) as avgSpeed, AVG(accuracy) as avgAccuracy FROM scores WHERE user_id = ? AND created_at >= ${da} GROUP BY ${df} ORDER BY date DESC`,
      req.user.id, days
    );

    res.json({
      totalPractices,
      totalKeystrokes,
      totalTimeSeconds,
      dailyStats
    });
  } catch (e) {
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

app.get('/api/user/error-log', authMiddleware, async (req, res) => {
  try {
    const errors = await db.all(
      'SELECT expected_char, typed_char, COUNT(*) as count FROM error_logs WHERE user_id = ? GROUP BY expected_char, typed_char ORDER BY count DESC',
      req.user.id
    );
    res.json(errors);
  } catch (e) {
    res.status(500).json({ error: '获取错字记录失败' });
  }
});

app.post('/api/user/error-log', authMiddleware, async (req, res) => {
  try {
    const { article_id, errors } = req.body;
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ error: 'errors数组不能为空' });
    }
    await db.transaction(async (tdb) => {
      for (const item of errors) {
        await tdb.run('INSERT INTO error_logs (user_id, article_id, expected_char, typed_char) VALUES (?, ?, ?, ?)', req.user.id, article_id || null, item.expected_char, item.typed_char);
      }
    })();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '保存错字记录失败' });
  }
});

app.post('/api/user/generate-error-practice', authMiddleware, async (req, res) => {
  try {
    const topErrors = await db.all(
      'SELECT expected_char, COUNT(*) as count FROM error_logs WHERE user_id = ? GROUP BY expected_char ORDER BY count DESC LIMIT 10',
      req.user.id
    );

    if (topErrors.length === 0) {
      return res.status(400).json({ error: '暂无错字记录，无法生成练习' });
    }

    const errorChars = topErrors.map(e => e.expected_char);
    const normalChars = '的一是不了人我在有他这为之大来以个中上们到说时地也子就道会那要下看天有';
    const parts = [];
    for (const ch of errorChars) {
      for (let i = 0; i < 5; i++) {
        parts.push(ch);
        const normalIdx = Math.floor(Math.random() * normalChars.length);
        parts.push(normalChars[normalIdx]);
      }
    }
    const content = parts.join('');
    res.json({ title: '错字专项练习', content });
  } catch (e) {
    res.status(500).json({ error: '生成练习失败' });
  }
});

app.get('/api/user/private-articles', authMiddleware, async (req, res) => {
  try {
    const articles = await db.all('SELECT * FROM private_articles WHERE user_id = ? ORDER BY created_at DESC', req.user.id);
    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取私人文章失败' });
  }
});

app.post('/api/user/private-articles', authMiddleware, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    const result = await db.run('INSERT INTO private_articles (user_id, title, content) VALUES (?, ?, ?)', req.user.id, title, content);
    const article = await db.get('SELECT * FROM private_articles WHERE id = ?', result.lastInsertRowid);
    res.json(article);
  } catch (e) {
    res.status(500).json({ error: '创建私人文章失败' });
  }
});

app.post('/api/user/private-articles/upload', authMiddleware, (req, res) => {
  txtUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    try {
      const content = req.file.buffer.toString('utf-8');
      const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
      const result = await db.run('INSERT INTO private_articles (user_id, title, content) VALUES (?, ?, ?)', req.user.id, title, content);
      const article = await db.get('SELECT * FROM private_articles WHERE id = ?', result.lastInsertRowid);
      res.json(article);
    } catch (e) {
      res.status(500).json({ error: '上传文章失败' });
    }
  });
});

app.delete('/api/user/private-articles/:id', authMiddleware, async (req, res) => {
  try {
    const article = await db.get('SELECT * FROM private_articles WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!article) {
      return res.status(404).json({ error: '文章不存在或不属于当前用户' });
    }
    await db.run('DELETE FROM private_articles WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除私人文章失败' });
  }
});

app.get('/api/user/submitted-articles', authMiddleware, async (req, res) => {
  try {
    const articles = await db.all('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.author_id = ? ORDER BY a.id DESC', req.user.id);
    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取提交文章失败' });
  }
});

app.get('/api/announcement', async (req, res) => {
  try {
    res.json(await getActiveAnnouncement());
  } catch (e) {
    res.status(500).json({ error: '获取公告失败' });
  }
});

app.get('/api/admin/announcements', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM announcements ORDER BY ${coalesceEmptyDesc('created_at', db)} DESC, id DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '公告列表加载失败: ' + e.message });
  }
});

app.post('/api/admin/announcements', authMiddleware, adminMiddleware, async (req, res) => {
  const { title, content, level, is_active, allow_close, start_time, end_time } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '公告内容不能为空' });
  }
  const validLevels = ['notification', 'site-wide', 'warning'];
  const lvl = validLevels.includes(level) ? level : 'notification';
  try {
    const nl = nowLocaltime(db);
    const result = await db.run(
      `INSERT INTO announcements (title, content, level, is_active, allow_close, start_time, end_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${nl}, ${nl})`,
      title || '', content.trim(), lvl,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      allow_close !== undefined ? (allow_close ? 1 : 0) : 1,
      normalizeDateTimeInput(start_time), normalizeDateTimeInput(end_time)
    );
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    res.status(500).json({ error: '公告保存失败: ' + e.message });
  }
});

app.put('/api/admin/announcements/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { title, content, level, is_active, allow_close, start_time, end_time } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '公告内容不能为空' });
  }
  const validLevels = ['notification', 'site-wide', 'warning'];
  const lvl = validLevels.includes(level) ? level : 'notification';
  try {
    const nl = nowLocaltime(db);
    await db.run(
      `UPDATE announcements SET title = ?, content = ?, level = ?, is_active = ?, allow_close = ?, start_time = ?, end_time = ?, updated_at = ${nl} WHERE id = ?`,
      title || '', content.trim(), lvl,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      allow_close !== undefined ? (allow_close ? 1 : 0) : 1,
      normalizeDateTimeInput(start_time), normalizeDateTimeInput(end_time),
      req.params.id
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '公告更新失败: ' + e.message });
  }
});

app.delete('/api/admin/announcements/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run('DELETE FROM announcements WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除公告失败' });
  }
});

app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalUsers = (await db.get('SELECT COUNT(*) as count FROM users')).count;
    const cd = curDate(db);
    const df = dateFn('created_at', db);
    const todayPractices = (await db.get(`SELECT COUNT(*) as count FROM scores WHERE ${df} = ${cd}`)).count;
    const todayNewScores = todayPractices;
    const totalArticles = (await db.get('SELECT COUNT(*) as count FROM articles')).count;
    const pendingArticles = (await db.get("SELECT COUNT(*) as count FROM articles WHERE status = 'pending'")).count;
    const da7 = daysAgo(7, db);
    const weeklyUsers = await db.all(
      `SELECT ${df} as date, COUNT(*) as count FROM users WHERE created_at >= ${da7} GROUP BY ${df} ORDER BY date DESC`
    );

    res.json({
      totalUsers,
      todayPractices,
      todayNewScores,
      totalArticles,
      pendingArticles,
      weeklyUsers
    });
  } catch (e) {
    res.status(500).json({ error: '获取仪表盘数据失败' });
  }
});

app.get('/api/admin/sensitive-words', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const row = await db.get("SELECT value FROM settings WHERE `key` = 'sensitive_words'");
    const words = row && row.value ? row.value.split(',').map(w => w.trim()).filter(w => w) : [];
    res.json({ words });
  } catch (e) {
    res.status(500).json({ error: '获取敏感词失败' });
  }
});

app.put('/api/admin/sensitive-words', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'words必须为数组' });
    }
    const value = words.join(',');
    await db.run("UPDATE settings SET value = ? WHERE `key` = 'sensitive_words'", value);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '更新敏感词失败' });
  }
});

const ALLOWED_TABLES = ['users', 'articles', 'categories', 'scores', 'announcements', 'settings', 'error_logs', 'private_articles'];

async function assertDatabaseTable(table) {
  if (!table || !ALLOWED_TABLES.includes(table)) {
    return null;
  }
  const tables = await db.getTables();
  return tables.includes(table) ? table : null;
}

function getInsertDefaultValue(table, column) {
  if (/created_at|updated_at/i.test(column.name)) return { sql: nowLocaltime(db) };
  if (table === 'announcements') {
    if (column.name === 'content') return { value: '新公告内容' };
    if (column.name === 'title') return { value: '新公告' };
    if (column.name === 'level') return { value: 'notification' };
    if (column.name === 'is_active') return { value: 1 };
    if (column.name === 'allow_close') return { value: 1 };
  }
  if (table === 'categories' && column.name === 'name') return { value: '新分类' + Date.now() };
  if (table === 'articles') {
    if (column.name === 'title') return { value: '新文章' };
    if (column.name === 'content') return { value: '新文章内容' };
    if (column.name === 'status') return { value: 'approved' };
    if (column.name === 'difficulty') return { value: 1 };
    if (column.name === 'difficulty_score') return { value: 0 };
  }
  if (table === 'settings' && column.name === 'key') return { value: 'new_setting_' + Date.now() };
  if (table === 'settings' && column.name === 'value') return { value: '' };
  if (column.notnull === 1 && column.dflt_value === null) {
    const type = String(column.type || '').toUpperCase();
    if (type.includes('INT') || type.includes('REAL') || type.includes('NUM') || type.includes('DOUBLE')) return { value: 0 };
    return { value: '' };
  }
  return null;
}

app.get('/api/admin/db/tables', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tableNames = await db.getTables();
    const tables = [];
    for (const name of tableNames) {
      const count = (await db.get(`SELECT COUNT(*) as count FROM ${name}`)).count;
      const columns = (await db.getColumns(name)).map(column => ({
        name: column.name,
        type: column.type,
        pk: column.pk === 1,
        notnull: column.notnull === 1,
        defaultValue: column.dflt_value
      }));
      const pk = await db.getPrimaryKey(name);
      tables.push({ name, count, columns, primaryKey: pk });
    }
    res.json(tables);
  } catch (e) {
    res.status(500).json({ error: '获取数据表列表失败: ' + e.message });
  }
});

app.get('/api/admin/db/:table', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await assertDatabaseTable(req.params.table);
    if (!table) {
      return res.status(404).json({ error: '数据表不存在' });
    }

    const columns = await db.getColumns(table);
    const columnNames = columns.map(column => column.name);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    let where = '';
    let params = [];

    if (search) {
      const searchableColumns = columnNames.filter(name => !/password|hash|token|secret/i.test(name));
      if (searchableColumns.length > 0) {
        where = 'WHERE ' + searchableColumns.map(name => `\`${name}\` LIKE ?`).join(' OR ');
        params = searchableColumns.map(() => '%' + search + '%');
      }
    }

    const total = (await db.get(`SELECT COUNT(*) as count FROM ${table} ${where}`, ...params)).count;
    const pk = await db.getPrimaryKey(table);
    const orderBy = pk ? `${pk} DESC` : (isMySQL(db) ? '1 DESC' : 'rowid DESC');
    const rows = await db.all(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, ...params, limit, offset);

    res.json({
      table,
      columns: columns.map(column => ({
        name: column.name,
        type: column.type,
        pk: column.pk === 1,
        notnull: column.notnull === 1,
        defaultValue: column.dflt_value
      })),
      primaryKey: pk,
      rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (e) {
    res.status(500).json({ error: '查询数据表失败: ' + e.message });
  }
});

app.post('/api/admin/db/:table', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await assertDatabaseTable(req.params.table);
    if (!table) {
      return res.status(404).json({ error: '数据表不存在' });
    }

    const columns = await db.getColumns(table);
    const pk = await db.getPrimaryKey(table);
    const body = req.body || {};
    const insertColumns = [];
    const placeholders = [];
    const params = [];

    columns.forEach(column => {
      if (column.name === pk) return;
      if (Object.prototype.hasOwnProperty.call(body, column.name)) {
        insertColumns.push(column.name);
        placeholders.push('?');
        params.push(parseDatabaseValue(body[column.name]));
        return;
      }
      const defaultValue = getInsertDefaultValue(table, column);
      if (!defaultValue) return;
      insertColumns.push(column.name);
      if (Object.prototype.hasOwnProperty.call(defaultValue, 'sql')) {
        placeholders.push(defaultValue.sql);
      } else {
        placeholders.push('?');
        params.push(defaultValue.value);
      }
    });

    let result;
    if (insertColumns.length === 0) {
      if (isMySQL(db)) {
        result = await db.run(`INSERT INTO ${table} () VALUES ()`);
      } else {
        result = await db.run(`INSERT INTO ${table} DEFAULT VALUES`);
      }
    } else {
      result = await db.run(`INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`, ...params);
    }
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: '新增记录失败: ' + e.message });
  }
});

app.put('/api/admin/db/:table/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await assertDatabaseTable(req.params.table);
    if (!table) {
      return res.status(404).json({ error: '数据表不存在' });
    }
    const pk = await db.getPrimaryKey(table);
    if (!pk) {
      return res.status(400).json({ error: '该表没有主键，暂不支持网页编辑' });
    }
    const columns = await db.getColumns(table);
    const editableColumns = columns.filter(column => column.name !== pk).map(column => column.name);
    const body = req.body || {};
    const updates = [];
    const params = [];

    editableColumns.forEach(column => {
      if (Object.prototype.hasOwnProperty.call(body, column)) {
        updates.push(`${column} = ?`);
        const value = body[column];
        params.push(parseDatabaseValue(value));
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有可更新的字段' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${pk} = ?`, ...params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '更新记录失败: ' + e.message });
  }
});

app.delete('/api/admin/db/:table/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await assertDatabaseTable(req.params.table);
    if (!table) {
      return res.status(404).json({ error: '数据表不存在' });
    }
    const pk = await db.getPrimaryKey(table);
    if (!pk) {
      return res.status(400).json({ error: '该表没有主键，暂不支持网页删除' });
    }
    await db.run(`DELETE FROM ${table} WHERE ${pk} = ?`, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除记录失败: ' + e.message });
  }
});

app.get('/api/admin/db-config', authMiddleware, adminMiddleware, (req, res) => {
  const config = loadConfig();
  const safeConfig = {
    type: config.type,
    sqlite: { path: config.sqlite.path },
    mysql: {
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password ? '••••••' : '',
      database: config.mysql.database,
      charset: config.mysql.charset
    }
  };
  res.json(safeConfig);
});

app.put('/api/admin/db-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, mysql } = req.body;
    if (!['sqlite', 'mysql'].includes(type)) {
      return res.status(400).json({ error: '数据库类型必须为 sqlite 或 mysql' });
    }

    const config = loadConfig();
    config.type = type;

    if (type === 'mysql' && mysql) {
      if (!mysql.host || !mysql.database) {
        return res.status(400).json({ error: 'MySQL 主机和数据库名不能为空' });
      }
      config.mysql.host = mysql.host;
      config.mysql.port = parseInt(mysql.port) || 3306;
      config.mysql.user = mysql.user || 'root';
      if (mysql.password && mysql.password !== '••••••') {
        config.mysql.password = mysql.password;
      }
      config.mysql.database = mysql.database;
      config.mysql.charset = mysql.charset || 'utf8mb4';

      try {
        const testDb = await createDatabase({ type: 'mysql', mysql: config.mysql });
        await testDb.get('SELECT 1 as test');
        await testDb.close();
      } catch (e) {
        return res.status(400).json({ error: 'MySQL 连接测试失败: ' + e.message });
      }
    }

    saveConfig(config);
    res.json({ success: true, message: '数据库配置已保存，请重启服务器使配置生效。', needsRestart: true });
  } catch (e) {
    res.status(500).json({ error: '保存数据库配置失败: ' + e.message });
  }
});

app.post('/api/admin/db-config/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, mysql } = req.body;
    if (type === 'sqlite') {
      res.json({ success: true, message: 'SQLite 无需测试连接' });
      return;
    }
    if (!mysql || !mysql.host || !mysql.database) {
      return res.status(400).json({ error: 'MySQL 主机和数据库名不能为空' });
    }
    const testDb = await createDatabase({
      type: 'mysql',
      mysql: {
        host: mysql.host,
        port: parseInt(mysql.port) || 3306,
        user: mysql.user || 'root',
        password: mysql.password || '',
        database: mysql.database,
        charset: mysql.charset || 'utf8mb4'
      }
    });
    await testDb.get('SELECT 1 as test');
    await testDb.close();
    res.json({ success: true, message: 'MySQL 连接成功' });
  } catch (e) {
    res.status(400).json({ error: 'MySQL 连接失败: ' + e.message });
  }
});

const versionPath = path.join(__dirname, 'version.json');
let versionInfo = { version: '', name: 'Typing', fullName: 'Typing' };
try {
  const versionRaw = fs.readFileSync(versionPath, 'utf8');
  versionInfo = JSON.parse(versionRaw);
} catch (e) {
  console.warn('version.json not found or invalid');
}

app.get('/api/version', (req, res) => {
  res.json(versionInfo);
});

initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`打字练习服务器已启动 [${versionInfo.fullName}]：`);
    console.log(`  本机访问: http://localhost:${PORT}`);
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  局域网访问: http://${net.address}:${PORT}`);
        }
      }
    }
    if (await hasAdminUser()) {
      console.log('  管理员账户: 已配置');
    } else {
      console.log('  管理员账户: 首次启动请在页面中创建');
    }
    console.log(`  数据库类型: ${currentConfig.type === 'mysql' ? 'MySQL' : 'SQLite'}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
