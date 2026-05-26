const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'db-config.json');

const DEFAULT_CONFIG = {
  type: 'sqlite',
  sqlite: { path: './data/typing.db' },
  mysql: {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'typing',
    charset: 'utf8mb4'
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(raw);
      return {
        type: config.type || 'sqlite',
        sqlite: { ...DEFAULT_CONFIG.sqlite, ...(config.sqlite || {}) },
        mysql: { ...DEFAULT_CONFIG.mysql, ...(config.mysql || {}) }
      };
    }
  } catch (e) {
    console.warn('db-config.json 读取失败，使用默认配置:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function isMySQL(db) {
  return db._type === 'mysql';
}

function nowLocaltime(db) {
  return isMySQL(db) ? 'NOW()' : "datetime('now', 'localtime')";
}

function curDate(db) {
  return isMySQL(db) ? 'CURDATE()' : "date('now', 'localtime')";
}

function dateFn(col, db) {
  return isMySQL(db) ? `DATE(${col})` : `date(${col})`;
}

function daysAgo(days, db) {
  return isMySQL(db)
    ? `DATE_SUB(NOW(), INTERVAL ${days} DAY)`
    : `datetime('now', 'localtime', '-${days} days')`;
}

function coalesceEmptyDesc(col, db) {
  return isMySQL(db)
    ? `COALESCE(${col}, updated_at, '')`
    : `COALESCE(NULLIF(${col}, ''), updated_at, '')`;
}

async function createDatabase(config) {
  const db = { _type: config.type };

  if (config.type === 'mysql') {
    const mysql = require('mysql2/promise');
    try {
      const conn = await mysql.createConnection({
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password
      });
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET ${config.mysql.charset || 'utf8mb4'} COLLATE ${config.mysql.charset === 'utf8mb4' ? 'utf8mb4_unicode_ci' : 'utf8_general_ci'}`
      );
      await conn.end();
    } catch (e) {
      console.warn('MySQL 数据库自动创建失败（可能已存在）:', e.message);
    }

    const pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      charset: config.mysql.charset || 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    db._pool = pool;
    db._rawType = 'mysql';

    db.get = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      const [rows] = await pool.query(sql, flatParams);
      return (rows && rows[0]) || null;
    };

    db.all = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      const [rows] = await pool.query(sql, flatParams);
      return rows || [];
    };

    db.run = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      const [result] = await pool.query(sql, flatParams);
      return {
        lastInsertRowid: result.insertId,
        changes: result.affectedRows
      };
    };

    db.exec = async (sql) => {
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const stmt of statements) {
          await conn.query(stmt);
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    };

    db.transaction = (fn) => {
      return async (...args) => {
        const conn = await pool.getConnection();
        const connDb = {
          _type: 'mysql',
          get: async (sql, ...p) => {
            const fp = Array.isArray(p[0]) ? p[0] : p;
            const [rows] = await conn.query(sql, fp);
            return (rows && rows[0]) || null;
          },
          all: async (sql, ...p) => {
            const fp = Array.isArray(p[0]) ? p[0] : p;
            const [rows] = await conn.query(sql, fp);
            return rows || [];
          },
          run: async (sql, ...p) => {
            const fp = Array.isArray(p[0]) ? p[0] : p;
            const [result] = await conn.query(sql, fp);
            return { lastInsertRowid: result.insertId, changes: result.affectedRows };
          }
        };
        try {
          await conn.beginTransaction();
          const result = await fn(connDb, ...args);
          await conn.commit();
          return result;
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      };
    };

    db.close = async () => {
      await pool.end();
    };

    db.getTables = async () => {
      const [rows] = await pool.query(
        `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
        [config.mysql.database]
      );
      return rows.map(r => r.name);
    };

    db.getColumns = async (tableName) => {
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME as name, DATA_TYPE as type, COLUMN_KEY as \`key\`, IS_NULLABLE as nullable, COLUMN_DEFAULT as dflt_value, EXTRA as extra FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [config.mysql.database, tableName]
      );
      return rows.map(r => {
        const t = r.type.toUpperCase();
        let mappedType = t;
        if (t === 'INT' || t === 'TINYINT' || t === 'SMALLINT' || t === 'MEDIUMINT' || t === 'BIGINT') mappedType = 'INTEGER';
        else if (t === 'DOUBLE' || t === 'FLOAT' || t === 'DECIMAL' || t === 'NUMERIC') mappedType = 'REAL';
        else if (t === 'VARCHAR' || t === 'CHAR') mappedType = 'TEXT';
        return {
          name: r.name,
          type: mappedType,
          pk: r.key === 'PRI' ? 1 : 0,
          notnull: r.nullable === 'NO' ? 1 : 0,
          dflt_value: r.dflt_value
        };
      });
    };

    db.getPrimaryKey = async (tableName) => {
      const columns = await db.getColumns(tableName);
      const pk = columns.find(c => c.pk === 1);
      return pk ? pk.name : null;
    };

  } else {
    const Database = require('better-sqlite3');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.resolve(__dirname, config.sqlite.path || './data/typing.db');
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db._sqlite = sqlite;
    db._rawType = 'sqlite';

    db.get = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      return sqlite.prepare(sql).get(...flatParams);
    };

    db.all = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      return sqlite.prepare(sql).all(...flatParams);
    };

    db.run = async (sql, ...params) => {
      const flatParams = Array.isArray(params[0]) ? params[0] : params;
      const result = sqlite.prepare(sql).run(...flatParams);
      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: result.changes
      };
    };

    db.exec = async (sql) => {
      sqlite.exec(sql);
    };

    db.transaction = (fn) => {
      return async (...args) => {
        sqlite.exec('BEGIN');
        try {
          const result = await fn(...args);
          sqlite.exec('COMMIT');
          return result;
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      };
    };

    db.close = async () => {
      sqlite.close();
    };

    db.getTables = async () => {
      return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    };

    db.getColumns = async (tableName) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) return [];
      return sqlite.prepare(`PRAGMA table_info("${tableName}")`).all();
    };

    db.getPrimaryKey = async (tableName) => {
      const columns = await db.getColumns(tableName);
      const pk = columns.find(c => c.pk === 1);
      return pk ? pk.name : null;
    };
  }

  return db;
}

function getMySQLCreateSQL() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) UNIQUE,
      password_hash VARCHAR(200) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      nickname VARCHAR(50) DEFAULT '',
      avatar VARCHAR(200) DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS articles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      category_id INT,
      source VARCHAR(500) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'approved',
      author_id INT,
      review_msg TEXT,
      difficulty INT DEFAULT 1,
      difficulty_score DOUBLE DEFAULT 0,
      updated_at VARCHAR(50) DEFAULT '',
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS scores (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT,
      nickname VARCHAR(50) NOT NULL,
      speed DOUBLE NOT NULL,
      accuracy DOUBLE NOT NULL,
      time_seconds INT NOT NULL,
      article_id INT,
      ip_address VARCHAR(50) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(20) DEFAULT 'normal',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS error_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      article_id INT,
      expected_char VARCHAR(10) NOT NULL,
      typed_char VARCHAR(10) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS private_articles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS announcements (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(200) NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      level VARCHAR(20) NOT NULL DEFAULT 'notification',
      is_active TINYINT DEFAULT 1,
      allow_close TINYINT DEFAULT 1,
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
}

function getSQLiteCreateSQL() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT ''
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
      status TEXT DEFAULT 'approved',
      author_id INTEGER,
      review_msg TEXT DEFAULT '',
      difficulty INTEGER DEFAULT 1,
      difficulty_score REAL DEFAULT 0,
      updated_at TEXT DEFAULT '',
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
      source TEXT DEFAULT 'normal',
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
  `;
}

async function runMigrations(db) {
  if (isMySQL(db)) {
    const migrations = [
      "ALTER TABLE users ADD COLUMN nickname VARCHAR(50) DEFAULT ''",
      "ALTER TABLE users ADD COLUMN avatar VARCHAR(200) DEFAULT ''",
      "ALTER TABLE articles ADD COLUMN status VARCHAR(20) DEFAULT 'approved'",
      "ALTER TABLE articles ADD COLUMN author_id INT",
      "ALTER TABLE articles ADD COLUMN review_msg TEXT",
      "ALTER TABLE articles ADD COLUMN difficulty INT DEFAULT 1",
      "ALTER TABLE articles ADD COLUMN difficulty_score DOUBLE DEFAULT 0",
      "ALTER TABLE articles ADD COLUMN updated_at VARCHAR(50) DEFAULT ''",
      "ALTER TABLE announcements ADD COLUMN title VARCHAR(200) NOT NULL DEFAULT ''",
      "ALTER TABLE announcements ADD COLUMN level VARCHAR(20) NOT NULL DEFAULT 'notification'",
      "ALTER TABLE announcements ADD COLUMN is_active TINYINT DEFAULT 1",
      "ALTER TABLE announcements ADD COLUMN allow_close TINYINT DEFAULT 1",
      "ALTER TABLE announcements ADD COLUMN start_time DATETIME",
      "ALTER TABLE announcements ADD COLUMN end_time DATETIME",
      "ALTER TABLE announcements ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE announcements ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE scores ADD COLUMN source VARCHAR(20) DEFAULT 'normal'"
    ];
    for (const sql of migrations) {
      try { await db.run(sql); } catch (e) {}
    }
    try {
      await db.run("UPDATE announcements SET created_at = NOW() WHERE created_at IS NULL");
    } catch (e) {}
    try {
      await db.run("UPDATE announcements SET updated_at = NOW() WHERE updated_at IS NULL OR updated_at = ''");
    } catch (e) {}
    try {
      await db.run("UPDATE announcements SET start_time = NULL WHERE start_time = ''");
    } catch (e) {}
    try {
      await db.run("UPDATE announcements SET end_time = NULL WHERE end_time = ''");
    } catch (e) {}
    try {
      await db.run("UPDATE articles SET updated_at = '' WHERE updated_at IS NULL");
    } catch (e) {}
  } else {
    const migrations = [
      'ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ""',
      'ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ""',
      "ALTER TABLE articles ADD COLUMN status TEXT DEFAULT 'approved'",
      'ALTER TABLE articles ADD COLUMN author_id INTEGER',
      "ALTER TABLE articles ADD COLUMN review_msg TEXT DEFAULT ''",
      'ALTER TABLE articles ADD COLUMN difficulty INTEGER DEFAULT 1',
      'ALTER TABLE articles ADD COLUMN difficulty_score REAL DEFAULT 0',
      "ALTER TABLE articles ADD COLUMN updated_at TEXT DEFAULT ''",
      "ALTER TABLE announcements ADD COLUMN title TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE announcements ADD COLUMN level TEXT NOT NULL DEFAULT 'notification'",
      'ALTER TABLE announcements ADD COLUMN is_active INTEGER DEFAULT 1',
      'ALTER TABLE announcements ADD COLUMN allow_close INTEGER DEFAULT 1',
      'ALTER TABLE announcements ADD COLUMN start_time TEXT',
      'ALTER TABLE announcements ADD COLUMN end_time TEXT',
      "ALTER TABLE announcements ADD COLUMN created_at TEXT DEFAULT ''",
      "ALTER TABLE announcements ADD COLUMN updated_at TEXT DEFAULT ''",
      "ALTER TABLE scores ADD COLUMN source TEXT DEFAULT 'normal'"
    ];
    for (const sql of migrations) {
      try { await db.exec(sql); } catch (e) {}
    }
    try {
      await db.exec("UPDATE announcements SET created_at = datetime('now', 'localtime') WHERE created_at IS NULL OR created_at = ''");
    } catch (e) {}
    try {
      await db.exec("UPDATE announcements SET updated_at = datetime('now', 'localtime') WHERE updated_at IS NULL OR updated_at = ''");
    } catch (e) {}
    try {
      await db.exec("UPDATE announcements SET start_time = NULL WHERE start_time = ''");
    } catch (e) {}
    try {
      await db.exec("UPDATE announcements SET end_time = NULL WHERE end_time = ''");
    } catch (e) {}
  }
}

async function seedData(db) {
  const settingCount = await db.get("SELECT COUNT(*) as count FROM settings WHERE `key` = 'sensitive_words'");
  if (settingCount.count === 0) {
    await db.run("INSERT INTO settings (`key`, value) VALUES ('sensitive_words', '')");
  }
  const guestSettingCount = await db.get("SELECT COUNT(*) as count FROM settings WHERE `key` = 'allow_guest_leaderboard'");
  if (guestSettingCount.count === 0) {
    await db.run("INSERT INTO settings (`key`, value) VALUES ('allow_guest_leaderboard', 'true')");
  }

  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    const bsRow = await db.get("SELECT value FROM settings WHERE `key` = 'needs_bootstrap'");
    if (!bsRow) {
      await db.run("INSERT INTO settings (`key`, value) VALUES ('needs_bootstrap', 'true')");
    }
  }

  const catCount = await db.get('SELECT COUNT(*) as count FROM categories');
  if (catCount.count === 0) {
    await db.run("INSERT INTO categories (name) VALUES (?)", '散文');
    await db.run("INSERT INTO categories (name) VALUES (?)", '英文');
    await db.run("INSERT INTO categories (name) VALUES (?)", '代码');
    await db.run("INSERT INTO categories (name) VALUES (?)", '新闻');

    const proseCat = await db.get("SELECT id FROM categories WHERE name = '散文'");
    const englishCat = await db.get("SELECT id FROM categories WHERE name = '英文'");

    await db.run('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)',
      '经典诗词',
      '床前明月光，疑是地上霜。举头望明月，低头思故乡。春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。白日依山尽，黄河入海流。欲穷千里目，更上一层楼。',
      proseCat.id, '默认'
    );
    await db.run('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)',
      '英文短文',
      'The quick brown fox jumps over the lazy dog. Practice makes perfect. Every day is a new opportunity to learn and grow. Keep typing and you will improve your speed and accuracy over time. The journey of a thousand miles begins with a single step.',
      englishCat.id, '默认'
    );
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  createDatabase,
  isMySQL,
  nowLocaltime,
  curDate,
  dateFn,
  daysAgo,
  coalesceEmptyDesc,
  getMySQLCreateSQL,
  getSQLiteCreateSQL,
  runMigrations,
  seedData
};
