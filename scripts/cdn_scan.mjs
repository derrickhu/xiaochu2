/**
 * CDN 本地扫描 / 代码期望路径 / strip 防护（upload / repair 共用）
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { PROJECT_ROOT } from './loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STRIP_MARKER = path.join(PROJECT_ROOT, 'minigame', '.cdn_stripped');
export const MANIFEST_LOCAL = path.join(__dirname, '.cdn_manifest.json');

export function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src', 'config', 'CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf-8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

export function md5File8(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex').slice(0, 8);
}

export function walkDir(dir, remotePrefix, ignore) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    if (ignore.has(item)) continue;
    const full = path.join(dir, item);
    const remote = remotePrefix ? `${remotePrefix}/${item}` : item;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkDir(full, remote, ignore));
    else out.push({ local: full, remote, size: stat.size });
  }
  return out;
}

/** 扫描 minigame 下全部 CDN 目录文件 */
export function scanLocalCdnFiles(cfg) {
  const ignore = new Set(cfg.ignoreFiles || ['game.js', '.DS_Store', 'Thumbs.db']);
  const allFiles = [];
  for (const dir of cfg.cdnDirs || []) {
    allFiles.push(...walkDir(path.join(PROJECT_ROOT, 'minigame', dir), dir, ignore));
  }
  const localManifest = {};
  for (const f of allFiles) {
    localManifest[f.remote] = { hash: md5File8(f.local), size: f.size };
  }
  return { allFiles, localManifest, ignore };
}

/**
 * 从源码/约定推导「运行时会请求的 CDN 逻辑路径」。
 * 动态拼接路径（enemyImageOf / pet_NNN）必须在这里补全，否则只靠磁盘扫描会漏。
 */
export function collectExpectedCdnPaths(cfg) {
  const set = new Set();
  const cdnDirs = cfg.cdnDirs || [];

  const inCdnDir = (p) => cdnDirs.some((d) => p === d || p.startsWith(`${d}/`));

  // 灵宠头像 / 秀场立绘
  for (let n = 1; n <= 40; n++) {
    const id = `pet_${String(n).padStart(3, '0')}`;
    set.add(`subpackages/pkg-pet/images/pet/${id}.png`);
    set.add(`subpackages/pkg-pet/images/pet/${id}_s3.png`);
    const enemyPkg = n >= 11 ? 'pkg-enemy-cr' : 'pkg-enemy';
    set.add(`subpackages/${enemyPkg}/images/enemy/${id}.png`);
    set.add(`subpackages/${enemyPkg}/images/enemy/${id}_awakened.png`);
  }

  // 杂怪立绘：有 image: enemyImageOf('x') 的只需要 x.png；否则要自身 id.png
  const enemiesTs = path.join(PROJECT_ROOT, 'src/balance/enemies.ts');
  if (fs.existsSync(enemiesTs)) {
    const text = fs.readFileSync(enemiesTs, 'utf-8');
    const idRe = /id:\s*'((?:enemy|cr)_[a-z0-9_]+)'/g;
    let m;
    while ((m = idRe.exec(text))) {
      const id = m[1];
      const window = text.slice(m.index, m.index + 600);
      const nextId = window.slice(1).search(/id:\s*'/);
      const slice = nextId >= 0 ? window.slice(0, nextId + 1) : window;
      const img = slice.match(/image:\s*enemyImageOf\('([a-z0-9_]+)'\)/);
      const fileId = img ? img[1] : id;
      set.add(`subpackages/pkg-enemy/images/enemy/${fileId}.png`);
    }
  }

  for (const rel of ['src/config', 'src/scenes', 'src/balance']) {
    const root = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root, { recursive: true })) {
      const full = path.join(root, String(f));
      if (!full.endsWith('.ts') || full.includes('__tests__')) continue;
      const text = fs.readFileSync(full, 'utf-8');
      for (const m of text.matchAll(/subpackages\/pkg-[a-z0-9-]+\/[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|webp|mp3)/g)) {
        set.add(m[0]);
      }
    }
  }

  // 只保留落在 cdnDirs 内的期望路径
  return [...set].filter(inCdnDir).sort();
}

/**
 * 上传前护栏：禁止 strip 后残缺本地覆写 / 漏传。
 *
 * onlyPrefix（对应 --only）会把「本地相对云端是否残缺」这一类护栏限定在该前缀内。
 * 这不是放行后门：--only 与 --prune 互斥、清单走合并、范围外一个文件都不动，
 * 因此范围外本地为空是预期状态，再按全量口径判残缺只会永远误报。
 *
 * @returns {{ warnings: string[], missingLocal: string[] }}
 */
export function preflightUpload({
  cfg, allFiles, localManifest, remoteFiles = {}, allowPrune = false, onlyPrefix = '',
}) {
  const warnings = [];
  const inScope = (p) => !onlyPrefix || p === onlyPrefix || p.startsWith(`${onlyPrefix}/`);
  const scopedRemote = onlyPrefix
    ? Object.keys(remoteFiles).filter(inScope)
    : Object.keys(remoteFiles);
  const remoteCount = scopedRemote.length;
  const localCount = allFiles.length;

  if (fs.existsSync(STRIP_MARKER) && !onlyPrefix) {
    throw new Error(
      '检测到 minigame/.cdn_stripped（已执行 cdn:strip）。\n'
      + '请先 npm run cdn:restore 恢复本地资源，再 cdn:upload。\n'
      + '禁止在瘦包状态下上传（会漏文件 / 污染清单）。',
    );
  }
  if (fs.existsSync(STRIP_MARKER) && onlyPrefix) {
    warnings.push(
      `注意: 处于 cdn:strip 状态，但 --only ${onlyPrefix} 已限定范围，仅该前缀内的文件参与上传。`,
    );
  }

  for (const dir of cfg.cdnDirs || []) {
    // --only 之外的目录本次不动，比对它们没有意义
    if (onlyPrefix && !inScope(dir) && !onlyPrefix.startsWith(`${dir}/`)) continue;
    const localInDir = allFiles.filter((f) => f.remote === dir || f.remote.startsWith(`${dir}/`)).length;
    const remoteInDir = scopedRemote.filter((k) => k === dir || k.startsWith(`${dir}/`)).length;
    if (remoteInDir >= 5 && localInDir === 0) {
      throw new Error(
        `目录 ${dir} 本地 0 文件，但云端有 ${remoteInDir} 个。疑似 strip 后上传，已中止。\n`
        + '请执行: npm run cdn:restore && npm run build && npm run cdn:upload',
      );
    }
    if (remoteInDir >= 20 && localInDir < Math.floor(remoteInDir * 0.35)) {
      throw new Error(
        `目录 ${dir} 本地仅 ${localInDir}/${remoteInDir}，疑似残缺（strip/未 restore）。已中止。`,
      );
    }
  }

  if (remoteCount >= 50 && localCount < Math.floor(remoteCount * 0.3)) {
    throw new Error(
      `本地扫描 ${localCount}，云端 ${remoteCount}，比例过低，疑似 strip 后上传。已中止。`,
    );
  }

  if (allowPrune && remoteCount >= 50 && localCount < Math.floor(remoteCount * 0.8)) {
    throw new Error(
      `--prune 要求本地接近全集（当前 ${localCount}/${remoteCount}）。\n`
      + '请先 cdn:restore 后再 prune，或去掉 --prune 使用合并清单。',
    );
  }

  const expected = collectExpectedCdnPaths(cfg).filter(inScope);
  const missingLocal = expected.filter((p) => !localManifest[p]);
  // 本地没有、云端也没有 → 新资源漏传，必须拦
  const missingBoth = missingLocal.filter((p) => !remoteFiles[p]);

  const missingEnemyArts = missingBoth.filter((p) => /\/images\/enemy\/enemy_[\w]+\.png$/.test(p));
  if (missingEnemyArts.length > 0) {
    throw new Error(
      `敌人立绘本地与云端皆无 ${missingEnemyArts.length} 个，拒绝上传。\n`
      + `例: ${missingEnemyArts.slice(0, 5).join(', ')}`,
    );
  }

  // 本地缺但云端有：合并清单可保底；仍警告（开发期应用 cdn:restore）
  if (missingLocal.length > 0) {
    const onlyRemote = missingLocal.length - missingBoth.length;
    warnings.push(
      `代码期望路径: 本地缺 ${missingLocal.length}`
      + (onlyRemote ? `（其中 ${onlyRemote} 云端已有，合并清单可覆盖）` : '')
      + (missingBoth.length ? `；${missingBoth.length} 两端皆无` : ''),
    );
    for (const p of missingLocal.slice(0, 10)) {
      warnings.push(`  ${remoteFiles[p] ? '~' : '!'} ${p}`);
    }
    if (missingLocal.length > 10) warnings.push(`  ... 另有 ${missingLocal.length - 10} 条`);
  }

  if (missingBoth.length >= 20) {
    throw new Error(
      `有 ${missingBoth.length} 条代码期望路径在本地与云端都不存在，资源严重不齐，已中止。\n`
      + '请先补齐美术/执行 cdn:restore 后再上传。',
    );
  }

  return { warnings, missingLocal, missingBoth, expected };
}
