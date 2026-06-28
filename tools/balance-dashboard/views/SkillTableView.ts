import { SKILLS, SKILL_MAP } from '@/balance/skills';
import { PETS } from '@/balance/pets';
import { mountDataTable } from '../components/DataTable';
import { aiPromptChip, panelTitle } from '../components/AiPromptChip';
import { getRaritySkillPower, RARITIES } from '@/balance/rarity';
import { formatBasePower, describeSkillBudget } from '@/balance/skills/display';

interface SkillRow {
  id: string;
  name: string;
  owner: string;
  category: string;
  cd: number;
  basePower: number;
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
    basePower: s.basePower,
    desc: s.desc,
    kind: s.owner === 'enemy' ? 'enemy' : 'pet',
  }));
}

function rarityPowerLegend(): string {
  return RARITIES.map((r) => `${r === 4 ? 'UR' : r === 3 ? 'SSR' : r === 2 ? 'SR' : 'R'}×${getRaritySkillPower(r)}`).join(' · ');
}

export function renderSkillsView(container: HTMLElement): void {
  container.innerHTML = `<section class="panel">${panelTitle('技能表', 'registry.ts · basePower 为 R 预算指数，战斗叠乘 effect 字段')}
      <p class="sub">稀有度倍率：${rarityPowerLegend()} · basePower 用于跨技能横向比较，非战斗直读</p>
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
      {
        key: 'bp', label: '强度预算', sortValue: (s) => s.basePower,
        render: (s) => {
          const sk = SKILL_MAP.get(s.id)!;
          const tip = describeSkillBudget(sk).replace(/"/g, '&quot;');
          return `<span title="${tip}">${formatBasePower(s.basePower)}</span>`;
        },
      },
      { key: 'fx', label: '效果说明', render: (s) => `<span class="sub">${s.desc}</span>` },
      {
        key: 'ai', label: 'AI', render: (s) => {
          const sk = SKILL_MAP.get(s.id);
          const hint = sk ? `${sk.desc.slice(0, 40)}… cd=${sk.cd} bp=${formatBasePower(sk.basePower)}` : s.id;
          return aiPromptChip('skills/registry.ts', s.id, hint, '调整技能');
        },
      },
    ],
  });
}
