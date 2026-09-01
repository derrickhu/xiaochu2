/**
 * 把 build/taptap/ 打成上传用 zip，产物就放在该目录里。
 * 打包时排除 *.zip，避免把旧包打进新包。
 * 每次打包把 tapVersion 补丁位 +1，后台版本号填 zip 名里的 V x.y.z；
 * 目录里只保留本次新包，老包一律删掉，避免上传时拿错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bumpPatch, persistTapVersion, readTapVersion } from './lib/tap-version.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tapDir = path.join(rootDir, 'build', 'taptap');
const pkgPath = path.join(rootDir, 'package.json');
const require = createRequire(import.meta.url);

function fail(msg) {
  throw new Error(`[pack-taptap] ${msg}`);
}

if (!fs.existsSync(path.join(tapDir, 'game.js')) || !fs.existsSync(path.join(tapDir, 'game.json'))) {
  fail('找不到 build/taptap/game.js，请先 npm run build:taptap');
}

const prev = readTapVersion(require(pkgPath));
const version = persistTapVersion(pkgPath, bumpPatch(prev));

const stale = fs.readdirSync(tapDir).filter((name) => /^taptap-V.+\.zip$/.test(name));
for (const name of stale) fs.rmSync(path.join(tapDir, name));

// 版本号打进包内，启动诊断弹窗第一屏就能自证装的是哪个包
fs.writeFileSync(
  path.join(tapDir, 'tap-pack-stamp.js'),
  `GameGlobal.__XIAOCHU2_TAP_VERSION='${version}';\n`,
);

const zipName = `taptap-V${version}.zip`;
const zipPath = path.join(tapDir, zipName);

const packed = spawnSync(
  'zip',
  ['-qr', zipName, '.', '-x', '*.zip', '-x', '*.DS_Store', '-x', '.*/', '-x', '*.xiaochu2-tmp'],
  { cwd: tapDir, stdio: 'inherit' },
);
if (packed.status !== 0) fail(`zip 失败，exit ${packed.status}`);

const kb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
const dropped = stale.length ? `，清掉老包 ${stale.length} 个` : '';
console.log(`[pack-taptap] ${path.relative(rootDir, zipPath)} (${kb}MB)  ${prev} → ${version}${dropped}`);
