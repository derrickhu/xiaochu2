import type { StageDef } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import { enemyStats } from '@/formulas/growth';
import { stageDrops } from '@/formulas/economyOutput';
import { getStageType } from '@/balance/stageTypes';
import { MECHANICS } from '@/balance/stageMechanics';
import { getDropTable } from '@/balance/drops';

export interface WaveComputed {
  index: number;
  label: string;
  hp: number;
  atk: number;
  def: number;
  capture: boolean;
}

export function computeStageWaves(stage: StageDef): WaveComputed[] {
  return stage.encounters.map((ref, i) => {
    const { def, bossDropPetId } = resolveEncounter(ref);
    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    const label = ref.kind === 'mob'
      ? `杂怪 ${def.name}`
      : `${def.name}${ref.tier === 'tier2' ? '·觉' : '·初'}`;
    return {
      index: i + 1,
      label,
      hp: stats.hp,
      atk: stats.atk,
      def: stats.def,
      capture: !!bossDropPetId,
    };
  });
}

export function formatWaves(waves: WaveComputed[]): string {
  return waves.map((w) =>
    `#${w.index} ${w.label}${w.capture ? ' [Boss掉]' : ''} HP${w.hp} ATK${w.atk} DEF${w.def}`,
  ).join('\n');
}

export function stageDropPreview(stage: StageDef, stars = 3) {
  return stageDrops(stage.dropTableId, stage.chapter, stars, stage.type);
}

export function stageMechanicLabels(stage: StageDef): string {
  return (stage.mechanics ?? [])
    .map((id) => MECHANICS[id]?.name ?? id)
    .join('、') || '—';
}

export function isGeneratedDropTable(dropTableId: string): boolean {
  return dropTableId === 'dt_trial_normal' || dropTableId === 'dt_trial_elite';
}

export function dropTableMeta(dropTableId: string): { expBase: number; shardNote: string } {
  const t = getDropTable(dropTableId);
  if (!t) return { expBase: 0, shardNote: '缺失' };
  const shards = t.shards.map((s) => `${s.petId}×${s.amount}`).join(', ');
  return { expBase: t.expBase, shardNote: shards || '无' };
}

export function stageTypeRow(stage: StageDef) {
  const st = getStageType(stage.type);
  return `${st.name} 体${st.staminaCost} 币×${st.coinMult} 经×${st.expMult} 片×${st.shardMult}`;
}
