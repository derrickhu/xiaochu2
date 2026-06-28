import {
  overviewStats, chapterSummaries, gachaSummary, economySummary, CHAPTER_BUDGET, chapterBossStage,
} from '../lib/aggregates';
import { runVerifyCases } from '../lib/verify';
import { fmtPct } from '../lib/format';
import { panelTitle } from '../components/AiPromptChip';
import { simulateBattle } from '@/formulas/simulation';
import { buildTeam, COMBO_MODELS } from '@/formulas/simulationReport';
import { DEFAULT_TEAM } from '@/balance/pets';

export function renderOverview(container: HTMLElement): void {
  const stats = overviewStats();
  const chapters = chapterSummaries();
  const gacha = gachaSummary();
  const eco = economySummary();
  const verify = runVerifyCases();

  const cards = `
    <div class="cards">
      <div class="card"><div class="card__label">灵宠</div><div class="card__value">${stats.pets}</div></div>
      <div class="card"><div class="card__label">关卡</div><div class="card__value">${stats.stages}</div></div>
      <div class="card"><div class="card__label">杂怪</div><div class="card__value">${stats.mobs}</div></div>
      <div class="card"><div class="card__label">收录点</div><div class="card__value">${stats.captures}</div></div>
      <div class="card"><div class="card__label">章节</div><div class="card__value">${stats.chapters}</div></div>
      <div class="card"><div class="card__label">开局池</div><div class="card__value">${stats.starters}</div></div>
    </div>`;

  const gachaRows = gacha.map((g) =>
    `<tr><td>${g.code}</td><td>${g.name}</td><td>${fmtPct(g.rate)}</td><td>×${g.statMult}</td></tr>`,
  ).join('');

  const chRows = chapters.map((ch) =>
    `<tr>
      <td>${ch.chapter}</td>
      <td>${ch.name}</td>
      <td>${ch.stageCount}</td>
      <td>${ch.bossId}</td>
      <td>${ch.rewardPetName}</td>
      <td>${ch.bossChallenge}</td>
    </tr>`,
  ).join('');

  const budgetRows = Object.values(CHAPTER_BUDGET).map((b) => {
    const team = buildTeam(DEFAULT_TEAM, b.enterLevel, b.enterStar);
    const boss = chapterBossStage(b.chapter);
    const bossStage = boss?.id ?? '—';
    const sim = boss ? simulateBattle(team, boss.id, COMBO_MODELS.mid) : null;
    return `<tr>
      <td>${b.chapter}</td>
      <td>进 Lv${b.enterLevel}/★${b.enterStar}</td>
      <td>通 Lv${b.clearLevel}</td>
      <td>${bossStage}</td>
      <td class="${sim?.win ? 'pill-ok' : 'pill-bad'}">${sim ? (sim.win ? `胜 ${sim.stars}★` : '败') : '—'}</td>
    </tr>`;
  }).join('');

  const verifyHtml = verify.map((v) =>
    `<li class="${v.pass ? 'verify-ok' : 'verify-bad'}">${v.pass ? '✓' : '✗'} ${v.name}：期望 ${v.expected}，实际 ${v.actual}</li>`,
  ).join('');

  container.innerHTML = `
    <section class="panel">${panelTitle('总览', '52 关 · 8 收录 · Boss 挑战 archetype')}
      ${cards}
    </section>
    <section class="panel">
      <h2>抽卡 / 经济摘要</h2>
      <p class="sub">单抽 ${eco.singleCost} 灵玉 · 十连 ${eco.tenCost} · 保底 ${eco.pitySSR} · 开局灵玉 ${eco.starterLingyu}</p>
      <p class="sub">灵宠币：关底 ${eco.coinStageBase} × 章节 ${eco.coinChapterGrowth}^n</p>
      <table class="data"><thead><tr><th>档</th><th>名</th><th>概率</th><th>面板倍率</th></tr></thead>
      <tbody>${gachaRows}</tbody></table>
    </section>
    <section class="panel">
      <h2>章节一览</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>章</th><th>名</th><th>关数</th><th>Boss关</th><th>收录宠</th><th>Boss挑战</th></tr></thead>
        <tbody>${chRows}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <h2>章节预算 vs 模拟（仅 1～3 章有 CHAPTER_BUDGET）</h2>
      <p class="sub">4～8 章无预算锚点，勿硬套红绿灯</p>
      <table class="data"><thead><tr><th>章</th><th>进入期望</th><th>通关期望</th><th>Boss关</th><th>中手模拟</th></tr></thead>
      <tbody>${budgetRows}</tbody></table>
    </section>
    <section class="panel">
      <h2>数值一致性抽检</h2>
      <ul>${verifyHtml}</ul>
    </section>`;
}
