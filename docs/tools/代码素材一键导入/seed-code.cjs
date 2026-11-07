#!/usr/bin/env node
/* 代码素材一键导入（幂等）
 * 用途：给一个“干净”的库补上 3 个语言分类 + 5 篇代码素材 + code_category_ids 设置。
 * 前置：项目根目录下存在 data\typing.db，且 node_modules\better-sqlite3 已安装。
 * 重复运行安全：已存在同名分类/文章会跳过，不会重复插入。
 */
'use strict';

const path = require('path');
const fs = require('fs');

// 1) 找项目根目录：优先命令行参数，其次本脚本所在目录，再往上找 server.js + data
function findRoot() {
  const arg = process.argv[2];
  const candidates = [];
  if (arg) candidates.push(path.resolve(arg));
  candidates.push(__dirname);
  let cur = __dirname;
  for (let i = 0; i < 4; i++) {
    cur = path.dirname(cur);
    candidates.push(cur);
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'data', 'typing.db')) && fs.existsSync(path.join(dir, 'server.js'))) return dir;
    if (fs.existsSync(path.join(dir, 'data', 'typing.db')) && fs.existsSync(path.join(dir, 'node_modules'))) return dir;
  }
  return null;
}

const ROOT = findRoot();
if (!ROOT) {
  console.error('');
  console.error('[×] 没找到项目目录（需要有 data\\typing.db 和 node_modules）。');
  console.error('    请把本工具解压到项目根目录（和 server.js 同一层）后重试，');
  console.error('    或双击后按提示输入项目路径。');
  process.exit(1);
}
console.log('[·] 项目目录:', ROOT);

const modPath = path.join(ROOT, 'node_modules', 'better-sqlite3');
if (!fs.existsSync(modPath)) {
  console.error('[×] 没找到 ' + modPath);
  console.error('    说明这个项目还没装依赖，先执行一次 npm install 再运行本工具。');
  process.exit(1);
}
const Database = require(modPath);
const dbFile = path.join(ROOT, 'data', 'typing.db');
console.log('[·] 数据库:', dbFile);

const LANGS = ['JavaScript', 'Python', 'SQL'];
const ITEMS = [
  {
    cat: 'JavaScript', title: 'JS-数组求和', difficulty: 1,
    body: ['const nums = [1, 2, 3, 4];', 'const total = nums.reduce((a, b) => a + b, 0);', 'console.log(total > 5 ? "big" : "small");'].join('\n')
  },
  {
    cat: 'JavaScript', title: 'JS-函数与默认值', difficulty: 1,
    body: ['function greet(user) {', '  const name = user.name || "guest";', '  return "hi, " + name;', '}', 'console.log(greet({ name: "Amy" }));'].join('\n')
  },
  {
    cat: 'Python', title: 'PY-字典排序取前二', difficulty: 1,
    body: ['def top_items(prices):', '  items = sorted(prices.items(), key=lambda kv: -kv[1])', '  return [k for k, v in items[:2]]', '', 'print(top_items({"a": 3, "b": 9, "c": 5}))'].join('\n')
  },
  {
    cat: 'Python', title: 'PY-逐行解析带异常', difficulty: 2,
    body: ['def parse_all(lines):', '  out = []', '  for line in lines:', '    try:', '      out.append(int(line))', '    except ValueError:', '      continue', '  return out', '', 'print(parse_all(["1", "x", "3"]))'].join('\n')
  },
  {
    cat: 'SQL', title: 'SQL-按速度分组取名次', difficulty: 2,
    body: ['SELECT u.name, CASE WHEN s.speed >= 200 THEN "fast" ELSE "slow" END AS lvl', 'FROM scores s JOIN users u ON u.id = s.user_id', 'WHERE s.speed > 0', 'ORDER BY s.speed DESC', 'LIMIT 10;'].join('\n')
  }
];

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

try {
  const hasCats = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'").get();
  const hasArticles = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'").get();
  if (!hasCats || !hasArticles) {
    console.error('[×] 数据库里没有 categories / articles 表，说明这个库还没初始化。');
    console.error('    先用面板启动一次服务（会自动建表）再运行本工具。');
    process.exit(1);
  }

  let addedCats = 0, addedArticles = 0, skipped = 0;
  const ids = {};

  db.transaction(function () {
    for (const name of LANGS) {
      const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
      if (row) { ids[name] = row.id; continue; }
      const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
      ids[name] = Number(r.lastInsertRowid);
      addedCats++;
      console.log('[+] 新建分类:', name, '(id=' + ids[name] + ')');
    }
    const admin = db.prepare("SELECT id FROM users ORDER BY (role = 'admin') DESC, id ASC LIMIT 1").get();
    for (const it of ITEMS) {
      const exists = db.prepare('SELECT id FROM articles WHERE title = ?').get(it.title);
      if (exists) { skipped++; console.log('[=] 已存在，跳过:', it.title); continue; }
      db.prepare("INSERT INTO articles (title, content, category_id, difficulty, status, author_id, source) VALUES (?, ?, ?, ?, 'approved', ?, '代码素材')")
        .run(it.title, it.body, ids[it.cat], it.difficulty, admin ? admin.id : null);
      addedArticles++;
      console.log('[+] 新建素材:', it.title, '(' + it.body.length + ' 字符)');
    }
    const selected = [ids['JavaScript'], ids['Python'], ids['SQL']];
    db.prepare("INSERT INTO settings (key, value) VALUES ('code_category_ids', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(selected));
  })();

  // 复核
  const selected = JSON.parse((db.prepare("SELECT value FROM settings WHERE key='code_category_ids'").get() || {}).value || '[]');
  const rows = db.prepare('SELECT c.name AS name, COUNT(a.id) AS n FROM categories c LEFT JOIN articles a ON a.category_id = c.id GROUP BY c.id').all();
  const codeList = db.prepare("SELECT title FROM articles WHERE source = '代码素材' ORDER BY id").all();

  console.log('');
  console.log('================ 结果 ================');
  console.log('新建分类:', addedCats, '个 | 新建素材:', addedArticles, '篇 | 跳过已存在:', skipped, '篇');
  console.log('语言分类 id (code_category_ids):', JSON.stringify(selected));
  console.log('各分类文章数:');
  for (const r of rows) console.log('  - ' + r.name + ': ' + r.n);
  console.log('代码素材清单:');
  for (const a of codeList) console.log('  - ' + a.title);
  console.log('======================================');
  console.log('');
  console.log('完成。请到页面上确认：');
  console.log('  1) 练习页切到「代码模式」，下拉应能看到上面这些素材');
  console.log('  2) 比赛 → 建房，应出现「代码房间」标签');
  console.log('  3) 管理页 → 代码模式管理 → 语言分类，三个开关应为打开状态');
  db.close();
  process.exit(0);
} catch (e) {
  console.error('');
  console.error('[×] 导入失败:', e && e.message ? e.message : e);
  console.error('    常见原因：服务正在运行并独占数据库（先停服务再试），或该目录没有写权限。');
  try { db.close(); } catch (_) {}
  process.exit(1);
}
