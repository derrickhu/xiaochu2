import { PETS } from '@/balance/pets';
import { legacyCreatureId } from '@/balance/creatureIdMigration';
import { getRarity } from '@/balance/rarity';
import { PET_ROLE_NAME } from '@/balance/petRoles';
import { resolvePetPassiveBundle } from '@/balance/passiveEffects';
import { buildCaptureMap } from '../lib/aggregates';
import { petStatPreviews, formatStatPreview, creatureMonsterSummary } from '../lib/computedPet';
import { mountDataTable } from '../components/DataTable';
import { elementBadge, rarityBadge } from '../components/StatBadge';
import { aiPromptChip, panelTitle } from '../components/AiPromptChip';
import { fmtProfile } from '../lib/format';
import { getSkill } from '@/balance/skills';

export function renderPetsView(container: HTMLElement): void {
  container.innerHTML = `<section class="panel">${panelTitle('灵宠表', '30 只 · 衍生列走 formulas/growth')}</section>`;
  const panel = container.querySelector('.panel') as HTMLElement;
  const captureMap = buildCaptureMap();

  mountDataTable(panel, {
    rows: PETS,
    searchText: (p) => `${p.id} ${p.name} ${p.element} ${p.role}`,
    rowDetail: (p) => {
      const passive = resolvePetPassiveBundle(p.role, p.rarity, 1);
      const passiveLines = passive.effects
        .filter((e) => e.unlocked)
        .map((e) => `${e.displayName ?? e.kind}: ${e.kind} ${JSON.stringify(e.value)}`)
        .join('\n');
      return [
        formatStatPreview(petStatPreviews(p)),
        creatureMonsterSummary(p.id),
        `被动(L1展示):\n${passiveLines || '—'}`,
      ].join('\n\n');
    },
    columns: [
      { key: 'id', label: 'ID', sortValue: (p) => Number(p.id.slice(4)), render: (p) => `<span class="mono">${p.id}</span>` },
      {
        key: 'legacy', label: '旧 ID', sortValue: (p) => legacyCreatureId(p.id) ?? '',
        render: (p) => {
          const old = legacyCreatureId(p.id);
          return old ? `<span class="mono sub">${old}</span>` : '—';
        },
      },
      { key: 'name', label: '名', sortValue: (p) => p.name, render: (p) => p.name },
      { key: 'el', label: '属性', sortValue: (p) => p.element, render: (p) => elementBadge(p.element) },
      { key: 'r', label: '稀有', sortValue: (p) => p.rarity, render: (p) => rarityBadge(p.rarity) },
      { key: 'role', label: '定位', sortValue: (p) => p.role, render: (p) => PET_ROLE_NAME[p.role] },
      {
        key: 'skill', label: '技能', render: (p) => {
          const sk = getSkill(p.skillId);
          if (!sk) return p.skillId;
          const brief = sk.desc.length > 36 ? `${sk.desc.slice(0, 36)}…` : sk.desc;
          return `<span title="${sk.desc.replace(/"/g, '&quot;')}">${sk.name} CD${sk.cd}<br><span class="sub">${brief}</span></span>`;
        },
      },
      {
        key: 'stat', label: '修正', render: (p) =>
          `<span class="sub">${fmtProfile(p.statProfile as Record<string, number>)} / ${fmtProfile(p.growthProfile as Record<string, number>)}</span>`,
      },
      {
        key: 'lv30', label: '★1 Lv30攻', sortValue: (p) => petStatPreviews(p)[0].lv30.atk,
        render: (p) => String(petStatPreviews(p)[0].lv30.atk),
      },
      {
        key: 'cap', label: '收录关', render: (p) => captureMap.get(p.id) ?? '—',
      },
      {
        key: 'ai', label: 'AI', render: (p) =>
          aiPromptChip('creatures.ts', p.id, `${getRarity(p.rarity).code} ${p.role}`, '调整稀有度/role/statProfile'),
      },
    ],
  });
}
