/* 全新部署后一次性导入：3 个语言分类 + 5 篇代码素材 + code_category_ids
 * 用法：
 *   1) 先把服务停掉
 *   2) 把本文件放到项目根目录（与 server.js 同级）
 *   3) node seed-code.cjs
 *   4) 启动服务，练习页「代码模式」应看到 5 篇
 * 幂等：重复跑不会重复插入（按标题去重）
 */
const Database = require('better-sqlite3');
const db = new Database('./data/typing.db');

const CATS = [
  { name: 'JavaScript', difficulty: 1 },
  { name: 'Python', difficulty: 1 },
  { name: 'SQL', difficulty: 1 }
];

const ARTICLES = [
  { cat: 'JavaScript', title: 'JS-数组求和', difficulty: 1, content: [
    'const nums = [1, 2, 3, 4];',
    'const total = nums.reduce((a, b) => a + b, 0);',
    'console.log(total > 5 ? "big" : "small");'
  ].join('\n') },
  { cat: 'JavaScript', title: 'JS-函数与默认值', difficulty: 1, content: [
    'function greet(user) {',
    '  const name = user.name || "guest";',
    '  return "hi, " + name;',
    '}',
    'console.log(greet({ name: "Amy" }));'
  ].join('\n') },
  { cat: 'Python', title: 'PY-字典排序取前二', difficulty: 1, content: [
    'def top_items(prices):',
    '  items = sorted(prices.items(), key=lambda kv: -kv[1])',
    '  return [k for k, v in items[:2]]',
    '',
    'print(top_items({"a": 3, "b": 9, "c": 5}))'
  ].join('\n') },
  { cat: 'Python', title: 'PY-逐行解析带异常', difficulty: 2, content: [
    'def parse_all(lines):',
    '  out = []',
    '  for line in lines:',
    '    try:',
    '      out.append(int(line))',
    '    except ValueError:',
    '      continue',
    '  return out',
    '',
    'print(parse_all(["1", "x", "3"]))'
  ].join('\n') },
  { cat: 'SQL', title: 'SQL-按速度分组取名次', difficulty: 2, content: [
    'SELECT u.name, CASE WHEN s.speed >= 200 THEN "fast" ELSE "slow" END AS lvl',
    'FROM scores s JOIN users u ON u.id = s.user_id',
    'WHERE s.speed > 0',
    'ORDER BY s.speed DESC',
    'LIMIT 10;'
  ].join('\n') }
];

const idsByCat = {};
const findCat = db.prepare('SELECT id FROM categories WHERE name = ?');
const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');

db.transaction(() => {
  for (const c of CATS) {
    let row = findCat.get(c.name);
    if (!row) {
      const info = insertCat.run(c.name);
      row = { id: Number(info.lastInsertRowid) };
      console.log('新建分类:', c.name, 'id=' + row.id);
    } else {
      console.log('分类已存在:', c.name, 'id=' + row.id);
    }
    idsByCat[c.name] = row.id;
  }

  const adminRow = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const authorId = adminRow ? adminRow.id : null;
  const findArticle = db.prepare('SELECT id FROM articles WHERE title = ?');
  const insertArticle = db.prepare(
    "INSERT INTO articles (title, content, category_id, difficulty, status, author_id, source) VALUES (?, ?, ?, ?, 'approved', ?, '代码素材')"
  );
  for (const a of ARTICLES) {
    if (findArticle.get(a.title)) {
      console.log('已存在，跳过:', a.title);
      continue;
    }
    const info = insertArticle.run(a.title, a.content, idsByCat[a.cat], a.difficulty, authorId);
    console.log('新增素材:', a.title, 'id=' + Number(info.lastInsertRowid), '(' + a.content.length + ' 字符)');
  }

  const idsJson = JSON.stringify([idsByCat['JavaScript'], idsByCat['Python'], idsByCat['SQL']]);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('code_category_ids', idsJson);
  console.log('code_category_ids = ' + idsJson);
})();

console.log('');
console.log('各分类文章数:', db.prepare('SELECT c.name, COUNT(a.id) n FROM categories c LEFT JOIN articles a ON a.category_id = c.id GROUP BY c.id').all());
console.log('代码素材:', db.prepare('SELECT id, title, length(content) n, difficulty FROM articles WHERE category_id IN (SELECT id FROM categories WHERE name IN (\'JavaScript\',\'Python\',\'SQL\'))').all());
db.close();
