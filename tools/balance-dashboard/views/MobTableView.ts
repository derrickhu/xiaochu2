import { MOBS } from '@/balance/enemies';
import { STAGES } from '@/balance/stages';
import { enemyStats } from '@/formulas/growth';
import { mountDataTable } from '../components/DataTable';
import { elementBadge } from '../components/StatBadge';
import { aiPromptChip, panelTitle } from '../components/AiPromptChip';

function mobStageRefs(mobId: string): string {
  const ids: string[] = [];
  for (const s of STAGES) {
    if (s.encounters.some((e) => e.kind === 'mob' && e.id === mobId)) ids.push(s.id);
  }
  return ids.slice(0, 8).join(', ') + (ids.length > 8 ? ` +${ids.length - 8}` : '');
}

export function renderMobsView(container: HTMLElement): void {
  container.innerHTML = `<section class="panel">${panelTitle('杂怪表', '9 种 · 核心 6 + Boss 魔物 3')}</section>`;
  const panel = container.querySelector('.panel') as HTMLElement;

  mountDataTable(panel, {
    rows: [...MOBS],
    searchText: (m) => `${m.id} ${m.name}`,
    rowDetail: (m) => {
      const lines = [1, 3, 8].map((ch) => {
        const s = enemyStats(m, ch, 1);
        return `第${ch}章×1.0: HP${s.hp} ATK${s.atk} DEF${s.def}`;
      });
      return lines.join('\n');
    },
    columns: [
      { key: 'id', label: 'ID', sortValue: (m) => m.id, render: (m) => `<span class="mono">${m.id}</span>` },
      { key: 'name', label: '名', sortValue: (m) => m.name, render: (m) => m.name },
      { key: 'el', label: '属性', render: (m) => elementBadge(m.element) },
      { key: 'hp', label: '基HP', sortValue: (m) => m.baseHp, render: (m) => String(m.baseHp) },
      { key: 'atk', label: '基ATK', sortValue: (m) => m.baseAtk, render: (m) => String(m.baseAtk) },
      { key: 'def', label: '基DEF', sortValue: (m) => m.baseDef, render: (m) => String(m.baseDef) },
      {
        key: 'ch1', label: '1章HP', sortValue: (m) => enemyStats(m, 1, 1).hp,
        render: (m) => String(enemyStats(m, 1, 1).hp),
      },
      { key: 'refs', label: '引用关', render: (m) => `<span class="sub">${mobStageRefs(m.id)}</span>` },
      {
        key: 'ai', label: 'AI', render: (m) =>
          aiPromptChip('enemies.ts', m.id, `HP${m.baseHp} ATK${m.baseAtk}`, '调整杂怪基值'),
      },
    ],
  });
}
