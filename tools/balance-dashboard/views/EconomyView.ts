import { ECONOMY } from '@/balance/economy';
import { RARITIES, getRarity } from '@/balance/rarity';
import { stageCoinReward } from '@/formulas/economyOutput';
import { recruitPrice, starUpShardCost } from '@/formulas/economyOutput';
import { panelTitle } from '../components/AiPromptChip';
import { fmtNum, fmtPct } from '../lib/format';
import { CHAPTERS } from '@/balance/stages';
import { getStageType } from '@/balance/stageTypes';
import { DAILY_TARGET_TOLERANCE, getDailyTarget } from '@/balance/powerBudget';
import { staminaCap } from '@/game/staminaService';
import {
  AD_PLACEMENTS, AD_PLACEMENT_IDS, ECONOMY_IAP,
} from '@/balance/monetization';

export function renderEconomyView(container: HTMLElement): void {
  const g = ECONOMY.gacha;
  const coinRows = CHAPTERS.map((ch) => {
    const c1 = stageCoinReward(ch, 1, 'normal');
    const c3 = stageCoinReward(ch, 3, 'normal');
    const elite = stageCoinReward(ch, 3, 'elite');
    const boss = stageCoinReward(ch, 3, 'boss');
    const target = getDailyTarget(ch);
    return `<tr><td>${ch}</td><td>${fmtNum(c1)}</td><td>${fmtNum(c3)}</td>`
      + `<td>${fmtNum(elite)}</td><td>${fmtNum(boss)}</td>`
      + `<td>${fmtNum(target.coins)}</td><td>${fmtNum(target.exp)}</td>`
      + `<td>${fmtNum(target.universal)}</td></tr>`;
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

  const adRows = AD_PLACEMENT_IDS.map((id) => {
    const p = AD_PLACEMENTS[id];
    return `<tr><td>${p.name}</td><td class="mono">${id}</td><td>${p.dailyLimit}</td>`
      + `<td>${p.gatedElsewhere ? '由玩法次数代管' : '广告位自算'}</td></tr>`;
  }).join('');

  const iapNote = ECONOMY_IAP.skus
    .map((s) => `${s.name} ¥${(s.priceFen / 100).toFixed(0)}`)
    .join(' · ');

  container.innerHTML = `
    <section class="panel">${panelTitle('经济 / 抽卡', '真源 economy.ts + rarity.ts')}
      <h3>抽卡（灵玉）</h3>
      <p class="sub">单抽 ${g.singleCost} · 十连 ${g.tenCost} · SSR+保底 ${g.pitySSR} · 十连保底 rarity≥${g.tenPullFloorRarity} · 开局 ${g.starterLingyu}</p>
      <table class="data"><thead><tr><th>档</th><th>概率</th><th>权重</th><th>重复碎片</th></tr></thead><tbody>${gachaRows}</tbody></table>
      <h3>关卡产出与日产目标（按章）</h3>
      <p class="sub">前四列为单场灵宠币；后三列为 powerBudget.DAILY_TARGET 的每日应产量（容差 ±${fmtPct(DAILY_TARGET_TOLERANCE)}）</p>
      <table class="data"><thead><tr>
        <th>章</th><th>普1★</th><th>普3★</th><th>精3★</th><th>Boss3★</th>
        <th>日产币</th><th>日产经验</th><th>日产通用</th>
      </tr></thead><tbody>${coinRows}</tbody></table>
      <h3>招募价</h3>
      <table class="data"><thead><tr><th>序号</th><th>价格</th></tr></thead><tbody>${recruitRows}</tbody></table>
      <h3>升星碎片</h3>
      <table class="data"><thead><tr><th>目标</th><th>消耗</th></tr></thead><tbody>${starRows}</tbody></table>
      <h3>体力 / 商店 / 里程碑</h3>
      <p class="sub">体力上限 ${staminaCap(1)}（第 1 章）→ ${staminaCap(CHAPTERS.length)}（第 ${CHAPTERS.length} 章）
        · 恢复 ${ECONOMY.stamina.regenSeconds}s/点 · 第 ${ECONOMY.stamina.freeChapters} 章前免体力
        · 单场 普${getStageType('normal').staminaCost} 精${getStageType('elite').staminaCost}
        Boss${getStageType('boss').staminaCost} 秘境${getStageType('dailyResource').staminaCost} 通天塔免费</p>
      <p class="sub">首通灵玉 普${ECONOMY.milestone.firstClearLingyu} Boss${ECONOMY.milestone.bossFirstClearLingyu} · 失败经验返还 ${fmtPct(ECONOMY.defeat.expRefundPct)}</p>
      <p class="sub">商店碎片包 ${ECONOMY.shop.packSize} 片 · 通用碎片包 ${ECONOMY.shop.universalPackSize} 片 / ${ECONOMY.shop.universalPackCost} 币</p>
      <h3>激励广告位（IAA）</h3>
      <table class="data"><thead><tr><th>位点</th><th>id</th><th>日限</th><th>日限归属</th></tr></thead>
        <tbody>${adRows}</tbody></table>
      <p class="sub">内购：${ECONOMY_IAP.enabled ? '已开启' : '未开启（SKU 已预留）'} · ${iapNote}</p>
    </section>`;

  void starUpShardCost;
}
