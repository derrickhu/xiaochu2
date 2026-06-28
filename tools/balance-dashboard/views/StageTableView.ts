import { STAGES } from '@/balance/stages';
import {
  computeStageWaves, formatWaves, stageDropPreview, stageMechanicLabels,
  stageTypeRow, isGeneratedDropTable, dropTableMeta,
} from '../lib/computedStage';
import { mountDataTable } from '../components/DataTable';
import { elementBadge } from '../components/StatBadge';
import { aiPromptChip, panelTitle } from '../components/AiPromptChip';
import { simulateBattle } from '@/formulas/simulation';
import { buildTeam, COMBO_MODELS } from '@/formulas/simulationReport';
import { DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR } from '@/balance/pets';
import { winBadge } from '../components/StatBadge';

const defaultTeam = buildTeam(DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR);

export function renderStagesView(container: HTMLElement): void {
  container.innerHTML = `<section class="panel">${panelTitle('关卡表', `${STAGES.length} 关 · 含遭遇衍生 HP/ATK · 模拟列按需`)}</section>`;
  const panel = container.querySelector('.panel') as HTMLElement;

  const simCache = new Map<string, ReturnType<typeof simulateBattle>>();

  mountDataTable(panel, {
    rows: STAGES,
    searchText: (s) => `${s.id} ${s.name} ${s.chapter}`,
    rowDetail: (s) => {
      const drops = stageDropPreview(s, 3);
      const meta = dropTableMeta(s.dropTableId);
      const gen = isGeneratedDropTable(s.dropTableId) ? '[generated 历练表]' : '';
      return [
        formatWaves(computeStageWaves(s)),
        `机制: ${stageMechanicLabels(s)}`,
        `类型倍率: ${stageTypeRow(s)}`,
        `掉落表 ${s.dropTableId} ${gen} expBase=${meta.expBase} 片=${meta.shardNote}`,
        `3★预览: exp=${drops.exp} shards=${drops.shards.map((x) => `${x.petId}×${x.count}`).join(', ') || '无'}`,
      ].join('\n');
    },
    columns: [
      { key: 'id', label: 'ID', sortValue: (s) => s.id, render: (s) => `<span class="mono">${s.id}</span>` },
      { key: 'ch', label: '章', sortValue: (s) => s.chapter, render: (s) => String(s.chapter) },
      { key: 'idx', label: '序', sortValue: (s) => s.index, render: (s) => String(s.index) },
      { key: 'name', label: '名', sortValue: (s) => s.name, render: (s) => s.name },
      { key: 'type', label: '类型', render: (s) => s.type + (s.isBoss ? ' BOSS' : '') },
      { key: 'el', label: '属性', render: (s) => elementBadge(s.element) },
      { key: 'diff', label: '难度', sortValue: (s) => s.difficulty, render: (s) => String(s.difficulty) },
      { key: 'waves', label: '波', sortValue: (s) => s.encounters.length, render: (s) => String(s.encounters.length) },
      {
        key: 'hp', label: '末波HP', sortValue: (s) => {
          const w = computeStageWaves(s);
          return w[w.length - 1]?.hp ?? 0;
        },
        render: (s) => {
          const w = computeStageWaves(s);
          return String(w[w.length - 1]?.hp ?? '—');
        },
      },
      {
        key: 'sim', label: '中手', render: (s) => {
          if (!simCache.has(s.id)) {
            simCache.set(s.id, simulateBattle(defaultTeam, s.id, COMBO_MODELS.mid));
          }
          const r = simCache.get(s.id)!;
          return winBadge(r.win, r.stars);
        },
      },
      {
        key: 'drop', label: '掉落', render: (s) =>
          isGeneratedDropTable(s.dropTableId)
            ? `<span class="tag-gen">trial</span> ${s.dropTableId}`
            : s.dropTableId,
      },
      {
        key: 'ai', label: 'AI', render: (s) =>
          aiPromptChip('stages.ts', s.id, `difficulty=${s.difficulty}`, '调整难度/回合/遭遇'),
      },
    ],
  });
}
