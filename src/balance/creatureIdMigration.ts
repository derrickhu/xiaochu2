/**
 * 灵宠 ID 迁移表（pet_metal_003 / cr_* → pet_001…）
 * 单一真源：存档 v3、面板旧 ID 列、美术脚本均引用此表。
 */
export const CREATURE_ID_MIGRATION: Readonly<Record<string, string>> = {
  pet_metal_003: 'pet_001',
  pet_metal_004: 'pet_002',
  pet_wood_003: 'pet_003',
  pet_wood_004: 'pet_004',
  pet_water_003: 'pet_005',
  pet_water_004: 'pet_006',
  pet_fire_003: 'pet_007',
  pet_fire_004: 'pet_008',
  pet_earth_003: 'pet_009',
  pet_earth_004: 'pet_010',
  cr_golden_crane: 'pet_011',
  cr_tide_manta: 'pet_012',
  cr_thunder_cicada: 'pet_013',
  cr_shadow_roc: 'pet_014',
  cr_jadehorn_goat: 'pet_015',
  cr_kunlun_dragon: 'pet_016',
  cr_star_deer: 'pet_017',
  cr_chaos_fox: 'pet_018',
  cr_cloud_fox: 'pet_019',
  cr_abyss_jellyfish: 'pet_020',
  cr_frost_seal: 'pet_021',
  cr_guixu_whale: 'pet_022',
  cr_void_eye: 'pet_023',
  cr_red_crow: 'pet_024',
  cr_zhulong: 'pet_025',
  cr_outer_demon: 'pet_026',
  cr_stone_ape: 'pet_027',
  cr_guixu_turtle: 'pet_028',
  cr_star_gear: 'pet_029',
  cr_rift_beetle: 'pet_030',
};

const NEW_ID_SET = new Set(Object.values(CREATURE_ID_MIGRATION));

/** 旧 ID → 新 ID；已是 pet_XXX 则原样返回 */
export function migrateCreatureId(id: string): string | null {
  if (NEW_ID_SET.has(id)) return id;
  return CREATURE_ID_MIGRATION[id] ?? null;
}

export function legacyCreatureId(newId: string): string | undefined {
  for (const [oldId, mapped] of Object.entries(CREATURE_ID_MIGRATION)) {
    if (mapped === newId) return oldId;
  }
  return undefined;
}

/** pet_011+ 敌人立绘进 pkg-enemy-cr（承接原 cr_* 分包） */
export const CREATURE_CR_SUBPACKAGE_FROM = 11;

export function creatureUsesCrSubpackage(creatureId: string): boolean {
  const m = /^pet_(\d+)$/.exec(creatureId);
  if (!m) return false;
  return Number(m[1]) >= CREATURE_CR_SUBPACKAGE_FROM;
}
