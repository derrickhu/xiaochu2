#!/usr/bin/env node
/**
 * 从 git 恢复被 cdn:strip 删除的 CDN 本地资源（开发期本地 fallback）。
 *
 * 用法：node scripts/restore-cdn-assets.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src', 'config', 'CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf-8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

const cfg = loadCdnConfig();
const paths = (cfg.cdnDirs || []).map((d) => path.join('minigame', d));

console.log('=== 恢复 CDN 本地资源 ===');
const r = spawnSync('git', ['checkout', '--', ...paths], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
});
if (r.status !== 0) {
  console.error('git checkout 失败。若资源尚未入库，请重新 npm run build / 从备份拷回。');
  process.exit(r.status || 1);
}
console.log('已恢复:', paths.join(', '));
