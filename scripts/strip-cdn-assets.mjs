#!/usr/bin/env node
/**
 * 物理剔除已上 CDN 的大资源，供微信开发者工具上传瘦包。
 *
 * 背景：packOptions.ignore 在部分打开方式/工具版本下不生效，
 * 上传体积会仍按磁盘全量计（约 45MB）。本脚本按 CdnConfig.cdnDirs 删除本地文件。
 *
 * 流程：
 *   1. npm run build
 *   2. npm run cdn:upload          # 必须先上传，再瘦包
 *   3. npm run cdn:strip           # 本脚本
 *   4. 微信开发者工具上传
 *   5. npm run cdn:restore         # 恢复本地文件（开发期 fallback）
 *
 * 用法：
 *   node scripts/strip-cdn-assets.mjs
 *   node scripts/strip-cdn-assets.mjs --dry-run
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MINIGAME = path.join(PROJECT_ROOT, 'minigame');
const DRY_RUN = process.argv.includes('--dry-run');

function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src', 'config', 'CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf-8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'Thumbs.db') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function dirSize(dir) {
  return walkFiles(dir).reduce((n, f) => n + fs.statSync(f).size, 0);
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function main() {
  const cfg = loadCdnConfig();
  const ignore = new Set(cfg.ignoreFiles || ['game.js', '.DS_Store', 'Thumbs.db']);
  const dirs = cfg.cdnDirs || [];

  const beforeTotal = dirSize(MINIGAME);
  let removedBytes = 0;
  let removedCount = 0;

  console.log(`=== CDN 瘦包${DRY_RUN ? '（dry-run）' : ''} ===`);
  console.log(`minigame 当前: ${fmtMb(beforeTotal)}`);

  for (const rel of dirs) {
    const abs = path.join(MINIGAME, rel);
    if (!fs.existsSync(abs)) {
      console.log(`  skip (missing) ${rel}`);
      continue;
    }
    const files = walkFiles(abs).filter((f) => !ignore.has(path.basename(f)));
    const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
    console.log(`  ${rel}: ${files.length} files, ${fmtMb(bytes)}`);
    for (const f of files) {
      removedBytes += fs.statSync(f).size;
      removedCount += 1;
      if (!DRY_RUN) fs.unlinkSync(f);
    }
  }

  // 清理空目录（保留 cdnDirs 根目录本身，方便后续 restore）
  if (!DRY_RUN) {
    for (const rel of dirs) {
      const abs = path.join(MINIGAME, rel);
      pruneEmptyDirs(abs, abs);
    }
  }

  const afterTotal = DRY_RUN ? beforeTotal - removedBytes : dirSize(MINIGAME);
  console.log(`删除: ${removedCount} 文件 / ${fmtMb(removedBytes)}`);
  console.log(`瘦包后约: ${fmtMb(afterTotal)}（微信上传应接近此值）`);
  if (!DRY_RUN) {
    console.log('上传完成后请执行: npm run cdn:restore');
  }
}

function pruneEmptyDirs(dir, root) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) pruneEmptyDirs(full, root);
  }
  if (dir === root) return;
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

main();
