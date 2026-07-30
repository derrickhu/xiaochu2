#!/usr/bin/env node
/**
 * 从 git 恢复被 cdn:strip 删除的 CDN 本地资源（开发期本地 fallback）。
 *
 * 注意：签到/秘境/通天塔等大图已迁到 pkg-scene；若 git 里仍在主包 images/ 下，
 * 会先 checkout 主包路径再跑 organize-subpackages 迁回分包。
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

function gitCheckout(paths) {
  if (paths.length === 0) return 0;
  const r = spawnSync('git', ['checkout', '--', ...paths], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  return r.status || 0;
}

const cfg = loadCdnConfig();
const cdnPaths = (cfg.cdnDirs || []).map((d) => path.join('minigame', d));

/** 曾落在主包、构建时迁入 pkg-scene 的路径（git HEAD 可能仍在此） */
const MAIN_OVERFLOW_SOURCES = [
  'minigame/images/ui/checkin',
  'minigame/images/ui/realm',
  'minigame/images/ui/tower',
  'minigame/images/ui/icon/quest_chest.png',
  'minigame/images/ui/plaque/modal_title.png',
  'minigame/images/ui/plaque/scene_title.png',
  'minigame/images/bg/scene_realm.jpg',
  'minigame/images/bg/scene_tower.jpg',
];

console.log('=== 恢复 CDN 本地资源 ===');
const status = gitCheckout([...cdnPaths, ...MAIN_OVERFLOW_SOURCES]);
if (status !== 0) {
  console.error('git checkout 失败。若资源尚未入库，请重新 npm run build / 从备份拷回。');
  process.exit(status);
}

const organize = spawnSync('node', [path.join(__dirname, 'organize-subpackages.mjs')], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
});
if ((organize.status || 0) !== 0) {
  console.error('organize-subpackages 失败');
  process.exit(organize.status || 1);
}

const stripMarker = path.join(PROJECT_ROOT, 'minigame', '.cdn_stripped');
try { fs.unlinkSync(stripMarker); } catch { /* ignore */ }

console.log('已恢复:', [...cdnPaths, ...MAIN_OVERFLOW_SOURCES].join(', '));
console.log('提示: 上传微信包请用 npm run build:wechat（会再次 strip）');
