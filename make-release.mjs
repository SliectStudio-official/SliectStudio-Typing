// make-release.mjs — 白名单打包 + 敏感值审计（规划侧 2026-11-07 建立）
// 用法: node make-release.mjs [--with-node-msi]
// 设计原则：只复制白名单里的东西；复制完先审计，审计不过就不打包。
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ARGS = process.argv.slice(2);
const WITH_MSI = ARGS.includes('--with-node-msi');

// ---- 白名单：只有这里列出的东西会进包 ----
const ALLOW_FILES = ['server.js','db-config.js','crawler.py','requirements.txt','package.json','package-lock.json','README.md','LICENSE','start.bat','launcher.ps1','VERSION','CONTRACT_VERSION','set-version.ps1','db-config.sample.json','.gitignore'];
const ALLOW_DIRS = ['public'];
const ALLOW_PUBLIC_EXCLUDE = [/^avatars(\/|$)/];   // 用户上传的头像不进包

// ---- 黑名单：命中即失败（防手滑） ----
const DENY = [
  /(^|\/)data(\/|$)/, /db-config\.json$/, /launcher\.config\.ps1$/, /\.db(-wal|-shm)?$/,
  /(^|\/)\.git(\/|$)/, /(^|\/)\.trae(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)tmp(\/|$)/,
  /(^|\/)docs(\/|$)/, /(^|\/)releases(\/|$)/, /\.(log|bak|zip|7z)$/, /__pycache__(\/|$)/
];

const TEXT_EXT = /\.(js|mjs|cjs|json|md|ps1|bat|py|txt|html|css|gitignore)$/i;

async function walk(dir, rel, out) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const full = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { await walk(full, r, out); }
    else { const st = await fs.stat(full); out.push({ rel: r, full, size: st.size }); }
  }
  return out;
}

function fail(msg) { console.error('\n[审计失败] ' + msg); process.exit(1); }

const version = (await fs.readFile(path.join(ROOT, 'VERSION'), 'utf8')).trim();
// 目标 Node 版本以 launcher.ps1 里的 $TargetNodeVersion 为单一来源，避免两处各写一遍
const launcherText = await fs.readFile(path.join(ROOT, 'launcher.ps1'), 'utf8');
const targetNode = (launcherText.match(/\$TargetNodeVersion\s*=\s*'([^']+)'/) || [])[1];
if (!targetNode) throw new Error('launcher.ps1 里找不到 $TargetNodeVersion');
const msiName = 'node-v' + targetNode + '-x64.msi';
if (!/^\d+\.\d+\.\d{6}\.\d{4}$/.test(version)) throw new Error('VERSION 格式不合规（应为 大版本.小版本.YYMMDD.HHMM）: ' + version);
const contractVersion = (await fs.readFile(path.join(ROOT, 'CONTRACT_VERSION'), 'utf8')).trim();
const name = 'LanTest-' + version;
const stageRoot = path.join(ROOT, 'tmp/release-stage');
const stage = path.join(stageRoot, name);
const zipPath = path.join(ROOT, 'releases', name + '.zip');

await fs.rm(stageRoot, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });

// 1) 复制白名单
for (const f of ALLOW_FILES) {
  const src = path.join(ROOT, f);
  await fs.stat(src).catch(() => { throw new Error('白名单文件缺失: ' + f); });
  await fs.copyFile(src, path.join(stage, f));
}
if (WITH_MSI) {
  const msi = path.join(ROOT, msiName);
  await fs.stat(msi).catch(() => { throw new Error('要求带 MSI 但根目录没有 ' + msiName + '（请放入对应版本的安装包）'); });
  await fs.copyFile(msi, path.join(stage, msiName));
}
for (const d of ALLOW_DIRS) {
  const files = await walk(path.join(ROOT, d), d, []);
  for (const f of files) {
    const sub = f.rel.slice(d.length + 1);
    if (ALLOW_PUBLIC_EXCLUDE.some((re) => re.test(sub))) continue;
    const dest = path.join(stage, f.rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(f.full, dest);
  }
}
await fs.mkdir(path.join(stage, 'public/avatars'), { recursive: true });

// 2.5) version.json 是派生文件，不进白名单，按 VERSION 现生成，保证包里自洽
await fs.writeFile(path.join(stage, 'version.json'), JSON.stringify({ version: version, name: 'Typing', fullName: 'Typing-' + version }, null, 2) + '\n', 'utf8');

// 2) 审计 A：黑名单
const staged = await walk(stage, '', []);
for (const f of staged) {
  for (const re of DENY) if (re.test(f.rel)) fail('命中黑名单 ' + re + ' -> ' + f.rel);
}

// 3) 审计 B：真实敏感值不得出现（只报位置，不打印值）
let secrets = [];
try {
  const cfg = JSON.parse(await fs.readFile(path.join(ROOT, 'db-config.json'), 'utf8'));
  const pw = (cfg.mysql && cfg.mysql.password) || '';
  if (pw.length >= 6) secrets.push({ label: 'MySQL 密码', v: pw });
} catch {}
try {
  const txt = await fs.readFile(path.join(ROOT, 'launcher.config.ps1'), 'utf8');
  const m = txt.match(/launcherJwtSecret\s*=\s*'([0-9a-fA-F]{16,})'/);
  if (m) secrets.push({ label: 'JWT 密钥', v: m[1] });
} catch {}
for (const f of staged) {
  if (!TEXT_EXT.test(f.rel) || f.size > 2 * 1024 * 1024) continue;
  const s = await fs.readFile(f.full, 'utf8');
  for (const sec of secrets) if (s.includes(sec.v)) fail(sec.label + ' 出现在 ' + f.rel);
  if (/launcherJwtSecret\s*=\s*'[0-9a-fA-F]{16,}'/.test(s)) fail('文件里带真实格式的 launcherJwtSecret: ' + f.rel);
  if (/"password"\s*:\s*"[^"]{6,}"/.test(s) && /db-config/.test(f.rel)) fail('配置文件里有非空密码: ' + f.rel);
}

// 4) 打包
await fs.mkdir(path.dirname(zipPath), { recursive: true });
await fs.rm(zipPath, { force: true });
const psCmd = "Compress-Archive -Path '" + stage + "' -DestinationPath '" + zipPath + "' -CompressionLevel Optimal -Force";
await new Promise((res, rej) => execFile('powershell', ['-NoProfile','-Command', psCmd], { timeout: 300000 }, (e, so, se) => e ? rej(new Error(se || e.message)) : res()));
const zipStat = await fs.stat(zipPath);
const hash = crypto.createHash('sha256').update(await fs.readFile(zipPath)).digest('hex');

let total = 0; for (const f of staged) total += f.size;
console.log('包名      : ' + path.basename(zipPath));
console.log('产物版本  : ' + version + '（VERSION）');
console.log('规范版本  : ' + contractVersion + '（CONTRACT_VERSION）');
console.log('文件数    : ' + staged.length);
console.log('解包体积  : ' + (total / 1024 / 1024).toFixed(2) + ' MB');
console.log('压缩后    : ' + (zipStat.size / 1024 / 1024).toFixed(2) + ' MB');
console.log('sha256    : ' + hash);
console.log('审计      : 通过（黑名单 0 命中；' + secrets.length + ' 个真实敏感值均未出现）');
console.log('包含      : ' + staged.map((f) => f.rel).filter((r) => !/^public\/(icons|avatars)\//.test(r)).join(', '));
console.log('排除      : data/、db-config.json、launcher.config.ps1、docs/、.trae/、.git/、tmp/、node_modules/、public/avatars/*' + (WITH_MSI ? '' : '、' + msiName));
