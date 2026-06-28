#!/usr/bin/env node
/**
 * 一次性：旧灵宠 ID 美术文件 → pet_001…pet_030
 * 在 minigame/images/pet 与 minigame/images/enemy（及分包目录）执行重命名。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../minigame');

const MIGRATION = {
  pet_metal_003: 'pet_001', pet_metal_004: 'pet_002', pet_wood_003: 'pet_003', pet_wood_004: 'pet_004',
  pet_water_003: 'pet_005', pet_water_004: 'pet_006', pet_fire_003: 'pet_007', pet_fire_004: 'pet_008',
  pet_earth_003: 'pet_009', pet_earth_004: 'pet_010',
  cr_golden_crane: 'pet_011', cr_tide_manta: 'pet_012', cr_thunder_cicada: 'pet_013', cr_shadow_roc: 'pet_014',
  cr_jadehorn_goat: 'pet_015', cr_kunlun_dragon: 'pet_016', cr_star_deer: 'pet_017', cr_chaos_fox: 'pet_018',
  cr_cloud_fox: 'pet_019', cr_abyss_jellyfish: 'pet_020', cr_frost_seal: 'pet_021', cr_guixu_whale: 'pet_022',
  cr_void_eye: 'pet_023', cr_red_crow: 'pet_024', cr_zhulong: 'pet_025', cr_outer_demon: 'pet_026',
  cr_stone_ape: 'pet_027', cr_guixu_turtle: 'pet_028', cr_star_gear: 'pet_029', cr_rift_beetle: 'pet_030',
};

const SUFFIXES = ['', '_s3', '_awakened'];

const DIRS = [
  path.join(ROOT, 'images/pet'),
  path.join(ROOT, 'images/enemy'),
  path.join(ROOT, 'subpackages/pkg-pet/images/pet'),
  path.join(ROOT, 'subpackages/pkg-enemy/images/enemy'),
  path.join(ROOT, 'subpackages/pkg-enemy-cr/images/enemy'),
];

function renameInDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const [oldId, newId] of Object.entries(MIGRATION)) {
    for (const suf of SUFFIXES) {
      const src = path.join(dir, `${oldId}${suf}.png`);
      const dest = path.join(dir, `${newId}${suf}.png`);
      if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
      fs.renameSync(src, dest);
      n++;
      console.log(`${path.relative(ROOT, src)} → ${path.basename(dest)}`);
    }
  }
  return n;
}

let total = 0;
for (const d of DIRS) total += renameInDir(d);
console.log(`rename-creature-assets: ${total} 文件`);
