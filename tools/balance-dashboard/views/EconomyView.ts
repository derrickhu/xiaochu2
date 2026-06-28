import { ECONOMY } from '@/balance/economy';
import { RARITIES, getRarity } from '@/balance/rarity';
import { stageCoinReward } from '@/formulas/economyOutput';
import { recruitPrice, starUpShardCost } from '@/formulas/economyOutput';
import { panelTitle } from '../components/AiPromptChip';
import { fmtNum, fmtPct } from '../lib/format';
import { CHAPTERS } from '@/balance/stages';

export function renderEconomyView(container: HTMLElement): void {
  const g = ECONOMY.gacha;
  const coinRows = CHAPTERS.map((ch) => {
    const c1 = stageCoinReward(ch, 1, false);
    const c3 = stageCoinReward(ch, 3, false);
    const boss = stageCoinReward(ch, 3, true);
    return `<tr><td>${ch}</td><td>${fmtNum(c1)}</td><td>${fmtNum(c3)}</td><td>${fmtNum(boss)}</td></tr>`;
  }).join('');

  const gachaRows = RARITIES.map((r) => {
    const d = getRarity(r);
    return `<tr><td>${d.code}</td><td>${fmtPct(d.gachaRate)}</td><td>${d.gachaWeight}</td><td>重复→${g.duplicateShards[r]}片</td></tr>`;
  }).join('');

  const starRows = Object.entries(ECONOMY.starUpShards)
    .map(([star, cost]) => `<tr><td>→★${star}</td><td>${cost} 片</td></tr>`)
    .join('');

  const recruitRows = [0, 1, 5, 10, 20].map((n) =>
    `<tr><td>第${n + 1}只</td><td>${fmtNum(recruitPrice(n))} 币</td></tr>`,
  ).join('');

  container.innerHTML = `
    <section class="panel">${panelTitle('经济 / 抽卡', '真源 economy.ts + rarity.ts')}
      <h3>抽卡（灵玉）</h3>
      <p class="sub">单抽 ${g.singleCost} · 十连 ${g.tenCost} · SSR+保底 ${g.pitySSR} · 十连保底 rarity≥${g.tenPullFloorRarity} · 开局 ${g.starterLingyu}</p>
      <table class="data"><thead><tr><th>档</th><th>概率</th><th>权重</th><th>重复碎片</th></tr></thead><tbody>${gachaRows}</tbody></table>
      <h3>灵宠币产出（按章，3★）</h3>
      <table class="data"><thead><tr><th>章</th><th>1★</th><th>3★</th><th>Boss3★</th></tr></thead><tbody>${coinRows}</tbody></table>
      <h3>招募价</h3>
      <table class="data"><thead><tr><th>序号</th><th>价格</th></tr></thead><tbody>${recruitRows}</tbody></table>
      <h3>升星碎片</h3>
      <table class="data"><thead><tr><th>目标</th><th>消耗</th></tr></thead><tbody>${starRows}</tbody></table>
      <h3>体力 / 商店 / 里程碑</h3>
      <p class="sub">体力 ${ECONOMY.stamina.max} 上限 · 每关 ${ECONOMY.stamina.perStage} · 恢复 ${ECONOMY.stamina.regenSeconds}s/点</p>
      <p class="sub">首通灵玉 普${ECONOMY.milestone.firstClearLingyu} Boss${ECONOMY.milestone.bossFirstClearLingyu} · 失败经验返还 ${fmtPct(ECONOMY.defeat.expRefundPct)}</p>
      <p class="sub">商店碎片包 ${ECONOMY.shop.packSize} 片 · 每日轮换 ${ECONOMY.shop.dailyRotationCount} 只</p>
    </section>`;

  void starUpShardCost;
}
