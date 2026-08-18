/**
 * 把 build/taptap/ 打成上传用 zip，产物就放在该目录里。
 * 打包时排除 *.zip，避免把旧包打进新包。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tapDir = path.join(rootDir, 'build', 'taptap');
const require = createRequire(import.meta.url);
const version = require('../package.json').version;

function fail(msg) {
  throw new Error(`[pack-taptap] ${msg}`);
}

if (!fs.existsSync(path.join(tapDir, 'game.js')) || !fs.existsSync(path.join(tapDir, 'game.json'))) {
  fail('找不到 build/taptap/game.js，请先 npm run build:taptap');
}

const zipName = `taptap-V${version}.zip`;
const zipPath = path.join(tapDir, zipName);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

const packed = spawnSync(
  'zip',
  ['-qr', zipName, '.', '-x', '*.zip', '-x', '*.DS_Store', '-x', '.*/', '-x', '*.xiaochu2-tmp'],
  { cwd: tapDir, stdio: 'inherit' },
);
if (packed.status !== 0) fail(`zip 失败，exit ${packed.status}`);

const kb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`[pack-taptap] ${path.relative(rootDir, zipPath)} (${kb}MB)`);
