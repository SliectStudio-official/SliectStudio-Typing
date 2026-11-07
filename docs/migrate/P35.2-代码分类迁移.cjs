/* P35.2 代码分类迁移（一次性，给「已有数据的机器」用）
 * 用法：先停服务，在项目根目录执行
 *   node docs\migrate\P35.2-代码分类迁移.cjs
 * 作用：
 *   1) 确保 JavaScript / Python / SQL 三个分类存在
 *   2) 把「代码」分类下 标题以 JS- / PY- / SQL- 开头的文章迁到对应语言分类
 *   3) 把三个语言分类的 id 写进 settings.code_category_ids
 * 幂等：重复执行不会重复建分类、不会重复迁移
 * 不改表结构、不动 VERSION / CONTRACT_VERSION
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'typing.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const LANGS = [
  { name: 'JavaScript', prefixes: ['JS-'] },
  { name: 'Python', prefixes: ['PY-'] },
  { name: 'SQL', prefixes: ['SQL-'] }
];

function findCategoryByName(name) {
  return db.prepare('SELECT id, name FROM categories WHERE name = ?').get(name);
}

console.log('库文件:', dbPath);
console.log('');
console.log('=== 迁移前 ===');
console.log('分类:', JSON.stringify(db.prepare('SELECT id, name FROM categories ORDER BY id').all()));

const migrate = db.transaction(() => {
  const langIds = {};
  for (const lang of LANGS) {
    let row = findCategoryByName(lang.name);
    if (!row) {
      const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(lang.name);
      row = { id: Number(info.lastInsertRowid), name: lang.name };
      console.log('新建分类:', row.name, '(id=' + row.id + ')');
    } else {
      console.log('分类已存在:', row.name, '(id=' + row.id + ')');
    }
    langIds[lang.name] = row.id;
  }

  const codeCat = findCategoryByName('代码');
  let moved = 0;
  const skipped = [];
  if (codeCat) {
    const rows = db.prepare('SELECT id, title FROM articles WHERE category_id = ?').all(codeCat.id);
    console.log('');
    console.log('「代码」分类下文章: ' + rows.length + ' 篇');
    for (const a of rows) {
      const lang = LANGS.find(function (l) {
        return l.prefixes.some(function (p) { return a.title.indexOf(p) === 0; });
      });
      if (!lang) { skipped.push(a.id + ':' + a.title); continue; }
      db.prepare('UPDATE articles SET category_id = ? WHERE id = ?').run(langIds[lang.name], a.id);
      moved = moved + 1;
      console.log('  迁移 ' + a.title + ' -> ' + lang.name);
    }
  } else {
    console.log('');
    console.log('没有名为「代码」的分类，跳过迁移（可能已经迁过）');
  }
  if (skipped.length) {
    console.log('');
    console.log('未迁移（标题前缀不是 JS-/PY-/SQL-，请在管理面板手动改分类）:');
    skipped.forEach(function (s) { console.log('  ' + s); });
  }

  const idsJson = JSON.stringify(LANGS.map(function (l) { return langIds[l.name]; }));
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('code_category_ids', idsJson);
  console.log('');
  console.log('已写入 settings.code_category_ids = ' + idsJson);
  return { moved: moved, skipped: skipped.length, idsJson: idsJson };
});

let result;
try {
  result = migrate();
} catch (e) {
  console.error('迁移失败，已回滚: ' + e.message);
  process.exit(1);
}

console.log('');
console.log('=== 迁移后 ===');
console.log('分类:', JSON.stringify(db.prepare('SELECT id, name FROM categories ORDER BY id').all()));
console.log('code_category_ids:', JSON.stringify(db.prepare("SELECT value FROM settings WHERE key = 'code_category_ids'").get()));
console.log('各语言下文章:');
for (const lang of LANGS) {
  const id = findCategoryByName(lang.name).id;
  const rows = db.prepare('SELECT id, title, difficulty FROM articles WHERE category_id = ? ORDER BY id').all(id);
  console.log('  ' + lang.name + '(' + id + '): ' + rows.length + ' 篇 ' + JSON.stringify(rows.map(function (r) { return r.title; })));
}
console.log('');
console.log('迁移了 ' + result.moved + ' 篇；未迁移 ' + result.skipped + ' 篇');
console.log('');
console.log('下一步：重启服务，然后在「管理页 -> 代码模式管理 -> 语言分类」确认三个语言开关已打开。');
db.close();
