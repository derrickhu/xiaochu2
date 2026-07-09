/**
 * 构建后整理 minigame 资源为微信分包目录（主包 ≤4MB，单分包 ≤4MB）。
 *
 * 主包保留：代码 + 棋盘/珠子 + 首页背景 + 基础 UI
 * 子包：pkg-pet / pkg-enemy / pkg-enemy-cr / pkg-scene / pkg-shop / pkg-fx / pkg-audio / pkg-battle
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../minigame');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function move(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
  return true;
}

function moveFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(src, dest);
  return true;
}

function rmEmpty(dir) {
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function formatKB(n) {
  return `${(n / 1024).toFixed(0)}KB`;
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let sum = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    sum += ent.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return sum;
}

const SUBPACKAGE_NAMES = [
  'pkg-pet',
  'pkg-enemy',
  'pkg-enemy-cr',
  'pkg-scene',
  'pkg-shop',
  'pkg-fx',
  'pkg-audio',
  'pkg-battle',
];

const SUBPACKAGE_GAME_JS = `/** 资源分包占位：微信要求分包根目录必须有 game.js，游戏逻辑仍在主包 game-bundle.js */\n`;

/** 为各资源分包写入 game.js 入口（微信校验必需） */
function ensureSubpackageEntryFiles() {
  for (const name of SUBPACKAGE_NAMES) {
    const dir = path.join(ROOT, 'subpackages', name);
    if (!fs.existsSync(dir)) continue;
    const entry = path.join(dir, 'game.js');
    if (!fs.existsSync(entry) || fs.readFileSync(entry, 'utf8') !== SUBPACKAGE_GAME_JS) {
      fs.writeFileSync(entry, SUBPACKAGE_GAME_JS, 'utf8');
    }
  }
}

/** pet_011+ 收录怪拆到 pkg-enemy-cr（原 cr_* 分包逻辑） */
const CREATURE_CR_SUBPACKAGE_FROM = 11;

function enemyUsesCrSubpackage(filename) {
  const base = filename.replace(/_awakened\.png$/, '.png').replace(/\.png$/, '');
  const m = /^pet_(\d+)$/.exec(base);
  return !!m && Number(m[1]) >= CREATURE_CR_SUBPACKAGE_FROM;
}

function splitEnemySubpackage() {
  const enemyDir = path.join(ROOT, 'subpackages/pkg-enemy/images/enemy');
  const crDir = path.join(ROOT, 'subpackages/pkg-enemy-cr/images/enemy');
  if (!fs.existsSync(enemyDir)) return;
  ensureDir(crDir);

  // 若曾误拆 pet_001–010，移回 pkg-enemy
  if (fs.existsSync(crDir)) {
    for (const f of fs.readdirSync(crDir)) {
      if (f.startsWith('pet_') && !enemyUsesCrSubpackage(f)) {
        moveFile(path.join(crDir, f), path.join(enemyDir, f));
      }
    }
  }

  let moved = 0;
  for (const f of fs.readdirSync(enemyDir)) {
    if (enemyUsesCrSubpackage(f)) {
      moveFile(path.join(enemyDir, f), path.join(crDir, f));
      moved++;
    }
  }
  if (moved > 0) console.log(`[subpackage] pet_011+ 敌人面 ${moved} 张 → pkg-enemy-cr`);
}

function reportSizes() {
  const mainSize = dirSize(ROOT) - dirSize(path.join(ROOT, 'subpackages'));
  console.log('[subpackage] 主包约', formatKB(mainSize));
  for (const name of SUBPACKAGE_NAMES) {
    const sz = dirSize(path.join(ROOT, 'subpackages', name));
    if (sz > 0) console.log(`[subpackage] ${name} 约`, formatKB(sz));
  }
  if (mainSize > 4 * 1024 * 1024) {
    console.warn('[subpackage] 警告：主包仍超过 4MB');
  } else {
    console.log('[subpackage] 主包体积符合微信上传校验（<4MB）');
  }
  for (const name of SUBPACKAGE_NAMES) {
    const sz = dirSize(path.join(ROOT, 'subpackages', name));
    if (sz > 4 * 1024 * 1024) {
      console.warn(`[subpackage] 警告：${name} 超过 4MB`);
    }
  }
}

/** 幂等：已在分包结构则跳过（仍补跑 enemy 拆分） */
function alreadyOrganized() {
  return fs.existsSync(path.join(ROOT, 'subpackages/pkg-pet'));
}

/** 将误留在主包的大图迁回分包（构建幂等） */
function migrateOverflowFromMain() {
  const moves = [
    [path.join(ROOT, 'images/ui/shop'), path.join(ROOT, 'subpackages/pkg-shop/images/ui/shop')],
    [path.join(ROOT, 'images/ui/badge'), path.join(ROOT, 'subpackages/pkg-scene/images/ui/badge')],
    [path.join(ROOT, 'images/ui/panel'), path.join(ROOT, 'subpackages/pkg-scene/images/ui/panel')],
    [path.join(ROOT, 'images/ui/fx'), path.join(ROOT, 'subpackages/pkg-fx/images/ui/fx')],
    // 战斗 HUD 贴图约 3MB，必须出主包（微信主包 ≤4MB）
    [path.join(ROOT, 'images/ui/battle'), path.join(ROOT, 'subpackages/pkg-battle/images/ui/battle')],
  ];
  for (const [srcDir, destDir] of moves) {
    if (!fs.existsSync(srcDir)) continue;
    ensureDir(destDir);
    for (const f of fs.readdirSync(srcDir)) {
      moveFile(path.join(srcDir, f), path.join(destDir, f));
    }
    rmEmpty(srcDir);
  }
}

function main() {
  if (alreadyOrganized()) {
    migrateOverflowFromMain();
    splitEnemySubpackage();
    ensureSubpackageEntryFiles();
    console.log('[subpackage] 已是分包结构，补跑主包溢出迁移与 enemy 拆分');
    reportSizes();
    return;
  }

  const pkgPet = path.join(ROOT, 'subpackages/pkg-pet/images/pet');
  const pkgEnemy = path.join(ROOT, 'subpackages/pkg-enemy/images/enemy');
  const pkgSceneBg = path.join(ROOT, 'subpackages/pkg-scene/images/bg');
  const pkgSceneCard = path.join(ROOT, 'subpackages/pkg-scene/images/ui/card');
  const pkgFx = path.join(ROOT, 'subpackages/pkg-fx/images/ui/fx');
  const pkgAudio = path.join(ROOT, 'subpackages/pkg-audio/audio');

  move(path.join(ROOT, 'images/pet'), pkgPet);
  move(path.join(ROOT, 'images/enemy'), pkgEnemy);
  move(path.join(ROOT, 'images/ui/fx'), pkgFx);
  move(path.join(ROOT, 'images/ui/card'), pkgSceneCard);
  move(path.join(ROOT, 'audio'), pkgAudio);

  ensureDir(pkgSceneBg);
  const bgDir = path.join(ROOT, 'images/bg');
  if (fs.existsSync(bgDir)) {
    for (const f of fs.readdirSync(bgDir)) {
      if (f === 'scene_home.jpg') continue;
      moveFile(path.join(bgDir, f), path.join(pkgSceneBg, f));
    }
  }

  rmEmpty(path.join(ROOT, 'images/pet'));
  rmEmpty(path.join(ROOT, 'images/enemy'));
  rmEmpty(path.join(ROOT, 'images/ui/fx'));
  rmEmpty(path.join(ROOT, 'images/ui/card'));

  splitEnemySubpackage();
  migrateOverflowFromMain();
  ensureSubpackageEntryFiles();
  reportSizes();
}

main();
