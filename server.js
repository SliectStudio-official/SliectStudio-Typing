const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { execFile } = require('child_process');

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'typing-practice-jwt-secret-key-2026');
if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
if (!process.env.JWT_SECRET && !isProduction) {
  console.warn('JWT_SECRET is not set, using fallback secret for local development only.');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.join(__dirname, 'data', 'typing.db');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const avatarDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = req.user.id + '_' + Date.now() + ext;
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category_id INTEGER,
    source TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    nickname TEXT NOT NULL,
    speed REAL NOT NULL,
    accuracy REAL NOT NULL,
    time_seconds INTEGER NOT NULL,
    article_id INTEGER,
    ip_address TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    article_id INTEGER,
    expected_char TEXT NOT NULL,
    typed_char TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS private_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'notification',
    is_active INTEGER DEFAULT 1,
    allow_close INTEGER DEFAULT 1,
    start_time TEXT,
    end_time TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

try { db.exec('ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ""'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ""'); } catch(e) {}
try { db.exec("ALTER TABLE articles ADD COLUMN status TEXT DEFAULT 'approved'"); } catch(e) {}
try { db.exec('ALTER TABLE articles ADD COLUMN author_id INTEGER'); } catch(e) {}
try { db.exec("ALTER TABLE articles ADD COLUMN review_msg TEXT DEFAULT ''"); } catch(e) {}
try { db.exec('ALTER TABLE articles ADD COLUMN difficulty INTEGER DEFAULT 1'); } catch(e) {}
try { db.exec('ALTER TABLE articles ADD COLUMN difficulty_score REAL DEFAULT 0'); } catch(e) {}
try { db.exec("ALTER TABLE articles ADD COLUMN updated_at TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE announcements ADD COLUMN title TEXT NOT NULL DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE announcements ADD COLUMN level TEXT NOT NULL DEFAULT 'notification'"); } catch(e) {}
try { db.exec('ALTER TABLE announcements ADD COLUMN is_active INTEGER DEFAULT 1'); } catch(e) {}
try { db.exec('ALTER TABLE announcements ADD COLUMN allow_close INTEGER DEFAULT 1'); } catch(e) {}
try { db.exec('ALTER TABLE announcements ADD COLUMN start_time TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE announcements ADD COLUMN end_time TEXT'); } catch(e) {}
try { db.exec("ALTER TABLE announcements ADD COLUMN created_at TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("ALTER TABLE announcements ADD COLUMN updated_at TEXT DEFAULT ''"); } catch(e) {}
try { db.exec("UPDATE announcements SET created_at = datetime('now', 'localtime') WHERE created_at IS NULL OR created_at = ''"); } catch(e) {}
try { db.exec("ALTER TABLE scores ADD COLUMN source TEXT DEFAULT 'normal'"); } catch(e) {}

const settingCount = db.prepare("SELECT COUNT(*) as count FROM settings WHERE key = 'sensitive_words'").get();
if (settingCount.count === 0) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('sensitive_words', '')").run();
}
const guestSettingCount = db.prepare("SELECT COUNT(*) as count FROM settings WHERE key = 'allow_guest_leaderboard'").get();
if (guestSettingCount.count === 0) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('allow_guest_leaderboard', 'true')").run();
}

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const bsRow = db.prepare("SELECT value FROM settings WHERE key = 'needs_bootstrap'").get();
  if (!bsRow) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('needs_bootstrap', 'true')").run();
  }
}
const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (catCount.count === 0) {
  db.prepare("INSERT INTO categories (name) VALUES (?)").run('散文');
  db.prepare("INSERT INTO categories (name) VALUES (?)").run('英文');
  db.prepare("INSERT INTO categories (name) VALUES (?)").run('代码');
  db.prepare("INSERT INTO categories (name) VALUES (?)").run('新闻');

  const proseCat = db.prepare("SELECT id FROM categories WHERE name = '散文'").get();
  const englishCat = db.prepare("SELECT id FROM categories WHERE name = '英文'").get();

  db.prepare('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)').run(
    '经典诗词',
    '床前明月光，疑是地上霜。举头望明月，低头思故乡。春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。白日依山尽，黄河入海流。欲穷千里目，更上一层楼。',
    proseCat.id, '默认'
  );
  db.prepare('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)').run(
    '英文短文',
    'The quick brown fox jumps over the lazy dog. Practice makes perfect. Every day is a new opportunity to learn and grow. Keep typing and you will improve your speed and accuracy over time. The journey of a thousand miles begins with a single step.',
    englishCat.id, '默认'
  );
}

function hasAdminUser() {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  return row.count > 0;
}

app.get('/api/bootstrap/status', (req, res) => {
  const needsBootstrap = !hasAdminUser();
  res.json({ needsBootstrap });
});

app.post('/api/bootstrap/create-admin', (req, res) => {
  if (hasAdminUser()) {
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
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, email, password_hash, role, nickname) VALUES (?, ?, ?, ?, ?)').run(username, email || null, hash, 'admin', username);
  db.prepare("UPDATE settings SET value = 'false' WHERE key = 'needs_bootstrap'").run();
  const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: result.lastInsertRowid, username, nickname: username, email: email || '', role: 'admin' } });
});

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

function calculateDifficulty(content) {
  const charCount = content.length;
  const punctuationCount = (content.match(/[，。！？、；：""''《》（）\[\]{},.!?;:'"()<>\/\\@#$%^&*+=~`]/g) || []).length;
  const specialCount = (content.match(/[0-9@#$%^&*+=~`\/\\<>]/g) || []).length;
  const chineseCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const score = (charCount / 100) * 0.3 + (punctuationCount / Math.max(1, charCount)) * 30 + (specialCount / Math.max(1, charCount)) * 40 + (chineseCount / Math.max(1, charCount)) * 5;
  const difficulty = score < 15 ? 1 : score < 30 ? 2 : 3;
  return { difficulty, difficulty_score: score };
}

function containsSensitiveWord(text) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'sensitive_words'").get();
  if (!row || !row.value) return null;
  const words = row.value.split(',').map(w => w.trim()).filter(w => w);
  for (const word of words) {
    if (word && text.includes(word)) return word;
  }
  return null;
}

app.post('/api/auth/register', (req, res) => {
  const bootstrapRow = db.prepare("SELECT value FROM settings WHERE key = 'needs_bootstrap'").get();
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
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  if (email) {
    const emailExisting = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (emailExisting) {
      return res.status(400).json({ error: '邮箱已被注册' });
    }
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(username, email || null, hash, 'user');
  const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: result.lastInsertRowid, username, nickname: username, email: email || '', role: 'user' } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname || user.username, email: user.email || '', role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, role, created_at, nickname, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ ...user, avatar: user.avatar ? '/avatars/' + user.avatar : '' });
});

app.put('/api/auth/me', authMiddleware, (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

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
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
      if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      db.prepare('UPDATE users SET username = ?, email = ?, password_hash = ? WHERE id = ?').run(username, email || user.email, newHash, user.id);
      const token = jwt.sign({ id: user.id, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username, nickname: username, email: email || user.email || '', role: user.role } });
      return;
    }
    db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(email || user.email, newHash, user.id);
    res.json({ success: true });
    return;
  }

  if (username && username !== user.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(username, email || user.email, user.id);
    const token = jwt.sign({ id: user.id, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username, nickname: username, email: email || user.email || '', role: user.role } });
    return;
  }

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || user.email, user.id);
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, email, role, created_at, nickname FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { username, email, password, role } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (username && username !== user.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
  }
  const updates = [];
  const params = [];
  if (username) { updates.push('username = ?'); params.push(username); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (role) { updates.push('role = ?'); params.push(role); }
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
  db.prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ error: '不能删除唯一的管理员账户' });
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY id').all();
  res.json(cats);
});

app.post('/api/categories', authMiddleware, adminMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) {
    return res.status(400).json({ error: '分类已存在' });
  }
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.json({ id: result.lastInsertRowid, name });
});

app.put('/api/categories/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: '分类名称不能为空' });
  }
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true });
});

app.delete('/api/categories/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/articles', (req, res) => {
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
  const articles = db.prepare(
    `SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id ${whereStr} ORDER BY a.id DESC`
  ).all(...params);

  res.json(articles);
});

app.post('/api/articles', authMiddleware, adminMiddleware, (req, res) => {
  const { title, content, category_id, source } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  if (!category_id) {
    return res.status(400).json({ error: '请选择分类' });
  }
  const { difficulty, difficulty_score } = calculateDifficulty(content);
  const result = db.prepare('INSERT INTO articles (title, content, category_id, source, status, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, content, category_id, source || '', 'approved', difficulty, difficulty_score);
  const article = db.prepare('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?').get(result.lastInsertRowid);
  res.json(article);
});

app.put('/api/articles/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { title, content, category_id, difficulty_override } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  const existing = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '文章不存在' });
  }
  const autoResult = calculateDifficulty(content);
  const finalDifficulty = (difficulty_override >= 1 && difficulty_override <= 3) ? difficulty_override : autoResult.difficulty;
  const finalScore = (difficulty_override >= 1 && difficulty_override <= 3) ? autoResult.difficulty_score : autoResult.difficulty_score;
  db.prepare('UPDATE articles SET title = ?, content = ?, category_id = ?, difficulty = ?, difficulty_score = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(title, content, category_id || existing.category_id, finalDifficulty, finalScore, req.params.id);
  const article = db.prepare('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?').get(req.params.id);
  res.json(article);
});

app.delete('/api/articles/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM scores WHERE article_id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/articles/submit', authMiddleware, (req, res) => {
  const { title, content, category_id } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  const sensitiveTitle = containsSensitiveWord(title);
  if (sensitiveTitle) {
    return res.status(400).json({ error: '标题包含敏感词: ' + sensitiveTitle });
  }
  const sensitiveContent = containsSensitiveWord(content);
  if (sensitiveContent) {
    return res.status(400).json({ error: '内容包含敏感词: ' + sensitiveContent });
  }
  const { difficulty, difficulty_score } = calculateDifficulty(content);
  const result = db.prepare('INSERT INTO articles (title, content, category_id, source, status, author_id, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(title, content, category_id || null, '', 'pending', req.user.id, difficulty, difficulty_score);
  res.json({ id: result.lastInsertRowid, title, status: 'pending' });
});

app.get('/api/articles/pending', authMiddleware, adminMiddleware, (req, res) => {
  const articles = db.prepare("SELECT a.*, c.name as category_name, u.username as author_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN users u ON a.author_id = u.id WHERE a.status = 'pending' ORDER BY a.id DESC").all();
  res.json(articles);
});

app.put('/api/articles/:id/review', authMiddleware, adminMiddleware, (req, res) => {
  const { status, review_msg } = req.body;
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '状态必须为 approved 或 rejected' });
  }
  db.prepare('UPDATE articles SET status = ?, review_msg = ? WHERE id = ?').run(status, review_msg || '', req.params.id);
  res.json({ success: true });
});

app.get('/api/leaderboard', (req, res) => {
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
    whereClauses.push("date(s.created_at) = date('now', 'localtime')");
  } else if (period === 'week') {
    whereClauses.push("s.created_at >= datetime('now', 'localtime', '-7 days')");
  }

  if (categoryId) {
    whereClauses.push('a.category_id = ?');
    params.push(categoryId);
  }

  if (guest) {
    whereClauses.push('s.user_id IS NULL');
  } else {
    const allowGuestRow = db.prepare("SELECT value FROM settings WHERE key = 'allow_guest_leaderboard'").get();
    if (!allowGuestRow || allowGuestRow.value !== 'true') {
      whereClauses.push('s.user_id IS NOT NULL');
    }
  }

  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
  const scores = db.prepare(
    `SELECT s.*, a.title as article_title, u.avatar, u.nickname FROM scores s LEFT JOIN articles a ON s.article_id = a.id LEFT JOIN users u ON s.user_id = u.id ${whereStr} ORDER BY s.speed DESC, s.accuracy DESC`
  ).all(...params);

  scores.forEach(s => {
    if (s.avatar) s.avatar = '/avatars/' + s.avatar;
  });

  res.json(scores);
});

app.post('/api/leaderboard', (req, res) => {
  const { nickname, speed, accuracy, time_seconds, article_id, source } = req.body;
  if (!nickname || speed === undefined || accuracy === undefined) {
    return res.status(400).json({ error: '昵称、速度和准确率不能为空' });
  }

  const sensitiveWord = containsSensitiveWord(nickname);
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
  const result = db.prepare('INSERT INTO scores (user_id, nickname, speed, accuracy, time_seconds, article_id, ip_address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, nickname, speed, accuracy, time_seconds || 0, article_id || null, ip, source || 'normal');
  const score = db.prepare('SELECT s.*, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.id = ?').get(result.lastInsertRowid);
  res.json(score);
});

app.delete('/api/leaderboard/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/leaderboard', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM scores').run();
  res.json({ success: true });
});

app.get('/api/my-scores', authMiddleware, (req, res) => {
  const scores = db.prepare('SELECT s.*, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.user_id = ? ORDER BY s.created_at DESC').all(req.user.id);
  res.json(scores);
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

app.post('/api/crawl/save', authMiddleware, adminMiddleware, (req, res) => {
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
    const { difficulty, difficulty_score } = calculateDifficulty(content.trim());
    const result = db.prepare(
      'INSERT INTO articles (title, content, category_id, source, status, difficulty, difficulty_score) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(title.trim(), content.trim(), category_id, source || '', 'approved', difficulty, difficulty_score);
    const article = db.prepare(
      'SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?'
    ).get(result.lastInsertRowid);
    res.json({ id: result.lastInsertRowid, category_name: article ? article.category_name : '', saved: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败: ' + e.message });
  }
});

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
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
});

app.put('/api/user/profile', authMiddleware, (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length === 0) {
    return res.status(400).json({ error: '昵称不能为空' });
  }
  if (nickname.length > 30) {
    return res.status(400).json({ error: '昵称最长30字符' });
  }
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.trim(), req.user.id);
  res.json({ success: true, nickname: nickname.trim() });
});

app.post('/api/user/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    const oldUser = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
    if (oldUser && oldUser.avatar) {
      const oldPath = path.join(avatarDir, oldUser.avatar);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch(e) {}
      }
    }
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.id);
    res.json({ success: true, avatar: '/avatars/' + req.file.filename });
  });
});

app.put('/api/user/password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入旧密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
  }
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: '旧密码不正确' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

app.get('/api/user/history', authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM scores WHERE user_id = ?').get(req.user.id).count;
  const scores = db.prepare(
    'SELECT s.id, s.speed, s.accuracy, s.time_seconds, s.created_at, a.title as article_title FROM scores s LEFT JOIN articles a ON s.article_id = a.id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ? OFFSET ?'
  ).all(req.user.id, limit, offset);

  res.json({
    scores,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

app.get('/api/user/stats', authMiddleware, (req, res) => {
  const days = Math.max(1, parseInt(req.query.days) || 30);

  const totalPractices = db.prepare('SELECT COUNT(*) as count FROM scores WHERE user_id = ?').get(req.user.id).count;
  const keystrokeRow = db.prepare('SELECT COALESCE(SUM(time_seconds * speed / 60), 0) as total FROM scores WHERE user_id = ?').get(req.user.id);
  const totalKeystrokes = Math.round(keystrokeRow.total);
  const timeRow = db.prepare('SELECT COALESCE(SUM(time_seconds), 0) as total FROM scores WHERE user_id = ?').get(req.user.id);
  const totalTimeSeconds = timeRow.total;

  const dailyStats = db.prepare(
    `SELECT date(created_at) as date, AVG(speed) as avgSpeed, AVG(accuracy) as avgAccuracy FROM scores WHERE user_id = ? AND created_at >= datetime('now', 'localtime', '-' || ? || ' days') GROUP BY date(created_at) ORDER BY date DESC`
  ).all(req.user.id, days);

  res.json({
    totalPractices,
    totalKeystrokes,
    totalTimeSeconds,
    dailyStats
  });
});

app.get('/api/user/error-log', authMiddleware, (req, res) => {
  const errors = db.prepare(
    'SELECT expected_char, typed_char, COUNT(*) as count FROM error_logs WHERE user_id = ? GROUP BY expected_char, typed_char ORDER BY count DESC'
  ).all(req.user.id);
  res.json(errors);
});

app.post('/api/user/error-log', authMiddleware, (req, res) => {
  const { article_id, errors } = req.body;
  if (!errors || !Array.isArray(errors)) {
    return res.status(400).json({ error: 'errors数组不能为空' });
  }
  const insert = db.prepare('INSERT INTO error_logs (user_id, article_id, expected_char, typed_char) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(req.user.id, article_id || null, item.expected_char, item.typed_char);
    }
  });
  insertMany(errors);
  res.json({ success: true });
});

app.post('/api/user/generate-error-practice', authMiddleware, (req, res) => {
  const topErrors = db.prepare(
    'SELECT expected_char, COUNT(*) as count FROM error_logs WHERE user_id = ? GROUP BY expected_char ORDER BY count DESC LIMIT 10'
  ).all(req.user.id);

  if (topErrors.length === 0) {
    return res.status(400).json({ error: '暂无错字记录，无法生成练习' });
  }

  const errorChars = topErrors.map(e => e.expected_char);
  const normalChars = '的一是不了人我在有他这为之大来以个中上们到说时地也子就道会那要下看天有';
  let content = '';
  for (const ch of errorChars) {
    for (let i = 0; i < 5; i++) {
      content += ch;
      const normalIdx = Math.floor(Math.random() * normalChars.length);
      content += normalChars[normalIdx];
    }
  }
  res.json({ title: '错字专项练习', content });
});

app.get('/api/user/private-articles', authMiddleware, (req, res) => {
  const articles = db.prepare('SELECT * FROM private_articles WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(articles);
});

app.post('/api/user/private-articles', authMiddleware, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  const result = db.prepare('INSERT INTO private_articles (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, title, content);
  const article = db.prepare('SELECT * FROM private_articles WHERE id = ?').get(result.lastInsertRowid);
  res.json(article);
});

app.post('/api/user/private-articles/upload', authMiddleware, (req, res) => {
  txtUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    const content = req.file.buffer.toString('utf-8');
    const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const result = db.prepare('INSERT INTO private_articles (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, title, content);
    const article = db.prepare('SELECT * FROM private_articles WHERE id = ?').get(result.lastInsertRowid);
    res.json(article);
  });
});

app.delete('/api/user/private-articles/:id', authMiddleware, (req, res) => {
  const article = db.prepare('SELECT * FROM private_articles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!article) {
    return res.status(404).json({ error: '文章不存在或不属于当前用户' });
  }
  db.prepare('DELETE FROM private_articles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/user/submitted-articles', authMiddleware, (req, res) => {
  const articles = db.prepare('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.author_id = ? ORDER BY a.id DESC').all(req.user.id);
  res.json(articles);
});

function getActiveAnnouncement() {
  const row = db.prepare(
    `SELECT * FROM announcements
     WHERE is_active = 1
       AND (start_time IS NULL OR start_time = '' OR start_time <= datetime('now', 'localtime'))
       AND (end_time IS NULL OR end_time = '' OR end_time >= datetime('now', 'localtime'))
     ORDER BY
       CASE level
         WHEN 'warning' THEN 1
         WHEN 'site-wide' THEN 2
         WHEN 'notification' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT 1`
  ).get();
  return row || null;
}

app.get('/api/announcement', (req, res) => {
  res.json(getActiveAnnouncement());
});

app.get('/api/admin/announcements', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM announcements ORDER BY COALESCE(NULLIF(created_at, ''), updated_at, '') DESC, id DESC").all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '公告列表加载失败: ' + e.message });
  }
});

app.post('/api/admin/announcements', authMiddleware, adminMiddleware, (req, res) => {
  const { title, content, level, is_active, allow_close, start_time, end_time } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '公告内容不能为空' });
  }
  const validLevels = ['notification', 'site-wide', 'warning'];
  const lvl = validLevels.includes(level) ? level : 'notification';
  try {
    const result = db.prepare(
      `INSERT INTO announcements (title, content, level, is_active, allow_close, start_time, end_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`
    ).run(
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

app.put('/api/admin/announcements/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { title, content, level, is_active, allow_close, start_time, end_time } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '公告内容不能为空' });
  }
  const validLevels = ['notification', 'site-wide', 'warning'];
  const lvl = validLevels.includes(level) ? level : 'notification';
  try {
    db.prepare(
      `UPDATE announcements SET
        title = ?, content = ?, level = ?, is_active = ?, allow_close = ?,
        start_time = ?, end_time = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(
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

app.delete('/api/admin/announcements/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const todayPractices = db.prepare("SELECT COUNT(*) as count FROM scores WHERE date(created_at) = date('now', 'localtime')").get().count;
  const todayNewScores = todayPractices;
  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
  const pendingArticles = db.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'pending'").get().count;
  const weeklyUsers = db.prepare(
    "SELECT date(created_at) as date, COUNT(*) as count FROM users WHERE created_at >= datetime('now', 'localtime', '-7 days') GROUP BY date(created_at) ORDER BY date DESC"
  ).all();

  res.json({
    totalUsers,
    todayPractices,
    todayNewScores,
    totalArticles,
    pendingArticles,
    weeklyUsers
  });
});

app.get('/api/admin/sensitive-words', authMiddleware, adminMiddleware, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'sensitive_words'").get();
  const words = row && row.value ? row.value.split(',').map(w => w.trim()).filter(w => w) : [];
  res.json(words);
});

app.put('/api/admin/sensitive-words', authMiddleware, adminMiddleware, (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words)) {
    return res.status(400).json({ error: 'words必须为数组' });
  }
  const value = words.join(',');
  db.prepare("UPDATE settings SET value = ? WHERE key = 'sensitive_words'").run(value);
  res.json({ success: true });
});

function getDatabaseTables() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
}

function assertDatabaseTable(table) {
  if (!table || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    return null;
  }
  const tables = getDatabaseTables();
  return tables.includes(table) ? table : null;
}

function getTableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function getPrimaryKeyColumn(table) {
  const columns = getTableColumns(table);
  const pk = columns.find(column => column.pk === 1);
  return pk ? pk.name : null;
}

function normalizeDateTimeInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace('T', ' ').slice(0, 19);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized) ? normalized + ':00' : normalized;
}

function parseDatabaseValue(value) {
  if (value === '') return null;
  if (typeof value === 'string') return normalizeDateTimeInput(value) || value;
  return value;
}

function getInsertDefaultValue(table, column) {
  if (/created_at|updated_at/i.test(column.name)) return { sql: "datetime('now', 'localtime')" };
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
    if (type.includes('INT') || type.includes('REAL') || type.includes('NUM')) return { value: 0 };
    return { value: '' };
  }
  return null;
}

app.get('/api/admin/db/tables', authMiddleware, adminMiddleware, (req, res) => {
  const tables = getDatabaseTables().map(name => {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get().count;
    const columns = getTableColumns(name).map(column => ({
      name: column.name,
      type: column.type,
      pk: column.pk === 1,
      notnull: column.notnull === 1,
      defaultValue: column.dflt_value
    }));
    return { name, count, columns, primaryKey: getPrimaryKeyColumn(name) };
  });
  res.json(tables);
});

app.get('/api/admin/db/:table', authMiddleware, adminMiddleware, (req, res) => {
  const table = assertDatabaseTable(req.params.table);
  if (!table) {
    return res.status(404).json({ error: '数据表不存在' });
  }

  const columns = getTableColumns(table);
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
      where = 'WHERE ' + searchableColumns.map(name => `CAST(${name} AS TEXT) LIKE ?`).join(' OR ');
      params = searchableColumns.map(() => '%' + search + '%');
    }
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM ${table} ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.json({
    table,
    columns: columns.map(column => ({
      name: column.name,
      type: column.type,
      pk: column.pk === 1,
      notnull: column.notnull === 1,
      defaultValue: column.dflt_value
    })),
    primaryKey: getPrimaryKeyColumn(table),
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
});

app.post('/api/admin/db/:table', authMiddleware, adminMiddleware, (req, res) => {
  const table = assertDatabaseTable(req.params.table);
  if (!table) {
    return res.status(404).json({ error: '数据表不存在' });
  }

  const columns = getTableColumns(table);
  const pk = getPrimaryKeyColumn(table);
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

  try {
    let result;
    if (insertColumns.length === 0) {
      result = db.prepare(`INSERT INTO ${table} DEFAULT VALUES`).run();
    } else {
      result = db.prepare(`INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...params);
    }
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: '新增记录失败: ' + e.message });
  }
});

app.put('/api/admin/db/:table/:id', authMiddleware, adminMiddleware, (req, res) => {
  const table = assertDatabaseTable(req.params.table);
  if (!table) {
    return res.status(404).json({ error: '数据表不存在' });
  }
  const pk = getPrimaryKeyColumn(table);
  if (!pk) {
    return res.status(400).json({ error: '该表没有主键，暂不支持网页编辑' });
  }
  const columns = getTableColumns(table);
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
  db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE ${pk} = ?`).run(...params);
  res.json({ success: true });
});

app.delete('/api/admin/db/:table/:id', authMiddleware, adminMiddleware, (req, res) => {
  const table = assertDatabaseTable(req.params.table);
  if (!table) {
    return res.status(404).json({ error: '数据表不存在' });
  }
  const pk = getPrimaryKeyColumn(table);
  if (!pk) {
    return res.status(400).json({ error: '该表没有主键，暂不支持网页删除' });
  }
  db.prepare(`DELETE FROM ${table} WHERE ${pk} = ?`).run(req.params.id);
  res.json({ success: true });
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

app.listen(PORT, '0.0.0.0', () => {
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
  if (hasAdminUser()) {
    console.log('  管理员账户: 已配置');
  } else {
    console.log('  管理员账户: 首次启动请在页面中创建');
  }
});
