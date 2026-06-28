import { PET_ROLE_NAME, type PetRole } from '@/balance/petRoles';
import { ROLE_PASSIVE_L0, ROLE_PASSIVE_LADDER, type PassiveLayer } from '@/balance/passives';
import { panelTitle, aiPromptChip } from '../components/AiPromptChip';

function layerDesc(layer: PassiveLayer): string {
  const e = layer.effect;
  switch (e.kind) {
    case 'teamDamageBonus': return `全队伤害 +${Math.round(e.base * 100)}%`;
    case 'regen': return `回合回血 +${Math.round(e.base * 100)}%`;
    case 'startShield': return `开战护盾 +${Math.round(e.base * 100)}%`;
    case 'statSelf': return `自身${e.stat} +${Math.round(e.base * 100)}%`;
    case 'statTeam': return `全队${e.stat} +${Math.round(e.base * 100)}%`;
    case 'aura': return `光环 ${e.stat} +${Math.round(e.base * 100)}%`;
    case 'critRate': return `暴击 +${Math.round(e.base * 100)}%`;
    case 'critDamage': return `暴伤 +${Math.round(e.base * 100)}%`;
    case 'damageReduction': return `减伤 +${Math.round(e.base * 100)}%`;
    case 'healBonus': return `治疗 +${Math.round(e.base * 100)}%`;
  }
}

export function renderPassivesView(container: HTMLElement): void {
  const roles = Object.keys(ROLE_PASSIVE_LADDER) as PetRole[];
  let html = `<section class="panel">${panelTitle('被动阶梯', 'passives.ts · 按 role×rarity 派生，不可 per-pet')}`;

  for (const role of roles) {
    html += `<h3>${PET_ROLE_NAME[role]}</h3>`;
    html += `<p class="sub">L0 ${ROLE_PASSIVE_L0[role].name}: ${layerDesc(ROLE_PASSIVE_L0[role])}</p>`;
    html += '<table class="data"><thead><tr><th>层</th><th>名</th><th>效果</th><th>解锁</th></tr></thead><tbody>';
    const unlockLabels = ['R/SR (L1)', 'R/SR (L2)', 'SSR+ (L3)', 'UR (L3)'];
    ROLE_PASSIVE_LADDER[role].forEach((layer, i) => {
      html += `<tr><td>L${i + 1}</td><td>${layer.name}</td><td>${layerDesc(layer)}</td><td>${unlockLabels[i] ?? '—'}</td></tr>`;
    });
    html += '</tbody></table>';
    html += aiPromptChip('passives.ts', `ROLE_PASSIVE_LADDER.${role}`, role, '调整被动阶梯');
  }
  html += '</section>';
  container.innerHTML = html;
}
