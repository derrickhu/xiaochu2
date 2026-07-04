import { SKILLS, SKILL_MAP } from '@/balance/skills';
import { PETS } from '@/balance/pets';
import { mountDataTable } from '../components/DataTable';
import { aiPromptChip, panelTitle } from '../components/AiPromptChip';

interface SkillRow {
  id: string;
  name: string;
  owner: string;
  category: string;
  cd: number;
  desc: string;
  kind: 'pet' | 'enemy';
}

function buildSkillRows(): SkillRow[] {
  return SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    owner: s.owner,
    category: s.category,
    cd: s.cd,
    desc: s.desc,
    kind: s.owner === 'enemy' ? 'enemy' : 'pet',
  }));
}

export function renderSkillsView(container: HTMLElement): void {
  container.innerHTML = `<section class="panel">${panelTitle('技能表', 'skills/registry.ts · 战斗结算读 effect 字段')}
    </section>`;
  const panel = container.querySelector('.panel') as HTMLElement;

  const petSkillMap = new Map(PETS.map((p) => [p.skillId, p.id]));

  mountDataTable(panel, {
    rows: buildSkillRows(),
    searchText: (s) => `${s.id} ${s.name} ${s.desc}`,
    columns: [
      { key: 'id', label: 'ID', sortValue: (s) => s.id, render: (s) => `<span class="mono">${s.id}</span>` },
      { key: 'name', label: '名', sortValue: (s) => s.name, render: (s) => s.name },
      { key: 'cat', label: '分类', sortValue: (s) => s.category, render: (s) => `<span class="sub">${s.category}</span>` },
      { key: 'kind', label: '归属', render: (s) => s.kind },
      {
        key: 'pet', label: '宠物', render: (s) => {
          if (s.kind === 'enemy') return '—';
          return petSkillMap.get(s.id) ?? '—';
        },
      },
      { key: 'cd', label: 'CD', sortValue: (s) => s.cd, render: (s) => String(s.cd) },
      { key: 'fx', label: '效果说明', render: (s) => `<span class="sub">${s.desc}</span>` },
      {
        key: 'ai', label: 'AI', render: (s) => {
          const sk = SKILL_MAP.get(s.id);
          const hint = sk ? `${sk.desc.slice(0, 40)}… cd=${sk.cd}` : s.id;
          return aiPromptChip('skills/registry.ts', s.id, hint, '调整技能');
        },
      },
    ],
  });
}
