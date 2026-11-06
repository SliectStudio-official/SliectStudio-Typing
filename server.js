const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
let JWT_SECRET = '';

function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) {
    JWT_SECRET = process.env.JWT_SECRET;
    console.log('JWT 密钥来源: 环境变量');
    return;
  }
  const secretPath = path.join(__dirname, 'data', 'jwt-secret.txt');
  if (fs.existsSync(secretPath)) {
    const saved = fs.readFileSync(secretPath, 'utf8').trim();
    if (!saved) {
      throw new Error('data/jwt-secret.txt 为空，无法启动');
    }
    JWT_SECRET = saved;
    console.log('JWT 密钥来源: data/jwt-secret.txt');
    return;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    throw new Error('写入 data/jwt-secret.txt 失败: ' + e.message);
  }
  JWT_SECRET = secret;
  console.log('JWT 密钥来源: data/jwt-secret.txt（本次新建）');
}

const loginFailures = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

function recordLoginFailure(key) {
  const now = Date.now();
  let entry = loginFailures.get(key);
  if (!entry) {
    if (loginFailures.size >= 10000) {
      loginFailures.clear();
      console.warn('[安全警告] 登录失败计数超过上限，已清空');
    }
    entry = { count: 0, windowStart: now, lockedUntil: 0 };
    loginFailures.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_FAILURES) {
    entry.lockedUntil = entry.windowStart + LOGIN_WINDOW_MS;
  }
}

const publicDir = path.join(__dirname, 'public');

const assetFileMeta = new Map();

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 8);
}

function buildAssetHashes() {
  const hashes = {};
  const entries = fs.readdirSync(publicDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === 'service-worker.js' || !/\.(js|css)$/i.test(entry.name)) continue;
    const filePath = path.join(publicDir, entry.name);
    const stat = fs.statSync(filePath);
    hashes['/' + entry.name] = hashFile(filePath);
    assetFileMeta.set('/' + entry.name, { mtimeMs: stat.mtimeMs, size: stat.size });
  }
  return hashes;
}

const assetHashes = buildAssetHashes();

function computeAssetVersion() {
  return crypto.createHash('sha256')
    .update(Object.keys(assetHashes).sort().map(name => assetHashes[name]).join(''))
    .digest('hex')
    .slice(0, 12);
}
let assetVersion = computeAssetVersion();

// 改完 public/ 不必重启：HTML 引用资源时按 mtimeMs+size 检查，变了才重算哈希
function getAssetHash(key, checkedKeys) {
  const cached = assetHashes[key];
  if (!cached) return undefined;
  if (checkedKeys && checkedKeys.has(key)) return cached;
  if (checkedKeys) checkedKeys.add(key);
  const filePath = path.join(publicDir, key.slice(1));
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return cached;
  }
  const meta = assetFileMeta.get(key);
  if (meta && meta.mtimeMs === stat.mtimeMs && meta.size === stat.size) return cached;
  const nextHash = hashFile(filePath);
  assetHashes[key] = nextHash;
  assetFileMeta.set(key, { mtimeMs: stat.mtimeMs, size: stat.size });
  assetVersion = computeAssetVersion();
  console.log(`[资源指纹] 检测到资源变更：${key.slice(1)} → ${nextHash}`);
  return nextHash;
}

const HTML_PAGES = ['/', '/index.html', '/admin.html', '/profile.html', '/setup.html', '/race.html'];

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(compression({
  level: 9,
  threshold: 256,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.get(HTML_PAGES, (req, res, next) => {
  const fileName = req.path === '/' ? 'index.html' : req.path.slice(1);
  fs.readFile(path.join(publicDir, fileName), 'utf8', (err, html) => {
    if (err) return next();
    const checkedKeys = new Set();
    const rewritten = html.replace(/(href|src)="([^"]+)"/g, (match, attr, value) => {
      if (/^(?:https?:)?\/\//.test(value) || value.startsWith('data:')) return match;
      const clean = value.split(/[?#]/)[0];
      const key = clean.startsWith('/') ? clean : '/' + clean.replace(/^\.\//, '');
      const hash = getAssetHash(key, checkedKeys);
      if (!hash) return match;
      return `${attr}="${clean}?v=${hash}"`;
    });
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.type('html').send(rewritten);
  });
});
app.get('/service-worker.js', (req, res, next) => {
  fs.readFile(path.join(publicDir, 'service-worker.js'), 'utf8', (err, source) => {
    if (err) return next();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(`// asset-version: ${assetVersion}\n` + source);
  });
});
app.use(express.static(publicDir, {
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
    const ext = avatarExtension(file) || '.jpg';
    const safeId = String(req.user.id).replace(/[^0-9]/g, '');
    const name = safeId + '_' + Date.now() + ext;
    cb(null, name);
  }
});
const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const AVATAR_MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
function avatarExtension(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext) return AVATAR_EXTENSIONS.includes(ext) ? ext : '';
  return AVATAR_MIME_EXT[String(file.mimetype || '').toLowerCase()] || '';
}
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (avatarExtension(file)) cb(null, true);
    else cb(new Error('仅支持 JPG/PNG/WebP 格式'));
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
  await db.run("UPDATE races SET status = 'aborted' WHERE status IN ('racing', 'countdown')");
  await seedData(db);
  const schemaRow = await db.get("SELECT value FROM settings WHERE `key` = 'schema_version'");
  if (!schemaRow || !schemaRow.value) {
    await db.run("INSERT INTO settings (`key`, value) VALUES ('schema_version', ?)", versionInfo.contractVersion);
  } else if (schemaRow.value !== versionInfo.contractVersion) {
    throw new Error(`数据规范版本不一致：库里 ${schemaRow.value}，代码 ${versionInfo.contractVersion}`);
  }
  loadOrCreateJwtSecret();
}

function normalizeDateTimeInput(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text + ' 00:00:00';
  }
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return value;
  return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`;
}

function parseDatabaseValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = normalizeDateTimeInput(value);
    return normalized !== null ? normalized : value;
  }
  return value;
}

function normalizeEmail(input) {
  if (input === null || input === undefined) return null;
  const text = String(input).trim();
  if (!text) return null;
  if (text.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false };
  return text.toLowerCase();
}

function validatePassword(pw) {
  if (pw.length < 6) return '密码至少6位';
  if (Buffer.byteLength(pw, 'utf8') > 72) return '密码不能超过 72 字节';
  return null;
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

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  let decoded;
  try {
    decoded = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'token无效或已过期' });
  }
  if (decoded && decoded.role === 'guest') {
    return res.status(401).json({ error: '无效的登录凭证' });
  }
  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: '用户不存在或登录已失效' });
  }
  try {
    const row = await db.get('SELECT id, username, role, token_version FROM users WHERE id = ?', decoded.id);
    if (!row) {
      return res.status(401).json({ error: '用户不存在或登录已失效' });
    }
    if (Number(decoded.token_version || 0) !== Number(row.token_version || 0)) {
      return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    req.user = { id: row.id, username: row.username, role: row.role };
    next();
  } catch (e) {
    return res.status(500).json({ error: '鉴权失败' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
}

// ============================================================
// Race mode: in-memory state + DB archive
// ============================================================
const RACE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RACE_GUEST_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const RACE_JOIN_WINDOW_MS = 10 * 60 * 1000;
const RACE_JOIN_MAX_FAILURES = 5;
const RACE_LIST_WINDOW_MS = 60 * 1000;
const RACE_LIST_MAX_HITS = 60;
const RACE_ROOM_GRACE_MS = 60 * 1000;
const RACE_GUEST_LIMIT = 4;
// 全员离线判定：选手心跳停止超过阈值才结束房间，避免一场无人的比赛挂到 charCount×2 分钟
const RACE_OFFLINE_RACING_MS = 60 * 1000;
const RACE_OFFLINE_COUNTDOWN_MS = 30 * 1000;
const RACE_OFFLINE_WAITING_MS = 120 * 1000;
const roomRegistry = new Map();
const raceJoinFailures = new Map();
const raceListHits = new Map();
let raceCleanupTimer = null;

// 快速匹配队列：进程内存，单进程前提；重启即清空
const matchQueue = [];
const MATCH_QUEUE_LIMIT = 50;
const MATCH_TIMEOUT_MS = 30 * 1000;
const MATCH_STALE_MS = 5 * 60 * 1000;
let matchAttempting = false;
let matchRoomFullLogged = false;

function formatDateTime(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateRoomCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += RACE_CODE_ALPHABET[bytes[i] % RACE_CODE_ALPHABET.length];
  return code;
}

function generateGuestId() {
  return crypto.randomBytes(20).toString('hex');
}

function normalizeNickname(raw) {
  let s = String(raw || '').normalize('NFKC');
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

function isActiveRoom(room) {
  return room.status === 'waiting' || room.status === 'countdown' || room.status === 'racing';
}

function activeRoomCount() {
  let n = 0;
  for (const room of roomRegistry.values()) if (isActiveRoom(room)) n++;
  return n;
}

function findRoomByCode(code) {
  return roomRegistry.get(String(code || '').toUpperCase()) || null;
}

function findRoomByUser(userId, activeOnly = true) {
  for (const room of roomRegistry.values()) {
    if (activeOnly && !isActiveRoom(room)) continue;
    if (room.players.has('u:' + userId)) return room;
  }
  return null;
}

function findRoomByHost(userId, activeOnly = true) {
  for (const room of roomRegistry.values()) {
    if (activeOnly && !isActiveRoom(room)) continue;
    if (room.hostUserId === userId) return room;
  }
  return null;
}

function findRoomBySpectator(userId, activeOnly = true) {
  for (const room of roomRegistry.values()) {
    if (activeOnly && !isActiveRoom(room)) continue;
    if (room.spectators && room.spectators.has('su:' + userId)) return room;
  }
  return null;
}

function playerMapKey(player) {
  return player.isGuest ? 'g:' + player.guestId : 'u:' + player.userId;
}

function spectatorCap(maxPlayers) {
  return Math.max(1, Math.floor((Number(maxPlayers) || 2) * 0.1));
}

function initSpectatorState(room) {
  if (!room.spectators) room.spectators = new Map();
  room.maxSpectators = spectatorCap(room.maxPlayers);
  if (!Number.isInteger(room.spectatorSeats) || room.spectatorSeats < 1 || room.spectatorSeats > room.maxSpectators) {
    room.spectatorSeats = room.maxSpectators;
  }
  if (room.spectatorMode !== 'free' && room.spectatorMode !== 'host') room.spectatorMode = 'free';
  if (typeof room.spectatorEnabled !== 'boolean') room.spectatorEnabled = room.allowSpectator !== false;
  room.allowSpectator = room.spectatorEnabled;
  return room;
}

function spectatorMapKey(spectator) {
  return spectator.isGuest ? 'sg:' + spectator.guestId : 'su:' + spectator.userId;
}

function playerKeyFromSpectator(spectator) {
  return spectator.isGuest ? 'g:' + spectator.guestId : 'u:' + spectator.userId;
}

function spectatorFromPlayer(player, now) {
  return {
    userId: player.userId, guestId: player.guestId, nickname: player.nickname,
    isGuest: player.isGuest, joinedAt: player.joinedAt, lastSeen: now, ip: player.ip || '',
    fromPlayer: true, seatJoinedAt: now,
    progress: player.progress || 0, finishedAt: player.finishedAt || null,
    speed: player.speed == null ? null : player.speed,
    accuracy: player.accuracy == null ? null : player.accuracy,
    timeSeconds: player.timeSeconds == null ? null : player.timeSeconds,
    rank: player.rank == null ? null : player.rank
  };
}

function playerFromSpectator(spectator, now) {
  return {
    userId: spectator.userId == null ? null : spectator.userId,
    guestId: spectator.guestId || null,
    nickname: spectator.nickname, isGuest: !!spectator.isGuest, ready: false,
    progress: spectator.progress || 0, finishedAt: spectator.finishedAt || null,
    speed: spectator.speed == null ? null : spectator.speed,
    accuracy: spectator.accuracy == null ? null : spectator.accuracy,
    timeSeconds: spectator.timeSeconds == null ? null : spectator.timeSeconds,
    rank: spectator.rank == null ? null : spectator.rank,
    joinedAt: spectator.joinedAt || now, ip: spectator.ip || '', lastSeen: now
  };
}

function isSpectatorHost(room, spectator) {
  return !!(spectator && spectator.userId != null && spectator.userId === room.hostUserId);
}

function movePlayerToSpectator(room, key, player, now) {
  room.players.delete(key);
  const spec = spectatorFromPlayer(player, now);
  room.spectators.set(spectatorMapKey(spec), spec);
  if (!spec.isGuest && spec.userId === room.hostUserId) room.hostLastSeen = now;
  return spec;
}

function moveSpectatorToPlayer(room, spectator, now) {
  const key = spectatorMapKey(spectator);
  room.spectators.delete(key);
  const player = playerFromSpectator(spectator, now);
  room.players.set(playerKeyFromSpectator(spectator), player);
  if (!player.isGuest && player.userId === room.hostUserId) room.hostLastSeen = now;
  return player;
}

function sortedSpectatorEntries(room) {
  return Array.from(room.spectators.entries()).sort(function (a, b) {
    return (a[1].seatJoinedAt || a[1].joinedAt || 0) - (b[1].seatJoinedAt || b[1].joinedAt || 0);
  });
}

function evictSpectatorsForSeats(room, targetSeats, now) {
  const entries = sortedSpectatorEntries(room);
  if (entries.length <= targetSeats) return null;
  const evicted = entries.slice(targetSeats);
  const needPlayerSeats = evicted.filter(function (entry) { return entry[1].fromPlayer; }).length;
  if (room.players.size + needPlayerSeats > room.maxPlayers) {
    return '选手席已满，无法减少观战席';
  }
  for (let i = evicted.length - 1; i >= 0; i--) {
    const entry = evicted[i];
    if (entry[1].fromPlayer) moveSpectatorToPlayer(room, entry[1], now);
    else room.spectators.delete(entry[0]);
  }
  return null;
}

function clearAllSpectators(room, now) {
  const entries = Array.from(room.spectators.values());
  const needPlayerSeats = entries.filter(function (s) { return s.fromPlayer; }).length;
  if (room.players.size + needPlayerSeats > room.maxPlayers) return false;
  for (const s of entries) {
    if (s.fromPlayer) moveSpectatorToPlayer(room, s, now);
    else room.spectators.delete(spectatorMapKey(s));
  }
  return true;
}

function transferHostToEarliest(room, now) {
  const candidates = Array.from(room.players.values())
    .filter(function (p) { return p.userId !== null && p.userId !== undefined; })
    .sort(function (a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); });
  if (!candidates.length) return null;
  room.hostUserId = candidates[0].userId;
  room.hostNickname = candidates[0].nickname;
  room.hostLastSeen = now;
  return candidates[0];
}

function markAbandoned(room, player) {
  if (!room.abandonedPlayers) room.abandonedPlayers = [];
  room.abandonedPlayers.push({
    nickname: player.nickname,
    isGuest: !!player.isGuest,
    atChar: player.progress || 0,
    leftAt: Date.now()
  });
}

async function isNicknameTakenByUser(lower) {
  const row = await db.get('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(nickname) = ? LIMIT 1', lower, lower);
  return !!row;
}

async function buildGuestNickname(raw, room) {
  let base = normalizeNickname(raw);
  if (base.length < 2 || base.length > 12) return null;
  const hit = await containsSensitiveWord(base);
  if (hit) base = base.split(hit).join('***');
  const existing = new Set();
  for (const p of room.players.values()) existing.add(p.nickname.toLowerCase());
  if (room.spectators) for (const s of room.spectators.values()) existing.add(s.nickname.toLowerCase());
  let candidate = base;
  let n = 1;
  while (existing.has(candidate.toLowerCase()) || await isNicknameTakenByUser(candidate.toLowerCase())) {
    n++;
    if (n > 50) return null;
    const suffix = '(' + n + ')';
    candidate = base.slice(0, Math.max(1, 12 - suffix.length)) + suffix;
  }
  return candidate;
}

function findMatchEntry(userId) {
  for (const entry of matchQueue) {
    if (entry.userId === userId) return entry;
  }
  return null;
}

async function createMatchedRoom(first, second, article) {
  let code = null;
  for (let i = 0; i < 10; i++) {
    const candidate = generateRoomCode();
    if (roomRegistry.has(candidate)) continue;
    const exists = await db.get('SELECT id FROM races WHERE code = ?', candidate);
    if (!exists) { code = candidate; break; }
  }
  if (!code) throw new Error('生成房间码失败');
  const now = Date.now();
  const startsAt = now + 3000;
  const hostNickname = first.nickname || first.username;
  const room = {
    code, raceId: null, hostUserId: first.userId, hostNickname, status: 'countdown',
    articleId: article.id, articleTitle: article.title, content: article.content, charCount: article.content.length,
    maxPlayers: 2, isPublic: false, passwordHash: null,
    createdAt: now, startsAt, finishedAt: null, cancelledReason: null, cancelledBy: null,
    cancelledAt: null, hostLastSeen: now, finishedCount: 0, players: new Map(),
    allowSpectator: true, spectators: new Map(), matchmade: true, abandonedPlayers: []
  };
  initSpectatorState(room);
  [first, second].forEach(function (entry) {
    room.players.set('u:' + entry.userId, {
      userId: entry.userId, guestId: null, nickname: entry.nickname || entry.username,
      isGuest: false, ready: true, progress: 0, finishedAt: null, speed: null,
      accuracy: null, timeSeconds: null, rank: null, joinedAt: now, ip: '', lastSeen: now
    });
  });
  const result = await db.run(
    `INSERT INTO races (code, password_hash, host_user_id, article_id, article_title, content_snapshot, char_count, status, is_public, max_players, player_count, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code, null, first.userId, article.id, article.title, article.content, article.content.length,
    'countdown', 0, 2, 2, formatDateTime(startsAt)
  );
  room.raceId = result.lastInsertRowid;
  roomRegistry.set(code, room);
  return room;
}

async function attemptMatch() {
  if (matchAttempting) return null;
  matchAttempting = true;
  try {
    const now = Date.now();
    for (let i = matchQueue.length - 1; i >= 0; i--) {
      const entry = matchQueue[i];
      const inRoom = !!findRoomByUser(entry.userId, true);
      const stale = now - entry.joinedAt > MATCH_STALE_MS;
      if (inRoom || stale) {
        matchQueue.splice(i, 1);
        console.warn('[匹配] 剔除排队条目', { userId: entry.userId, reason: inRoom ? 'already_in_room' : 'stale' });
      }
    }
    if (matchQueue.length < 2) return null;
    const settings = await getRaceSettings();
    if (!settings.enabled) return null;
    if (activeRoomCount() >= settings.maxRooms) {
      if (!matchRoomFullLogged) {
        console.warn('[匹配] 房间已满，暂停配对', { active: activeRoomCount(), max: settings.maxRooms });
        matchRoomFullLogged = true;
      }
      return { hint: '房间已满，请稍后再试', roomFull: true };
    }
    matchRoomFullLogged = false;
    const first = matchQueue[0];
    const second = matchQueue[1];
    if (!first || !second || first.userId === second.userId) return null;
    const rows = await db.all("SELECT id, title, content FROM articles WHERE status = 'approved'");
    const preferred = rows.filter(function (row) { return row.content && row.content.length >= 200 && row.content.length <= 400; });
    const pool = preferred.length ? preferred : rows.filter(function (row) { return row.content; });
    if (!pool.length) return { hint: '暂无可用文章，请稍后再试' };
    const article = pool[Math.floor(Math.random() * pool.length)];
    let room;
    try {
      room = await createMatchedRoom(first, second, article);
    } catch (e) {
      console.error('[匹配] 创建房间失败:', e.message);
      return { hint: '创建比赛失败，请稍后再试' };
    }
    [first, second].forEach(function (entry) {
      const idx = matchQueue.findIndex(function (item) { return item.userId === entry.userId; });
      if (idx >= 0) matchQueue.splice(idx, 1);
    });
    console.log('[匹配] 配对成功', { code: room.code, first: first.userId, second: second.userId });
    return { matched: room.code };
  } finally {
    matchAttempting = false;
  }
}

async function getRaceSettings() {
  const maxRow = await db.get("SELECT value FROM settings WHERE `key` = 'race_max_rooms'");
  const enabledRow = await db.get("SELECT value FROM settings WHERE `key` = 'race_enabled'");
  let maxRooms = maxRow ? parseInt(maxRow.value, 10) : 20;
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 50) maxRooms = 20;
  const enabled = enabledRow ? enabledRow.value === 'true' : true;
  return { maxRooms, enabled };
}

async function setSetting(key, value) {
  if (isMySQL(db)) {
    await db.run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', key, value);
  } else {
    await db.run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value', key, value);
  }
}

function checkJoinLock(key) {
  const now = Date.now();
  const entry = raceJoinFailures.get(key);
  if (!entry) return false;
  if (now - entry.windowStart > RACE_JOIN_WINDOW_MS) {
    raceJoinFailures.delete(key);
    return false;
  }
  return entry.count >= RACE_JOIN_MAX_FAILURES;
}

function recordJoinFailure(key) {
  const now = Date.now();
  let entry = raceJoinFailures.get(key);
  if (!entry || now - entry.windowStart > RACE_JOIN_WINDOW_MS) {
    if (!entry && raceJoinFailures.size >= 10000) {
      raceJoinFailures.clear();
      console.warn('[安全警告] 房间加入失败计数超过上限，已清空');
    }
    entry = { count: 0, windowStart: now };
    raceJoinFailures.set(key, entry);
  }
  entry.count += 1;
}

function checkListRate(ip) {
  const now = Date.now();
  let entry = raceListHits.get(ip);
  if (!entry || now - entry.start > RACE_LIST_WINDOW_MS) {
    if (!entry && raceListHits.size >= 10000) {
      raceListHits.clear();
      console.warn('[安全警告] 房间列表访问计数超过上限，已清空');
    }
    entry = { start: now, count: 0 };
    raceListHits.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RACE_LIST_MAX_HITS;
}

function buildSnapshot(room, player, spectator) {
  initSpectatorState(room);
  const sorted = Array.from(room.players.values()).sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return b.progress - a.progress;
  });
  const isHost = (player && player.userId !== null && player.userId === room.hostUserId) ||
    isSpectatorHost(room, spectator);
  const spectatorList = Array.from(room.spectators.values()).map(s => ({
    userId: s.userId == null ? null : s.userId,
    guestId: s.guestId || null,
    nickname: s.nickname,
    isGuest: !!s.isGuest,
    isHost: isSpectatorHost(room, s),
    fromPlayer: !!s.fromPlayer,
    joinedAt: s.joinedAt || null,
    seatJoinedAt: s.seatJoinedAt || s.joinedAt || null
  }));
  return {
    race: {
      code: room.code,
      status: room.status,
      articleId: room.articleId,
      articleTitle: room.articleTitle,
      charCount: room.charCount,
      content: room.content,
      maxPlayers: room.maxPlayers,
      hostUserId: room.hostUserId,
      startsAt: room.startsAt,
      finishedAt: room.finishedAt,
      cancelledReason: room.cancelledReason || null,
      allowSpectator: room.spectatorEnabled,
      spectatorEnabled: room.spectatorEnabled,
      spectatorMode: room.spectatorMode,
      spectatorSeats: room.spectatorSeats,
      maxSpectators: room.maxSpectators,
      spectatorCount: room.spectators.size,
      isHost: !!isHost,
      mySeat: player ? 'player' : (spectator ? 'spectator' : null),
      serverNow: Date.now()
    },
    isHost: !!isHost,
    mySeat: player ? 'player' : (spectator ? 'spectator' : null),
    spectator: spectator ? {
      nickname: spectator.nickname,
      isGuest: !!spectator.isGuest,
      isHost: isSpectatorHost(room, spectator),
      fromPlayer: !!spectator.fromPlayer
    } : null,
    me: player ? {
      userId: player.userId,
      guestId: player.guestId,
      nickname: player.nickname,
      ready: player.ready,
      progress: player.progress,
      finishedAt: player.finishedAt,
      rank: player.rank
    } : null,
    players: sorted.map(p => ({
      userId: p.userId,
      guestId: p.guestId,
      nickname: p.nickname,
      isHost: p.userId !== null && p.userId === room.hostUserId,
      isGuest: p.isGuest,
      ready: p.ready,
      progress: p.progress,
      finishedAt: p.finishedAt,
      rank: p.rank,
      speed: p.speed || null,
      accuracy: p.accuracy || null,
      timeSeconds: p.timeSeconds || null,
      lastSeen: p.lastSeen || null
    })),
    spectators: spectatorList,
    abandonedPlayers: Array.from(room.abandonedPlayers || []).map(function (p) {
      return { nickname: p.nickname, isGuest: !!p.isGuest, atChar: p.atChar || 0 };
    })
  };
}

function updateRoomPhase(room) {
  if (room.status === 'countdown' && Date.now() >= room.startsAt) {
    room.status = 'racing';
  }
}

async function cancelRoom(room, reason, byId, detail) {
  if (room.status === 'cancelled') return;
  room.status = 'cancelled';
  room.cancelledReason = reason;
  room.cancelledBy = byId || null;
  room.cancelledAt = Date.now();
  try {
    await db.run("UPDATE races SET status = 'cancelled', cancelled_reason = ?, cancelled_by = ? WHERE id = ?", reason, byId || null, room.raceId);
  } catch (e) {
    console.error('[比赛] 更新取消状态失败:', e.message);
  }
  const log = { code: room.code, reason, by: byId || null };
  if (detail) Object.assign(log, detail);
  console.warn('[比赛] 房间取消', log);
}

async function upsertParticipant(room, player) {
  const finishedAt = player.finishedAt ? formatDateTime(player.finishedAt) : null;
  const joinedAt = formatDateTime(player.joinedAt || Date.now());
  const values = [
    room.raceId, player.userId || null, player.guestId || null, player.nickname,
    player.isGuest ? 1 : 0, player.ready ? 1 : 0, player.progress || 0,
    player.speed === undefined ? null : player.speed,
    player.accuracy === undefined ? null : player.accuracy,
    player.timeSeconds === undefined ? null : player.timeSeconds,
    player.rank === undefined ? null : player.rank,
    finishedAt, joinedAt
  ];
  const cols = '(race_id, user_id, guest_id, nickname, is_guest, ready, progress, speed, accuracy, time_seconds, rank_no, finished_at, joined_at)';
  const marks = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  try {
    if (isMySQL(db)) {
      await db.run(`INSERT INTO race_participants ${cols} VALUES ${marks} ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), ready = VALUES(ready), progress = VALUES(progress), speed = VALUES(speed), accuracy = VALUES(accuracy), time_seconds = VALUES(time_seconds), rank_no = VALUES(rank_no), finished_at = VALUES(finished_at)`, ...values);
    } else {
      await db.run(`INSERT INTO race_participants ${cols} VALUES ${marks} ON CONFLICT DO UPDATE SET nickname = excluded.nickname, ready = excluded.ready, progress = excluded.progress, speed = excluded.speed, accuracy = excluded.accuracy, time_seconds = excluded.time_seconds, rank_no = excluded.rank_no, finished_at = excluded.finished_at`, ...values);
    }
  } catch (e) {
    console.error('[比赛] 写入参与者失败:', e.message);
  }
}

async function finalizeRoom(room, reason) {
  if (room.status === 'finished' || room.status === 'cancelled') return;
  updateRoomPhase(room);
  const players = Array.from(room.players.values());
  const finished = players.filter(p => p.finishedAt).sort((a, b) => a.rank - b.rank);
  const unfinished = players.filter(p => !p.finishedAt).sort((a, b) => b.progress - a.progress);
  let nextRank = finished.length + 1;
  for (const p of unfinished) p.rank = nextRank++;
  room.status = 'finished';
  room.finishedAt = Date.now();
  try {
    await db.run("UPDATE races SET status = 'finished', finished_at = ? WHERE id = ?", formatDateTime(room.finishedAt), room.raceId);
  } catch (e) {
    console.error('[比赛] 更新结束状态失败:', e.message);
  }
  for (const p of players) await upsertParticipant(room, p);
  console.warn('[比赛] 房间结束', { code: room.code, reason });
}

async function cleanupRooms() {
  const now = Date.now();
  for (const room of Array.from(roomRegistry.values())) {
    if (isActiveRoom(room)) {
      if (room.status === 'waiting') {
        const players = Array.from(room.players.values());
        const playersStale = players.every(function (p) { return now - (p.lastSeen || 0) > RACE_OFFLINE_WAITING_MS; });
        const hostStale = !room.hostLastSeen || now - room.hostLastSeen > RACE_OFFLINE_WAITING_MS;
        if (playersStale && hostStale) {
          await cancelRoom(room, 'all_disconnected', null, { offline: players.length });
          continue;
        }
      } else if (room.status === 'countdown') {
        const players = Array.from(room.players.values()).filter(function (p) { return !p.finishedAt; });
        if (players.length && players.every(function (p) { return now - (p.lastSeen || 0) > RACE_OFFLINE_COUNTDOWN_MS; })) {
          await cancelRoom(room, 'all_disconnected', null, { offline: players.length });
          continue;
        }
      } else if (room.status === 'racing') {
        const players = Array.from(room.players.values()).filter(function (p) { return !p.finishedAt; });
        if (players.length && players.every(function (p) { return now - (p.lastSeen || 0) > RACE_OFFLINE_RACING_MS; })) {
          await cancelRoom(room, 'all_disconnected', null, { offline: players.length });
          continue;
        }
      }
      if (room.hostLastSeen && now - room.hostLastSeen > 5 * 60 * 1000) {
        await cancelRoom(room, 'host_disconnect', null);
        continue;
      }
      if (room.status === 'racing' && room.charCount > 0 && now - room.startsAt > room.charCount * 2 * 60 * 1000) {
        await finalizeRoom(room, 'time_limit');
      }
    }
    if ((room.status === 'finished' && room.finishedAt && now - room.finishedAt > RACE_ROOM_GRACE_MS) ||
        (room.status === 'cancelled' && room.cancelledAt && now - room.cancelledAt > RACE_ROOM_GRACE_MS)) {
      roomRegistry.delete(room.code);
    }
  }
}

function startRaceCleanup() {
  if (raceCleanupTimer) return;
  raceCleanupTimer = setInterval(() => {
    cleanupRooms().catch(e => console.error('[比赛] 清理失败:', e.message));
  }, 30000);
  process.on('exit', () => {
    if (raceCleanupTimer) clearInterval(raceCleanupTimer);
  });
}

function findRaceContext(req) {
  if (req.raceIsGuest) {
    const room = req.raceRoom;
    const player = room ? room.players.get('g:' + req.racePlayer.guestId) : null;
    let spectator = null;
    if (!player && room && room.spectators) spectator = room.spectators.get('sg:' + req.racePlayer.guestId) || null;
    return { room: player || spectator ? room : null, player, spectator };
  }
  if (!req.user) return { room: null, player: null, spectator: null };
  const room = findRoomByUser(req.user.id, true) || findRoomByUser(req.user.id, false);
  if (room) {
    const player = room.players.get('u:' + req.user.id);
    if (player) return { room, player, spectator: null };
  }
  for (const r of roomRegistry.values()) {
    if (r.spectators && r.spectators.has('su:' + req.user.id)) {
      return { room: r, player: null, spectator: r.spectators.get('su:' + req.user.id) };
    }
  }
  return { room: null, player: null, spectator: null };
}

async function raceAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  let decoded;
  try {
    decoded = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'token无效或已过期' });
  }
  if (decoded && decoded.role === 'guest') {
    const room = findRoomByCode(decoded.raceCode);
    const player = room ? room.players.get('g:' + decoded.guestId) : null;
    const spectator = room && room.spectators ? room.spectators.get('sg:' + decoded.guestId) : null;
    if (!player && !spectator) {
      return res.status(401).json({ error: '已不在该房间' });
    }
    req.raceIsGuest = true;
    req.raceRoom = room;
    // 观战者没有 player 记录，用 token 里的 guestId 兜住身份
    req.racePlayer = player || { guestId: decoded.guestId };
    return next();
  }
  return authMiddleware(req, res, next);
}

// 重连查询不能因为“已不在房间”返回 401：游客 token 有效但房间已结束时应返回 {code:null}
function raceActiveAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  let decoded;
  try {
    decoded = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'token无效或已过期' });
  }
  if (decoded && decoded.role === 'guest') {
    req.raceIsGuest = true;
    req.raceActiveRoomCode = decoded.raceCode;
    req.raceActiveGuestId = decoded.guestId;
    return next();
  }
  return authMiddleware(req, res, next);
}

app.post('/api/race/create', authMiddleware, async (req, res) => {
  try {
    const settings = await getRaceSettings();
    if (!settings.enabled) {
      return res.status(400).json({ error: '管理员已暂停创建比赛' });
    }
    if (activeRoomCount() >= settings.maxRooms) {
      return res.status(400).json({ error: `当前比赛房间已满（${settings.maxRooms}/${settings.maxRooms}）` });
    }
    if (findRoomByUser(req.user.id, true) || findRoomBySpectator(req.user.id, true)) {
      return res.status(400).json({ error: '你已在其他比赛房间中' });
    }
    const { articleId, password, maxPlayers, isPublic } = req.body || {};
    if (typeof password !== 'string' || !/^\d{4}$/.test(password)) {
      return res.status(400).json({ error: '房间密码必须是 4 位数字' });
    }
    const mp = maxPlayers === undefined ? 8 : parseInt(maxPlayers, 10);
    if (!Number.isInteger(mp) || mp < 2 || mp > 8) {
      return res.status(400).json({ error: '房间人数上限必须在 2 到 8 之间' });
    }
    const aid = parseInt(articleId, 10);
    if (!Number.isInteger(aid)) {
      return res.status(400).json({ error: '请选择文章' });
    }
    const article = await db.get('SELECT id, title, content FROM articles WHERE id = ?', aid);
    if (!article) {
      return res.status(400).json({ error: '文章不存在' });
    }
    let code = null;
    for (let i = 0; i < 10; i++) {
      const candidate = generateRoomCode();
      if (roomRegistry.has(candidate)) continue;
      const exists = await db.get('SELECT id FROM races WHERE code = ?', candidate);
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      return res.status(500).json({ error: '生成房间码失败，请重试' });
    }
    const host = await db.get('SELECT username, nickname FROM users WHERE id = ?', req.user.id);
    const hostNickname = (host && (host.nickname || host.username)) || req.user.username;
    const now = Date.now();
    const room = {
      code, raceId: null, hostUserId: req.user.id, hostNickname, status: 'waiting',
      articleId: aid, articleTitle: article.title, content: article.content, charCount: article.content.length,
      maxPlayers: mp, isPublic: isPublic !== false, passwordHash: bcrypt.hashSync(password, 10),
      createdAt: now, startsAt: null, finishedAt: null, cancelledReason: null, cancelledBy: null,
      cancelledAt: null, hostLastSeen: now, finishedCount: 0, players: new Map(),
      allowSpectator: isPublic === undefined ? true : true, spectators: new Map(),
      abandonedPlayers: []
    };
    room.allowSpectator = req.body && req.body.allowSpectator === false ? false : true;
    room.spectatorEnabled = room.allowSpectator;
    room.spectatorMode = 'free';
    room.spectatorSeats = spectatorCap(mp);
    room.maxSpectators = room.spectatorSeats;
    room.players.set('u:' + req.user.id, {
      userId: req.user.id, guestId: null, nickname: hostNickname, isGuest: false, ready: false,
      progress: 0, finishedAt: null, speed: null, accuracy: null, timeSeconds: null, rank: null,
      joinedAt: now, ip: req.ip || '', lastSeen: now
    });
    const result = await db.run(
      'INSERT INTO races (code, password_hash, host_user_id, article_id, article_title, status, is_public, max_players, player_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      code, room.passwordHash, req.user.id, aid, article.title, 'waiting', room.isPublic ? 1 : 0, mp, 0
    );
    room.raceId = result.lastInsertRowid;
    roomRegistry.set(code, room);
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: '创建比赛失败: ' + e.message });
  }
});

app.post('/api/race/match/join', authMiddleware, async (req, res) => {
  try {
    const settings = await getRaceSettings();
    if (!settings.enabled) {
      return res.status(400).json({ error: '管理员已暂停创建比赛' });
    }
    if (findRoomByUser(req.user.id, true) || findRoomBySpectator(req.user.id, true)) {
      return res.status(400).json({ error: '你已在其他比赛房间中' });
    }
    let entry = findMatchEntry(req.user.id);
    if (!entry) {
      if (matchQueue.length >= MATCH_QUEUE_LIMIT) {
        return res.status(400).json({ error: '队列已满，请稍后再试' });
      }
      const user = await db.get('SELECT username, nickname FROM users WHERE id = ?', req.user.id);
      entry = {
        userId: req.user.id,
        username: user ? user.username : req.user.username,
        nickname: user ? (user.nickname || user.username) : req.user.username,
        joinedAt: Date.now()
      };
      matchQueue.push(entry);
    }
    const attempt = await attemptMatch();
    const room = findRoomByUser(req.user.id, true);
    if (room) return res.json({ status: 'matched', code: room.code });
    if (!findMatchEntry(req.user.id)) {
      // 条目恰好超过 5 分钟被 attemptMatch 清掉：重新排一次，保持 join 幂等可用
      const user = await db.get('SELECT username, nickname FROM users WHERE id = ?', req.user.id);
      entry = {
        userId: req.user.id,
        username: user ? user.username : req.user.username,
        nickname: user ? (user.nickname || user.username) : req.user.username,
        joinedAt: Date.now()
      };
      if (matchQueue.length < MATCH_QUEUE_LIMIT) matchQueue.push(entry);
    }
    const elapsed = Date.now() - entry.joinedAt;
    const payload = { status: 'waiting', waiting: matchQueue.length, elapsed };
    if (attempt && attempt.hint) payload.hint = attempt.hint;
    else if (elapsed >= MATCH_TIMEOUT_MS) payload.hint = '可继续等待，或返回大厅自建房间';
    if (attempt && attempt.roomFull) payload.roomFull = true;
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: '加入匹配失败' });
  }
});

app.get('/api/race/match/status', authMiddleware, async (req, res) => {
  try {
    const attempt = await attemptMatch();
    const room = findRoomByUser(req.user.id, true);
    if (room) return res.json({ status: 'matched', code: room.code });
    const entry = findMatchEntry(req.user.id);
    if (!entry) return res.json({ status: 'idle' });
    const elapsed = Date.now() - entry.joinedAt;
    const payload = { status: 'waiting', waiting: matchQueue.length, elapsed };
    if (attempt && attempt.hint) payload.hint = attempt.hint;
    else if (elapsed >= MATCH_TIMEOUT_MS) payload.hint = '可继续等待，或返回大厅自建房间';
    if (attempt && attempt.roomFull) payload.roomFull = true;
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: '获取匹配状态失败' });
  }
});

app.post('/api/race/match/cancel', authMiddleware, async (req, res) => {
  try {
    const idx = matchQueue.findIndex(function (entry) { return entry.userId === req.user.id; });
    if (idx >= 0) matchQueue.splice(idx, 1);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '取消匹配失败' });
  }
});

app.post('/api/race/join', async (req, res) => {
  try {
    const { code, password, nickname } = req.body || {};
    const codeStr = String(code || '').toUpperCase();
    const ip = req.ip || '';
    const limitKey = ip + '|' + codeStr;
    if (checkJoinLock(limitKey)) {
      return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    }
    const room = findRoomByCode(codeStr);
    if (!room) {
      recordJoinFailure(limitKey);
      return res.status(400).json({ error: '房间不存在或密码错误' });
    }
    const auth = req.headers.authorization;
    let realUser = null;
    let guestToken = null;
    if (auth && auth.startsWith('Bearer ')) {
      let decoded;
      try {
        decoded = jwt.verify(auth.slice(7), JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ error: 'token无效或已过期' });
      }
      if (decoded && decoded.role === 'guest') {
        guestToken = decoded;
      } else if (decoded && decoded.id) {
        const u = await db.get('SELECT id, username, nickname, token_version FROM users WHERE id = ?', decoded.id);
        if (!u || Number(decoded.token_version || 0) !== Number(u.token_version || 0)) {
          return res.status(401).json({ error: '登录已失效，请重新登录' });
        }
        realUser = u;
      }
    }
    if (realUser && room.players.has('u:' + realUser.id)) {
      raceJoinFailures.delete(limitKey);
      const player = room.players.get('u:' + realUser.id);
      return res.json({ token: auth.slice(7), nickname: player.nickname, raceId: room.raceId, state: buildSnapshot(room, player) });
    }
    if (realUser && room.spectators && room.spectators.has('su:' + realUser.id)) {
      raceJoinFailures.delete(limitKey);
      const sp = room.spectators.get('su:' + realUser.id);
      return res.json({ token: auth.slice(7), nickname: sp.nickname, raceId: room.raceId, spectator: true, state: buildSnapshot(room, null, sp) });
    }
    if (guestToken && guestToken.raceCode === room.code) {
      const gp = room.players.get('g:' + guestToken.guestId);
      if (gp) {
        raceJoinFailures.delete(limitKey);
        return res.json({ token: auth.slice(7), nickname: gp.nickname, raceId: room.raceId, state: buildSnapshot(room, gp) });
      }
      const gs = room.spectators ? room.spectators.get('sg:' + guestToken.guestId) : null;
      if (gs) {
        raceJoinFailures.delete(limitKey);
        return res.json({ token: auth.slice(7), nickname: gs.nickname, raceId: room.raceId, spectator: true, state: buildSnapshot(room, null, gs) });
      }
    }
    if (room.passwordHash && !bcrypt.compareSync(String(password || ''), room.passwordHash)) {
      recordJoinFailure(limitKey);
      return res.status(400).json({ error: '房间不存在或密码错误' });
    }
    if (realUser && (findRoomByUser(realUser.id, true) || findRoomBySpectator(realUser.id, true))) {
      return res.status(400).json({ error: '你已在其他比赛房间中' });
    }
    // 观战身份：不受比赛名额与阶段限制
    if (req.body && req.body.asSpectator) {
      initSpectatorState(room);
      if (!room.spectatorEnabled) {
        return res.status(400).json({ error: '本房间未开放观战' });
      }
      if (room.spectatorMode === 'host') {
        return res.status(400).json({ error: '本房间观战需房主安排' });
      }
      if (room.spectators.size >= room.spectatorSeats) {
        return res.status(400).json({ error: '观战席已满（' + room.spectators.size + '/' + room.spectatorSeats + '）' });
      }
      const now2 = Date.now();
      if (realUser) {
        const finalNick = realUser.nickname || realUser.username;
        room.spectators.set('su:' + realUser.id, {
          userId: realUser.id, guestId: null, nickname: finalNick, isGuest: false,
          joinedAt: now2, lastSeen: now2, ip, seatJoinedAt: now2
        });
        raceJoinFailures.delete(limitKey);
        return res.json({ token: auth.slice(7), nickname: finalNick, raceId: room.raceId, spectator: true, state: buildSnapshot(room, null, room.spectators.get('su:' + realUser.id)) });
      }
      if (!nickname) {
        return res.status(400).json({ error: '观战也需要填写昵称' });
      }
      const specNick = await buildGuestNickname(nickname, room);
      if (!specNick) {
        return res.status(400).json({ error: '昵称长度必须为 2~12 个字符' });
      }
      const specGuestId = generateGuestId();
      const specExpires = Math.max(1, Math.floor((room.createdAt + RACE_GUEST_TOKEN_TTL_MS - Date.now()) / 1000));
      const specToken = jwt.sign({ role: 'guest', guestId: specGuestId, nickname: specNick, raceCode: room.code, spectator: true }, JWT_SECRET, { expiresIn: specExpires });
      room.spectators.set('sg:' + specGuestId, {
        userId: null, guestId: specGuestId, nickname: specNick, isGuest: true,
        joinedAt: now2, lastSeen: now2, ip, seatJoinedAt: now2
      });
      raceJoinFailures.delete(limitKey);
      return res.json({ token: specToken, nickname: specNick, raceId: room.raceId, spectator: true, state: buildSnapshot(room, null, room.spectators.get('sg:' + specGuestId)) });
    }

    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '比赛已开始，无法加入' });
    }
    if (room.players.size >= room.maxPlayers) {
      return res.status(400).json({ error: '房间已满' });
    }
    if (realUser) {
      if (findRoomByUser(realUser.id, true) || findRoomBySpectator(realUser.id, true)) {
        return res.status(400).json({ error: '你已在其他比赛房间中' });
      }
      const finalNickname = realUser.nickname || realUser.username;
      const now = Date.now();
      const player = {
        userId: realUser.id, guestId: null, nickname: finalNickname, isGuest: false, ready: false,
        progress: 0, finishedAt: null, speed: null, accuracy: null, timeSeconds: null, rank: null,
        joinedAt: now, ip, lastSeen: now
      };
      room.players.set('u:' + realUser.id, player);
      raceJoinFailures.delete(limitKey);
      return res.json({ token: auth.slice(7), nickname: finalNickname, raceId: room.raceId, state: buildSnapshot(room, player) });
    }
    if (!nickname) {
      return res.status(400).json({ error: '游客需要填写昵称' });
    }
    const guestCount = Array.from(room.players.values()).filter(p => p.isGuest).length;
    if (guestCount >= RACE_GUEST_LIMIT) {
      return res.status(400).json({ error: '该房间游客席位已满' });
    }
    if (Array.from(room.players.values()).some(p => p.isGuest && p.ip === ip)) {
      return res.status(400).json({ error: '同一 IP 在该房间只能有一个游客席位' });
    }
    const finalNickname = await buildGuestNickname(nickname, room);
    if (!finalNickname) {
      return res.status(400).json({ error: '昵称长度必须为 2~12 个字符' });
    }
    const guestId = generateGuestId();
    const now = Date.now();
    const player = {
      userId: null, guestId, nickname: finalNickname, isGuest: true, ready: false,
      progress: 0, finishedAt: null, speed: null, accuracy: null, timeSeconds: null, rank: null,
      joinedAt: now, ip, lastSeen: now
    };
    room.players.set('g:' + guestId, player);
    const expiresIn = Math.max(1, Math.floor((room.createdAt + RACE_GUEST_TOKEN_TTL_MS - Date.now()) / 1000));
    const token = jwt.sign({ role: 'guest', guestId, nickname: finalNickname, raceCode: room.code }, JWT_SECRET, { expiresIn });
    raceJoinFailures.delete(limitKey);
    res.json({ token, nickname: finalNickname, raceId: room.raceId, state: buildSnapshot(room, player) });
  } catch (e) {
    res.status(500).json({ error: '加入比赛失败: ' + e.message });
  }
});

app.post('/api/race/leave', raceAuth, async (req, res) => {
  try {
    const { room, player, spectator } = findRaceContext(req);
    const now = Date.now();
    if (!room) {
      return res.status(400).json({ error: '你不在任何房间中' });
    }
    if (room.status === 'finished' || room.status === 'cancelled') {
      if (player) room.players.delete(playerMapKey(player));
      if (spectator) room.spectators.delete(spectatorMapKey(spectator));
      return res.json({ success: true });
    }
    if (spectator) {
      const isHost = isSpectatorHost(room, spectator);
      room.spectators.delete(spectatorMapKey(spectator));
      if (isHost) {
        if (room.status === 'waiting') {
          await cancelRoom(room, 'host_leave', spectator.userId);
        } else {
          transferHostToEarliest(room, now);
          if (room.players.size === 0) await cancelRoom(room, 'all_left', null);
        }
      }
      return res.json({ success: true });
    }
    if (!player) {
      return res.status(400).json({ error: '你不在任何房间中' });
    }
    const key = playerMapKey(player);
    const wasHost = !player.isGuest && room.hostUserId === player.userId;
    if (room.status === 'waiting') {
      room.players.delete(key);
      if (wasHost) {
        await cancelRoom(room, 'host_leave', player.userId);
      } else if (room.players.size === 0) {
        await cancelRoom(room, 'all_left', null);
      }
      return res.json({ success: true });
    }
    if (player.finishedAt) {
      // 已完赛的成绩保留，退出只影响本端；结算仍需展示该名次
      return res.json({ success: true });
    }
    markAbandoned(room, player);
    room.players.delete(key);
    if (wasHost) transferHostToEarliest(room, now);
    if (room.players.size === 0) {
      await cancelRoom(room, 'all_left', null);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '退出比赛失败: ' + e.message });
  }
});

app.post('/api/race/ready', raceAuth, async (req, res) => {
  try {
    const { room, player } = findRaceContext(req);
    if (!room || !player) {
      return res.status(400).json({ error: '观战身份不能准备' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '当前阶段不能修改准备状态' });
    }
    player.ready = !!(req.body && req.body.ready);
    player.lastSeen = Date.now();
    if (!player.isGuest && room.hostUserId === player.userId) room.hostLastSeen = Date.now();
    res.json({ success: true, ready: player.ready });
  } catch (e) {
    res.status(500).json({ error: '准备操作失败: ' + e.message });
  }
});

app.post('/api/race/spectator-setting', authMiddleware, async (req, res) => {
  try {
    const room = findRoomByHost(req.user.id, true);
    if (!room) {
      return res.status(400).json({ error: '你不在主持比赛' });
    }
    if (room.status === 'finished' || room.status === 'cancelled') {
      return res.status(400).json({ error: '比赛已结束' });
    }
    const nextAllow = !!(req.body && req.body.allow);
    room.allowSpectator = nextAllow;
    room.spectatorEnabled = nextAllow;
    initSpectatorState(room);
    if (!room.spectatorEnabled) {
      const fromPlayers = Array.from(room.spectators.values()).filter(s => s.fromPlayer);
      if (room.players.size + fromPlayers.length > room.maxPlayers) {
        room.spectatorEnabled = true;
        room.allowSpectator = true;
        return res.status(400).json({ error: '选手席已满，无法清空观战席' });
      }
      const now = Date.now();
      for (const s of fromPlayers) moveSpectatorToPlayer(room, s, now);
      for (const [key, s] of Array.from(room.spectators.entries())) {
        if (!s.fromPlayer) room.spectators.delete(key);
      }
    }
    room.hostLastSeen = Date.now();
    res.json({ success: true, allowSpectator: room.allowSpectator });
  } catch (e) {
    res.status(500).json({ error: '设置失败: ' + e.message });
  }
});

app.post('/api/race/spectate/settings', authMiddleware, async (req, res) => {
  try {
    const room = findRoomByHost(req.user.id, true);
    if (!room) {
      return res.status(400).json({ error: '你不在主持比赛' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '比赛已开始，不能换席' });
    }
    initSpectatorState(room);
    const body = req.body || {};
    const cap = room.maxSpectators;
    let nextEnabled = room.spectatorEnabled;
    let nextMode = room.spectatorMode;
    let nextSeats = room.spectatorSeats;
    if (body.enabled !== undefined) nextEnabled = !!body.enabled;
    if (body.mode !== undefined) {
      if (body.mode !== 'free' && body.mode !== 'host') {
        return res.status(400).json({ error: '观战模式必须是 free 或 host' });
      }
      nextMode = body.mode;
    }
    if (body.seats !== undefined) {
      const seats = parseInt(body.seats, 10);
      if (!Number.isInteger(seats) || seats < 1 || seats > cap) {
        return res.status(400).json({ error: '观战席位数必须在 1 到 ' + cap + ' 之间' });
      }
      nextSeats = seats;
    }
    const now = Date.now();
    if (!nextEnabled) {
      if (!clearAllSpectators(room, now)) {
        return res.status(400).json({ error: '选手席已满，无法清空观战席' });
      }
    } else if (body.seats !== undefined) {
      const evictError = evictSpectatorsForSeats(room, nextSeats, now);
      if (evictError) return res.status(400).json({ error: evictError });
    }
    room.spectatorEnabled = nextEnabled;
    room.allowSpectator = nextEnabled;
    room.spectatorMode = nextMode;
    room.spectatorSeats = nextEnabled ? nextSeats : room.spectatorSeats;
    room.hostLastSeen = now;
    res.json({
      success: true, enabled: room.spectatorEnabled, mode: room.spectatorMode,
      seats: room.spectatorSeats, cap: cap, spectatorCount: room.spectators.size
    });
  } catch (e) {
    res.status(500).json({ error: '观战设置失败: ' + e.message });
  }
});

app.post('/api/race/spectate/self', raceAuth, async (req, res) => {
  try {
    const ctx = findRaceContext(req);
    const room = ctx.room;
    if (!room || (!ctx.player && !ctx.spectator)) {
      return res.status(400).json({ error: '你不在任何房间中' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '比赛已开始，不能换席' });
    }
    initSpectatorState(room);
    const action = req.body && req.body.action;
    if (action !== 'enter' && action !== 'leave') {
      return res.status(400).json({ error: '无效的换席操作' });
    }
    const now = Date.now();
    const isHost = (ctx.player && ctx.player.userId !== null && ctx.player.userId === room.hostUserId) ||
      isSpectatorHost(room, ctx.spectator);

    if (action === 'enter') {
      if (ctx.spectator) {
        return res.json({ success: true, seat: 'spectator', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size, state: buildSnapshot(room, null, ctx.spectator) });
      }
      if (!room.spectatorEnabled) {
        return res.status(400).json({ error: '本房间未开放观战' });
      }
      if (room.spectatorMode === 'host' && !isHost) {
        return res.status(400).json({ error: '观战由房主安排' });
      }
      if (room.spectators.size >= room.spectatorSeats) {
        return res.status(400).json({ error: '观战席已满（' + room.spectators.size + '/' + room.spectatorSeats + '）' });
      }
      const spec = movePlayerToSpectator(room, playerMapKey(ctx.player), ctx.player, now);
      return res.json({ success: true, seat: 'spectator', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size, state: buildSnapshot(room, null, spec) });
    }

    if (!ctx.spectator) {
      return res.json({ success: true, seat: 'player', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size, state: buildSnapshot(room, ctx.player) });
    }
    if (room.spectatorMode === 'host' && !isHost) {
      return res.status(400).json({ error: '观战由房主安排' });
    }
    if (room.players.size >= room.maxPlayers) {
      return res.status(400).json({ error: '选手席已满' });
    }
    const player = moveSpectatorToPlayer(room, ctx.spectator, now);
    return res.json({ success: true, seat: 'player', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size, state: buildSnapshot(room, player) });
  } catch (e) {
    res.status(500).json({ error: '换席失败: ' + e.message });
  }
});

app.post('/api/race/spectate/assign', authMiddleware, async (req, res) => {
  try {
    const room = findRoomByHost(req.user.id, true);
    if (!room) {
      return res.status(400).json({ error: '你不在主持比赛' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '比赛已开始，不能换席' });
    }
    initSpectatorState(room);
    const body = req.body || {};
    const targetType = body.targetType;
    const to = body.to;
    if (to !== 'spectator' && to !== 'player') {
      return res.status(400).json({ error: '目标席位必须是 spectator 或 player' });
    }
    let playerKey = null;
    let specKey = null;
    if (targetType === 'user') {
      const id = parseInt(body.targetId, 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '目标用户无效' });
      playerKey = 'u:' + id;
      specKey = 'su:' + id;
    } else if (targetType === 'guest') {
      const id = String(body.targetId || '');
      if (!id) return res.status(400).json({ error: '目标游客无效' });
      playerKey = 'g:' + id;
      specKey = 'sg:' + id;
    } else {
      return res.status(400).json({ error: 'targetType 必须是 user 或 guest' });
    }
    const targetPlayer = room.players.get(playerKey);
    const targetSpectator = room.spectators.get(specKey);
    if (!targetPlayer && !targetSpectator) {
      return res.status(400).json({ error: '目标不在房间中' });
    }
    const now = Date.now();
    if (to === 'spectator') {
      if (targetSpectator) {
        return res.json({ success: true, seat: 'spectator', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size });
      }
      if (!room.spectatorEnabled) {
        return res.status(400).json({ error: '本房间未开放观战' });
      }
      if (room.spectators.size >= room.spectatorSeats) {
        return res.status(400).json({ error: '观战席已满（' + room.spectators.size + '/' + room.spectatorSeats + '）' });
      }
      movePlayerToSpectator(room, playerKey, targetPlayer, now);
      room.hostLastSeen = now;
      return res.json({ success: true, seat: 'spectator', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size });
    }
    if (targetPlayer) {
      return res.json({ success: true, seat: 'player', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size });
    }
    if (room.players.size >= room.maxPlayers) {
      return res.status(400).json({ error: '选手席已满' });
    }
    moveSpectatorToPlayer(room, targetSpectator, now);
    room.hostLastSeen = now;
    res.json({ success: true, seat: 'player', spectatorSeats: room.spectatorSeats, spectatorCount: room.spectators.size });
  } catch (e) {
    res.status(500).json({ error: '指定席位失败: ' + e.message });
  }
});

app.post('/api/race/kick', authMiddleware, async (req, res) => {
  try {
    const room = findRoomByHost(req.user.id, true);
    if (!room) {
      return res.status(400).json({ error: '你不在主持比赛' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '当前阶段不能踢人' });
    }
    const { targetUserId, targetGuestId } = req.body || {};
    let key = null;
    if (targetUserId !== undefined) {
      const id = parseInt(targetUserId, 10);
      if (id === req.user.id) {
        return res.status(400).json({ error: '不能踢自己' });
      }
      key = 'u:' + id;
    } else if (targetGuestId) {
      key = 'g:' + String(targetGuestId);
    } else {
      return res.status(400).json({ error: '请选择要踢出的玩家' });
    }
    if (room.players.has(key)) {
      room.players.delete(key);
      room.hostLastSeen = Date.now();
      return res.json({ success: true });
    }
    if (room.spectators && room.spectators.has('s' + key)) {
      room.spectators.delete('s' + key);
      room.hostLastSeen = Date.now();
      return res.json({ success: true });
    }
    return res.status(404).json({ error: '玩家不在房间中' });
    room.hostLastSeen = Date.now();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '踢人失败: ' + e.message });
  }
});

app.post('/api/race/start', authMiddleware, async (req, res) => {
  try {
    const room = findRoomByHost(req.user.id, true);
    if (!room) {
      return res.status(400).json({ error: '你不在主持比赛' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: '当前阶段不能开始比赛' });
    }
    const players = Array.from(room.players.values());
    if (players.length < 1) {
      return res.status(400).json({ error: '没有选手，无法开始' });
    }
    const notReady = players.filter(p => !p.ready).map(p => p.nickname);
    if (notReady.length > 0) {
      return res.status(400).json({ error: '还有玩家未准备：' + notReady.join('、') });
    }
    const article = await db.get('SELECT title, content FROM articles WHERE id = ?', room.articleId);
    if (!article) {
      return res.status(400).json({ error: '文章不存在' });
    }
    room.articleTitle = article.title;
    room.content = article.content;
    room.charCount = article.content.length;
    room.status = 'countdown';
    room.startsAt = Date.now() + 3000;
    room.finishedCount = 0;
    await db.run(
      "UPDATE races SET status = 'countdown', content_snapshot = ?, char_count = ?, player_count = ?, started_at = ? WHERE id = ?",
      room.content, room.charCount, players.length, formatDateTime(room.startsAt), room.raceId
    );
    room.hostLastSeen = Date.now();
    const hostPlayer = room.players.get('u:' + req.user.id);
    res.json({ success: true, ...buildSnapshot(room, hostPlayer) });
  } catch (e) {
    res.status(500).json({ error: '开始比赛失败: ' + e.message });
  }
});

app.post('/api/race/tick', raceAuth, async (req, res) => {
  try {
    const { room, player, spectator } = findRaceContext(req);
    if (!room || (!player && !spectator)) {
      return res.status(400).json({ error: '你不在任何房间中' });
    }
    updateRoomPhase(room);
    if (spectator) {
      spectator.lastSeen = Date.now();
      if (isSpectatorHost(room, spectator)) room.hostLastSeen = spectator.lastSeen;
      return res.json(buildSnapshot(room, null, spectator));
    }
    player.lastSeen = Date.now();
    if (!player.isGuest && room.hostUserId === player.userId) room.hostLastSeen = Date.now();
    if (room.status === 'racing' && !player.finishedAt && req.body && req.body.progress !== undefined) {
      const p = Number(req.body.progress);
      if (Number.isFinite(p) && p >= 0) {
        player.progress = Math.max(player.progress || 0, Math.min(Math.floor(p), room.charCount));
      }
    }
    res.json(buildSnapshot(room, player));
  } catch (e) {
    res.status(500).json({ error: '获取比赛状态失败: ' + e.message });
  }
});

app.post('/api/race/finish', raceAuth, async (req, res) => {
  try {
    const { room, player } = findRaceContext(req);
    if (!room || !player) {
      return res.status(400).json({ error: '观战身份不能提交成绩' });
    }
    if (player.finishedAt) {
      return res.json({ rank: player.rank });
    }
    updateRoomPhase(room);
    if (room.status !== 'racing') {
      return res.status(400).json({ error: '比赛尚未开始或已结束' });
    }
    const accuracy = Number(req.body && req.body.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
      return res.status(400).json({ error: '准确率数据异常' });
    }
    const now = Date.now();
    const elapsedMs = now - room.startsAt;
    if (elapsedMs <= 0) {
      return res.status(400).json({ error: '比赛尚未开始' });
    }
    const speed = Math.round(room.charCount * 60000 / elapsedMs);
    const timeSeconds = Math.round(elapsedMs / 1000);
    player.finishedAt = now;
    player.speed = speed;
    player.accuracy = accuracy;
    player.timeSeconds = timeSeconds;
    player.rank = ++room.finishedCount;
    player.progress = room.charCount;
    if (!player.isGuest && room.hostUserId === player.userId) room.hostLastSeen = now;
    const source = player.isGuest ? 'race_guest' : 'race';
    const articleRow = await db.get('SELECT id FROM articles WHERE id = ?', room.articleId);
    const scoreArticleId = articleRow ? room.articleId : null;
    try {
      await db.run(
        'INSERT INTO scores (user_id, nickname, speed, accuracy, time_seconds, article_id, ip_address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        player.userId, player.nickname, speed, accuracy, timeSeconds, scoreArticleId, player.ip || '', source
      );
    } catch (e) {
      console.error('[比赛] 写入成绩失败:', e.message);
    }
    await upsertParticipant(room, player);
    const allFinished = Array.from(room.players.values()).every(p => p.finishedAt);
    if (allFinished) await finalizeRoom(room, 'all_finished');
    res.json({ rank: player.rank });
  } catch (e) {
    res.status(500).json({ error: '完赛失败: ' + e.message });
  }
});

app.get('/api/race/list', async (req, res) => {
  try {
    if (!checkListRate(req.ip || '')) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    const list = Array.from(roomRegistry.values())
      .filter(r => r.isPublic && r.status === 'waiting')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map(r => ({
        code: r.code, hostNickname: r.hostNickname, articleTitle: r.articleTitle,
        charCount: r.charCount, playerCount: r.players.size, maxPlayers: r.maxPlayers,
        spectatorEnabled: !!r.spectatorEnabled, spectatorMode: r.spectatorMode || 'free',
        spectatorSeats: r.spectatorSeats || spectatorCap(r.maxPlayers),
        spectatorCount: r.spectators ? r.spectators.size : 0,
        status: r.status, createdAt: r.createdAt
      }));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: '获取比赛列表失败' });
  }
});

app.get('/api/race/active', raceActiveAuth, async (req, res) => {
  try {
    if (req.raceIsGuest) {
      const room = findRoomByCode(req.raceActiveRoomCode);
      if (!room || !isActiveRoom(room)) return res.json({ code: null });
      const player = room.players.get('g:' + req.raceActiveGuestId) || null;
      const spectator = room.spectators ? room.spectators.get('sg:' + req.raceActiveGuestId) || null : null;
      if (!player && !spectator) return res.json({ code: null });
      return res.json({ code: room.code, state: buildSnapshot(room, player, spectator), isSpectator: !player });
    }
    const room = findRoomByUser(req.user.id, true);
    if (room) {
      const player = room.players.get('u:' + req.user.id);
      if (player) return res.json({ code: room.code, state: buildSnapshot(room, player), isSpectator: false });
    }
    for (const r of roomRegistry.values()) {
      if (!isActiveRoom(r)) continue;
      if (r.spectators && r.spectators.has('su:' + req.user.id)) {
        return res.json({ code: r.code, state: buildSnapshot(r, null, r.spectators.get('su:' + req.user.id)), isSpectator: true });
      }
    }
    res.json({ code: null });
  } catch (e) {
    res.status(500).json({ error: '查询比赛状态失败' });
  }
});

app.get('/api/race/:code', async (req, res) => {
  try {
    if (!checkListRate(req.ip || '')) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    const code = String(req.params.code || '').toUpperCase();
    const room = findRoomByCode(code);
    if (!room) {
      const dbRace = await db.get('SELECT status FROM races WHERE code = ?', code);
      if (dbRace && dbRace.status === 'aborted') {
        return res.status(400).json({ error: '比赛已中断' });
      }
      return res.status(400).json({ error: '房间不存在或密码错误' });
    }
    if (!room.isPublic) {
      const pw = req.query.password;
      if (!pw || !room.passwordHash || !bcrypt.compareSync(String(pw), room.passwordHash)) {
        return res.status(400).json({ error: '房间不存在或密码错误' });
      }
    }
    res.json({
      code: room.code, status: room.status, articleTitle: room.articleTitle,
      charCount: room.charCount, maxPlayers: room.maxPlayers, playerCount: room.players.size,
      hostUserId: room.hostUserId, hostNickname: room.hostNickname, isPublic: room.isPublic,
      createdAt: room.createdAt, cancelledReason: room.cancelledReason || null,
      allowSpectator: room.allowSpectator !== false, spectatorCount: room.spectators ? room.spectators.size : 0,
      spectatorEnabled: room.spectatorEnabled !== false, spectatorMode: room.spectatorMode || 'free',
      spectatorSeats: room.spectatorSeats || spectatorCap(room.maxPlayers),
      players: Array.from(room.players.values()).map(p => ({
        userId: p.userId, guestId: p.guestId, nickname: p.nickname,
        isHost: p.userId !== null && p.userId === room.hostUserId,
        isGuest: p.isGuest, ready: p.ready, progress: p.progress, rank: p.rank
      }))
    });
  } catch (e) {
    res.status(500).json({ error: '获取房间详情失败' });
  }
});

app.get('/api/admin/races', authMiddleware, adminMiddleware, (req, res) => {
  const list = Array.from(roomRegistry.values()).map(r => ({
    code: r.code, raceId: r.raceId, hostUserId: r.hostUserId, hostNickname: r.hostNickname,
    status: r.status, articleId: r.articleId, articleTitle: r.articleTitle, charCount: r.charCount,
    maxPlayers: r.maxPlayers, playerCount: r.players.size, isPublic: r.isPublic,
    createdAt: r.createdAt, startsAt: r.startsAt, finishedAt: r.finishedAt,
    cancelledReason: r.cancelledReason, cancelledBy: r.cancelledBy,
    players: Array.from(r.players.values()).map(p => ({
      userId: p.userId, guestId: p.guestId, nickname: p.nickname, isGuest: p.isGuest,
      ready: p.ready, progress: p.progress, rank: p.rank
    }))
  }));
  res.json(list);
});

app.post('/api/admin/races/:code/cancel', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const room = findRoomByCode(req.params.code);
    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }
    await cancelRoom(room, 'admin', req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '解散房间失败: ' + e.message });
  }
});

app.post('/api/admin/races/:code/kick', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const room = findRoomByCode(req.params.code);
    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }
    const { userId, guestId } = req.body || {};
    let key = null;
    if (userId !== undefined) {
      key = 'u:' + parseInt(userId, 10);
    } else if (guestId) {
      key = 'g:' + String(guestId);
    } else {
      return res.status(400).json({ error: '请选择要踢出的玩家' });
    }
    if (!room.players.has(key)) {
      return res.status(404).json({ error: '玩家不在房间中' });
    }
    room.players.delete(key);
    console.warn('[比赛] 管理员踢出玩家', { code: room.code, userId, guestId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '踢出玩家失败: ' + e.message });
  }
});

app.get('/api/admin/race-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    res.json(await getRaceSettings());
  } catch (e) {
    res.status(500).json({ error: '获取比赛设置失败' });
  }
});

app.put('/api/admin/race-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const maxRaw = body.maxRooms !== undefined ? body.maxRooms : body.race_max_rooms;
    const enabledRaw = body.enabled !== undefined ? body.enabled : body.race_enabled;
    if (maxRaw === undefined && enabledRaw === undefined) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }
    if (maxRaw !== undefined) {
      const n = parseInt(maxRaw, 10);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return res.status(400).json({ error: '房间数上限必须在 1 到 50 之间' });
      }
      await setSetting('race_max_rooms', String(n));
    }
    if (enabledRaw !== undefined) {
      const isTrue = enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1 || enabledRaw === '1';
      const isFalse = enabledRaw === false || enabledRaw === 'false' || enabledRaw === 0 || enabledRaw === '0';
      if (!isTrue && !isFalse) {
        return res.status(400).json({ error: '开关值必须是 true 或 false' });
      }
      await setSetting('race_enabled', isTrue ? 'true' : 'false');
    }
    res.json(await getRaceSettings());
  } catch (e) {
    res.status(500).json({ error: '保存比赛设置失败' });
  }
});

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
    const ip = req.ip || '';
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      return res.status(403).json({ error: '首次初始化只允许在服务器本机进行' });
    }
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
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'admin', token_version: 0 }, JWT_SECRET, { expiresIn: '7d' });
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
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail && normalizedEmail.ok === false) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    if (normalizedEmail) {
      const emailExisting = await db.get('SELECT id FROM users WHERE email = ?', normalizedEmail);
      if (emailExisting) {
        return res.status(400).json({ error: '邮箱已被注册' });
      }
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, email, password_hash, role, nickname) VALUES (?, ?, ?, ?, ?)', username, normalizedEmail || null, hash, 'user', username);
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user', token_version: 0 }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username, nickname: username, email: normalizedEmail || '', role: 'user' } });
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
    const loginKey = (req.ip || '') + '|' + String(username).trim().toLowerCase();
    const now = Date.now();
    const attempt = loginFailures.get(loginKey);
    if (attempt && now - attempt.windowStart > LOGIN_WINDOW_MS) {
      loginFailures.delete(loginKey);
    } else if (attempt && attempt.lockedUntil > now) {
      return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) {
      recordLoginFailure(loginKey);
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      recordLoginFailure(loginKey);
      return res.status(400).json({ error: '用户名或密码错误' });
    }
    loginFailures.delete(loginKey);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, token_version: user.token_version || 0 }, JWT_SECRET, { expiresIn: '7d' });
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

    let resolvedEmail = user.email;
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail && normalizedEmail.ok === false) {
        return res.status(400).json({ error: '邮箱格式不正确' });
      }
      resolvedEmail = normalizedEmail;
    }
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: '修改密码需要提供当前密码' });
      }
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(400).json({ error: '当前密码不正确' });
      }
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      const newHash = bcrypt.hashSync(newPassword, 10);
      if (username && username !== user.username) {
        const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', username, user.id);
        if (existing) {
          return res.status(400).json({ error: '用户名已存在' });
        }
        await db.run('UPDATE users SET username = ?, email = ?, password_hash = ?, nickname = ?, token_version = token_version + 1 WHERE id = ?', username, resolvedEmail, newHash, username, user.id);
        const token = jwt.sign({ id: user.id, username, role: user.role, token_version: (user.token_version || 0) + 1 }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username, nickname: username, email: resolvedEmail || '', role: user.role } });
        return;
      }
      await db.run('UPDATE users SET email = ?, password_hash = ?, token_version = token_version + 1 WHERE id = ?', resolvedEmail, newHash, user.id);
      res.json({ success: true });
      return;
    }

    if (username && username !== user.username) {
      const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', username, user.id);
      if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      await db.run('UPDATE users SET username = ?, email = ?, nickname = ? WHERE id = ?', username, resolvedEmail, username, user.id);
      const token = jwt.sign({ id: user.id, username, role: user.role, token_version: user.token_version || 0 }, JWT_SECRET, { expiresIn: '7d' });
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
    let bumpTokenVersion = false;
    if (username) { updates.push('username = ?'); params.push(username); updates.push('nickname = ?'); params.push(username); }
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail && normalizedEmail.ok === false) {
        return res.status(400).json({ error: '邮箱格式不正确' });
      }
      updates.push('email = ?');
      params.push(normalizedEmail);
    }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '角色必须为 admin 或 user' });
      }
      if (role === 'user' && user.role === 'admin') {
        const adminCount = (await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")).count;
        if (adminCount <= 1) {
          return res.status(400).json({ error: '不能降级唯一的管理员账户' });
        }
      }
      updates.push('role = ?'); params.push(role);
      bumpTokenVersion = true;
    }
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(password, 10));
      bumpTokenVersion = true;
    }
    if (bumpTokenVersion) updates.push('token_version = token_version + 1');
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
    const isBrief = req.query.brief === '1';
    const lenFn = isMySQL(db) ? 'CHAR_LENGTH' : 'LENGTH';
    const substrFn = isMySQL(db) ? 'SUBSTRING' : 'SUBSTR';

    if (isBrief) {
      const briefFields = `a.id, a.title, a.category_id, a.difficulty, a.status, a.is_offline, a.difficulty_score,
        ${lenFn}(a.content) AS content_length,
        ${substrFn}(a.content, 1, 120) AS content_preview,
        c.name AS category_name`;
      const articles = await db.all(
        `SELECT ${briefFields} FROM articles a LEFT JOIN categories c ON a.category_id = c.id ${whereStr} ORDER BY a.id DESC`,
        ...params
      );
      return res.json(articles);
    }

    const articles = await db.all(
      `SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id ${whereStr} ORDER BY a.id DESC`,
      ...params
    );

    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取文章列表失败' });
  }
});

app.get('/api/articles/offline', async (req, res) => {
  try {
    const isBrief = req.query.brief === '1';
    const lenFn = isMySQL(db) ? 'CHAR_LENGTH' : 'LENGTH';
    const substrFn = isMySQL(db) ? 'SUBSTRING' : 'SUBSTR';

    if (isBrief) {
      const articles = await db.all(
        `SELECT id, title, category_id, difficulty, status, is_offline, difficulty_score,
          ${lenFn}(content) AS content_length,
          ${substrFn}(content, 1, 120) AS content_preview
         FROM articles WHERE is_offline = 1 AND status = 'approved' ORDER BY id DESC`
      );
      return res.json(articles);
    }

    const articles = await db.all(
      "SELECT * FROM articles WHERE is_offline = 1 AND status = 'approved' ORDER BY id DESC"
    );
    res.json(articles);
  } catch (e) {
    res.status(500).json({ error: '获取离线文章失败' });
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

app.get('/api/articles/:id', async (req, res) => {
  try {
    let isAdmin = false;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        if (decoded.role === 'admin') isAdmin = true;
      } catch (e) {}
    }

    const whereStatus = isAdmin ? '' : " AND status = 'approved'";
    const article = await db.get(
      `SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?${whereStatus}`,
      req.params.id
    );

    if (!article) {
      return res.status(404).json({ error: '文章不存在' });
    }
    res.json(article);
  } catch (e) {
    res.status(500).json({ error: '获取文章详情失败' });
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

app.put('/api/articles/:id/offline', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { is_offline } = req.body;
    if (typeof is_offline !== 'number' || (is_offline !== 0 && is_offline !== 1)) {
      return res.status(400).json({ error: 'is_offline 必须为 0 或 1' });
    }
    const existing = await db.get('SELECT id FROM articles WHERE id = ?', req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '文章不存在' });
    }
    await db.run('UPDATE articles SET is_offline = ? WHERE id = ?', is_offline, req.params.id);
    res.json({ success: true, id: parseInt(req.params.id), is_offline });
  } catch (e) {
    res.status(500).json({ error: '更新离线标记失败: ' + e.message });
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
      await tdb.run('DELETE FROM scores WHERE article_id = ?', req.params.id);
      await tdb.run('DELETE FROM articles WHERE id = ?', req.params.id);
    })();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '删除文章失败: ' + e.message });
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
      whereClauses.push('s.user_id IS NOT NULL');
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const scores = await db.all(
      `SELECT s.*, a.title as article_title, u.avatar, COALESCE(s.nickname, u.nickname) AS nickname FROM scores s LEFT JOIN articles a ON s.article_id = a.id LEFT JOIN users u ON s.user_id = u.id ${whereStr} ORDER BY s.speed DESC, s.accuracy DESC LIMIT 500`,
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

    let userId = null;
    let userRow = null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        userRow = await db.get('SELECT id, username, nickname FROM users WHERE id = ?', decoded.id);
        if (userRow) userId = userRow.id;
      } catch (e) {}
    }
    const effectiveNickname = userId ? (userRow.nickname || userRow.username) : nickname;

    if (!effectiveNickname || speed === undefined || accuracy === undefined) {
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

    const sensitiveWord = await containsSensitiveWord(effectiveNickname);
    if (sensitiveWord) {
      return res.status(400).json({ error: '昵称包含敏感词: ' + sensitiveWord });
    }

    const hasArticle = !!article_id;
    if (hasArticle && time_seconds > 0) {
      const lengthExpr = isMySQL(db) ? 'CHAR_LENGTH(content)' : 'LENGTH(content)';
      const articleRow = await db.get(`SELECT ${lengthExpr} AS char_count FROM articles WHERE id = ?`, article_id);
      if (articleRow && articleRow.char_count > 0) {
        const theoretical = (articleRow.char_count * 60) / time_seconds;
        if (Math.abs(speed - theoretical) / theoretical > 0.3) {
          console.warn('[成绩校验] 拒绝偏差过大的成绩', {
            user_id: userId,
            article_id,
            reported_speed: speed,
            theoretical_speed: Number(theoretical.toFixed(2)),
            char_count: articleRow.char_count,
            time_seconds
          });
          return res.status(400).json({ error: '成绩与文章长度不符，已拒绝' });
        }
      }
    }

    const finalSource = hasArticle ? (source || 'normal') : 'unverified';
    const ip = req.ip || req.connection.remoteAddress || '';
    const storedSpeed = Math.round(speed);
    const result = await db.run('INSERT INTO scores (user_id, nickname, speed, accuracy, time_seconds, article_id, ip_address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', userId, effectiveNickname, storedSpeed, accuracy, time_seconds || 0, hasArticle ? article_id : null, ip, finalSource);
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
  execFile('python', [crawlerPath, '--url', url, '--preview'], { timeout: 90000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf-8' }, (error, stdout, stderr) => {
    const stdoutText = (stdout || '').trim();
    if (error) {
      // crawler.py 出错时通过 sys.exit(1) 退出，但友好错误信息写在 stdout 的 JSON 里，优先提取
      if (stdoutText) {
        try {
          const parsed = JSON.parse(stdoutText);
          if (parsed && parsed.error) {
            return res.status(500).json({ error: parsed.error });
          }
          parsed._source_url = url;
          return res.json(parsed);
        } catch (e) { /* stdout 非合法 JSON，走下方通用错误 */ }
      }
      if (error.killed) {
        return res.status(500).json({ error: '抓取超时（超过90秒），该网站响应过慢或不可达' });
      }
      const detail = stderr ? stderr.trim().split('\n').slice(-3).join(' ') : error.message;
      return res.status(500).json({ error: '爬虫执行失败: ' + detail });
    }
    try {
      const result = JSON.parse(stdoutText);
      result._source_url = url;
      res.json(result);
    } catch (e) {
      res.json({ title: '', content: stdoutText, _source_url: url });
    }
  });
});

app.post('/api/crawl/search', authMiddleware, adminMiddleware, (req, res) => {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: '请输入关键词' });
  }
  const crawlerPath = path.join(__dirname, 'crawler.py');
  if (!fs.existsSync(crawlerPath)) {
    return res.status(500).json({ error: '爬虫脚本不存在' });
  }
  execFile('python', [crawlerPath, '--keyword', keyword.trim(), '--search-limit', '12'], { timeout: 45000, maxBuffer: 5 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf-8' }, (error, stdout, stderr) => {
    const stdoutText = (stdout || '').trim();
    if (error) {
      // 优先从 stdout 提取 crawler.py 返回的友好错误
      if (stdoutText) {
        try {
          const parsed = JSON.parse(stdoutText);
          if (parsed && parsed.error) {
            return res.status(500).json({ error: parsed.error });
          }
          return res.json(parsed);
        } catch (e) { /* stdout 非合法 JSON，走下方通用错误 */ }
      }
      if (error.killed) {
        return res.status(500).json({ error: '搜索超时，请稍后重试' });
      }
      const detail = stderr ? stderr.trim().split('\n').slice(-3).join(' ') : error.message;
      return res.status(500).json({ error: '搜索失败: ' + detail });
    }
    try {
      const result = JSON.parse(stdoutText);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: '解析搜索结果失败' });
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
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '图片不能超过 5MB' });
      }
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
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', hash, req.user.id);
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
      req.user.id
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

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const items = [];
    const announcement = await getActiveAnnouncement();
    if (announcement) {
      items.push({
        id: 'announcement:' + announcement.id,
        type: 'announcement',
        title: announcement.title || '站点公告',
        body: announcement.content || '',
        time: announcement.created_at || '',
        link: null
      });
    }
    const rows = await db.all(
      `SELECT r.code, r.status, r.char_count, r.finished_at, r.created_at,
              rp.rank_no, rp.speed, rp.accuracy,
              (SELECT COUNT(*) FROM race_participants rp2 WHERE rp2.race_id = r.id) AS total_players
       FROM race_participants rp
       JOIN races r ON r.id = rp.race_id
       WHERE rp.user_id = ? AND r.status IN ('finished', 'aborted')
       ORDER BY r.finished_at DESC, r.id DESC
       LIMIT 10`,
      req.user.id
    );
    for (const row of rows) {
      const rank = row.rank_no == null ? '—' : row.rank_no;
      const speed = row.speed == null ? '—' : Math.round(row.speed);
      const accuracy = row.accuracy == null ? '—' : Math.round(row.accuracy);
      items.push({
        id: 'race:' + row.code,
        type: 'race',
        title: '比赛 ' + row.code + (row.status === 'aborted' ? ' 已中断' : ' 已结束'),
        body: '你第 ' + rank + ' 名 / 共 ' + (row.total_players || 0) + ' 人 · ' +
          (row.char_count || 0) + ' 字 · ' + speed + ' 字/分 · ' + accuracy + '%',
        time: row.finished_at || row.created_at || '',
        link: 'race.html?code=' + encodeURIComponent(row.code)
      });
    }
    items.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    res.json({ items: items.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: '获取通知失败' });
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

const ALLOWED_TABLES = ['users', 'articles', 'categories', 'scores', 'announcements', 'settings', 'error_logs', 'private_articles', 'races', 'race_participants'];

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
    const sensitivePattern = /password|hash|secret|token/i;
    const visibleColumns = columns.filter(column => !sensitivePattern.test(column.name));
    const visibleRows = rows.map(row => {
      const filtered = {};
      Object.keys(row).forEach(key => {
        if (!sensitivePattern.test(key)) filtered[key] = row[key];
      });
      return filtered;
    });

    res.json({
      table,
      columns: visibleColumns.map(column => ({
        name: column.name,
        type: column.type,
        pk: column.pk === 1,
        notnull: column.notnull === 1,
        defaultValue: column.dflt_value
      })),
      primaryKey: pk,
      rows: visibleRows,
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

const versionFile = path.join(__dirname, 'VERSION');
const contractFile = path.join(__dirname, 'CONTRACT_VERSION');
let versionRaw;
let contractRaw;
try {
  versionRaw = fs.readFileSync(versionFile, 'utf8').trim();
  contractRaw = fs.readFileSync(contractFile, 'utf8').trim();
} catch (e) {
  throw new Error('读取版本文件失败: ' + e.message);
}
if (!/^\d+\.\d+\.\d{6}\.\d{4}$/.test(versionRaw)) {
  throw new Error(`VERSION 格式非法: "${versionRaw}"，期望 大版本.小版本.YYMMDD.HHMM`);
}
if (!/^v\d+$/.test(contractRaw)) {
  throw new Error(`CONTRACT_VERSION 格式非法: "${contractRaw}"，期望 v 加整数`);
}
const versionInfo = {
  version: versionRaw,
  name: 'Typing',
  fullName: 'Typing-' + versionRaw,
  contractVersion: contractRaw
};

app.get('/api/version', (req, res) => {
  res.json(versionInfo);
});

app.get('/api/asset-version', (req, res) => {
  res.json({ version: assetVersion, files: assetHashes });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: '接口不存在：' + req.method + ' ' + req.path });
  }
  next();
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法 JSON' });
  }
  if (req.path.startsWith('/api') && !res.headersSent) {
    return res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
  }
  next(err);
});

initDatabase().then(() => {
  startRaceCleanup();
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
