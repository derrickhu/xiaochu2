import { COMBAT } from '@/balance/combat';
import { GROWTH, STAR_PROFILES, CHAPTER_BUDGET } from '@/balance/growth';
import { RARITIES, getRarity } from '@/balance/rarity';
import { PET_ROLE_PROFILES, PET_ROLE_NAME, type PetRole } from '@/balance/petRoles';
import { panelTitle, aiPromptChip } from '../components/AiPromptChip';
import { fmtPct } from '../lib/format';

export function renderGlobalsView(container: HTMLElement): void {
  const starRows = Object.entries(STAR_PROFILES).map(([star, p]) =>
    `<tr><td>★${star}</td><td>maxLv ${p.maxLevel}</td><td>base×${p.baseMult.atk}/${p.baseMult.hp}/${p.baseMult.rcv}</td><td>skillTier ${p.skillTier}</td></tr>`,
  ).join('');

  const roleRows = (Object.keys(PET_ROLE_PROFILES) as PetRole[]).map((role) => {
    const p = PET_ROLE_PROFILES[role];
    return `<tr><td>${PET_ROLE_NAME[role]}</td><td>攻${p.base.atk} 血${p.base.hp}</td><td>成长 ${p.growth.atk}/${p.growth.hp}</td></tr>`;
  }).join('');

  container.innerHTML = `
    <section class="panel">${panelTitle('全局常量', 'combat / growth / rarity / roles')}
      <h3>战斗 COMBAT</h3>
      <p class="sub">棋盘 ${COMBAT.boardCols}×${COMBAT.boardRows} · 英雄基血 ${COMBAT.heroBaseHp} · 暴击 ${fmtPct(COMBAT.critChance)} ×${COMBAT.critBase}</p>
      <p class="sub">克制 ×${COMBAT.counterMultiplier} / 被克 ×${COMBAT.counteredMultiplier} · 防缩放 ${COMBAT.defenseScale}</p>
      ${aiPromptChip('combat.ts', 'counterMultiplier', String(COMBAT.counterMultiplier), '全局战斗常量')}
      <h3>成长 GROWTH</h3>
      <p class="sub">宠物经验 ${GROWTH.pet.expBase} × ${GROWTH.pet.expGrowth}^n · 敌人章成长 HP${GROWTH.enemy.chapterGrowthHp} ATK${GROWTH.enemy.chapterGrowthAtk}</p>
      ${aiPromptChip('growth.ts', 'enemy.chapterGrowthHp', String(GROWTH.enemy.chapterGrowthHp), '敌人章节曲线')}
      <h3>星级 STAR_PROFILES</h3>
      <table class="data"><thead><tr><th>星</th><th>等级上限</th><th>初始倍率</th><th>技能档</th></tr></thead><tbody>${starRows}</tbody></table>
      <h3>定位模板</h3>
      <table class="data"><thead><tr><th>定位</th><th>基础</th><th>成长率</th></tr></thead><tbody>${roleRows}</tbody></table>
      <h3>稀有度抽卡</h3>
      <ul>${RARITIES.map((r) => {
    const d = getRarity(r);
    return `<li>${d.code} ${fmtPct(d.gachaRate)} 面板×${d.statMult}</li>`;
  }).join('')}</ul>
      <h3>章节预算（仅 1～3 章）</h3>
      <ul>${Object.values(CHAPTER_BUDGET).map((b) =>
    `<li>第${b.chapter}章：进 Lv${b.enterLevel}/★${b.enterStar} → 通 Lv${b.clearLevel}</li>`,
  ).join('')}</ul>
    </section>`;
}
