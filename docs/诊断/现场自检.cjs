/* 现场自检（只读，不改任何文件）
 * 用法：在项目根目录执行  node docs\诊断\现场自检.cjs
 * 输出：版本、端口占用、数据库规范版本、依赖是否可加载、最近日志尾部
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

const root = path.join(__dirname, '..', '..');
function read(p) { try { return fs.readFileSync(path.join(root, p), "utf8").trim(); } catch (e) { return "(读不到)"; } }
function exists(p) { try { fs.accessSync(path.join(root, p)); return true; } catch (e) { return false; } }

console.log('=== 1. 版本文件');
console.log('VERSION           :', read('VERSION'));
console.log('CONTRACT_VERSION  :', read('CONTRACT_VERSION'));
console.log('version.json      :', read('version.json').replace(/\s+/g, ' '));
console.log('package.json ver  :', (read('package.json').match(/"version"\s*:\s*"([^"]+)"/) || [])[1] || '(读不到)');

console.log('');
console.log('=== 2. 关键文件是否在');
['server.js', 'db-config.js', 'db-config.json', 'public/index.html', 'public/code-typing.js', 'node_modules/better-sqlite3/package.json'].forEach(function (p) {
  console.log((exists(p) ? '有  ' : '缺  ') + p);
});

console.log('');
console.log('=== 3. 端口 3000 是否有服务在听');
const probe = net.connect({ host: "127.0.0.1", port: 3000 });
let probed = false;
function done(txt) { if (probed) { return; } probed = true; console.log(txt); probe.destroy(); step4(); }
probe.once("connect", function () { done("端口 3000 有人监听 → 服务在跑（若页面仍报 Failed to fetch，多半是重启前加载的旧页面，Ctrl+F5）"); });
probe.once("error", function (e) {
  if (e.code === "ECONNREFUSED") { done("端口 3000 无人监听 → 服务没在跑，这就是所有写操作报 Failed to fetch 的原因"); }
  else { done("探测出错: " + e.code + " " + e.message); }
});
setTimeout(function () { done("探测超时 → 端口 3000 可能被防火墙丢弃"); }, 3000);
probe.setTimeout(3000);

function step4() {
  console.log('');
  console.log('=== 4. 数据库规范版本（只读）');
  try {
    const Database = require(path.join(root, 'node_modules', 'better-sqlite3'));
    const dbPath = path.join(root, 'data', 'typing.db');
    if (!fs.existsSync(dbPath)) {
      console.log('data/typing.db 不存在 → 全新库，第一次启动会自动建');
    } else {
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
      console.log('库里 schema_version:', row ? row.value : '(没有这一行 → 老库)');
      console.log('代码要求          :', read('CONTRACT_VERSION'));
      if (row && row.value !== read("CONTRACT_VERSION")) {
        console.log('>>> 两者不一致 → 服务会拒绝启动（这是保护）。要么把库恢复到对应版本，要么按 ADR 迁移。');
      }
      const code = db.prepare("SELECT value FROM settings WHERE key = 'code_category_ids'").get();
      console.log('code_category_ids :', code ? code.value : '(没做过代码分类迁移 → 跑 docs\\migrate\\P35.2-代码分类迁移.cjs)');
      db.close();
    }
  } catch (e) {
    console.log('读库失败:', e.message);
    console.log('（若提示 NODE_MODULE_VERSION 不匹配 → node 与 better-sqlite3 的 ABI 对不上，需重装依赖）');
  }
  step5();
}

function step5() {
  console.log('');
  console.log('=== 5. 日志尾部（tmp/server.log 或 tmp/launcher.log）');
  ['tmp/server.log', 'tmp/launcher.log'].forEach(function (p) {
    if (exists(p)) {
      const t = read(p).split('\n');
      console.log('--- ' + p + ' 最后 15 行 ---');
      console.log(t.slice(-15).join('\n'));
    }
  });
  console.log('');
  console.log('=== 结论怎么读');
  console.log('端口空闲 + 日志里最后一条是报错 → 服务启动失败，把那段报错原文发出来');
  console.log('端口占用 + /api/version 是旧版本 → 跑的是旧进程，结束它再启动');
  console.log('都正常但页面报 Failed to fetch → 页面是重启前加载的，Ctrl+F5 硬刷新');
}
