import type { PetDef } from '@/balance/pets';
import { getStarProfile } from '@/balance/growth';
import { getRarity } from '@/balance/rarity';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { CREATURE_MAP } from '@/balance/creatures';

export interface PetStatPreview {
  star: number;
  maxLevel: number;
  lv1: { atk: number; hp: number; rcv: number };
  lv30: { atk: number; hp: number; rcv: number };
  lvMax: { atk: number; hp: number; rcv: number };
}

export function petStatPreviews(pet: PetDef): PetStatPreview[] {
  const stars = [1, 2, 3, 4, 5] as const;
  return stars.map((star) => {
    const maxLevel = getStarProfile(star).maxLevel;
    const lv30 = Math.min(30, maxLevel);
    const mk = (lv: number) => ({
      atk: petAtk(pet, lv, star),
      hp: petHp(pet, lv, star),
      rcv: petRcv(pet, lv, star),
    });
    return { star, maxLevel, lv1: mk(1), lv30: mk(lv30), lvMax: mk(maxLevel) };
  });
}

export function formatStatPreview(previews: PetStatPreview[]): string {
  return previews.map((p) => {
    const s = `★${p.star}(maxLv${p.maxLevel})`;
    const fmt = (label: string, st: { atk: number; hp: number; rcv: number }) =>
      `${label}:攻${st.atk} 血${st.hp} 回复${st.rcv}`;
    return `${s} ${fmt('L1', p.lv1)} | ${fmt('L30', p.lv30)} | ${fmt('Lmax', p.lvMax)}`;
  }).join('\n');
}

export function creatureMonsterSummary(petId: string): string {
  const c = CREATURE_MAP.get(petId);
  if (!c) return '—';
  const t1 = c.monster.tier1;
  const t2 = c.monster.tier2;
  return [
    `T1 HP${t1.baseHp} ATK${t1.baseAtk} DEF${t1.baseDef} 间隔${t1.attackInterval}`,
    `T2 HP${t2.baseHp} ATK${t2.baseAtk} DEF${t2.baseDef} 间隔${t2.attackInterval}`,
  ].join('\n');
}
