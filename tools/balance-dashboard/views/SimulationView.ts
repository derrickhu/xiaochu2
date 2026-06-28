import { STAGES } from '@/balance/stages';
import { simulateBattle, simulateMatrix } from '@/formulas/simulation';
import {
  buildTeam, COMBO_MODELS, formatResult, type StageReportRow,
} from '@/formulas/simulationReport';
import { DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR, PETS } from '@/balance/pets';
import { panelTitle } from '../components/AiPromptChip';
import { winBadge } from '../components/StatBadge';

const TEAM_PRESETS: Record<string, readonly string[]> = {
  default: DEFAULT_TEAM,
  burst: ['pet_002', 'pet_016', 'pet_006', 'pet_026', 'pet_008'],
  weak: ['pet_019', 'pet_027', 'pet_015', 'pet_005', 'pet_001'],
};

export function renderSimulationView(container: HTMLElement): void {
  container.innerHTML = `
    <section class="panel">${panelTitle('模拟实验室', '按需计算 · 复用 formulas/simulation')}
      <div class="toolbar" id="sim-toolbar">
        <label>队伍 <select id="sim-team">
          <option value="default">默认队</option>
          <option value="burst">爆发队</option>
          <option value="weak">弱队</option>
        </select></label>
        <label>等级 <input id="sim-lv" type="number" value="${INITIAL_PET_LEVEL}" min="1" max="99" style="width:60px"/></label>
        <label>星级 <input id="sim-star" type="number" value="${INITIAL_PET_STAR}" min="1" max="5" style="width:50px"/></label>
        <label>章节 <select id="sim-chapter">
          ${[1, 2, 3, 4, 5, 6, 7, 8].map((c) => `<option value="${c}">第${c}章</option>`).join('')}
        </select></label>
        <button type="button" class="primary" id="sim-run-ch">跑本章矩阵</button>
        <button type="button" id="sim-run-one">单关模拟</button>
        <select id="sim-stage">${STAGES.map((s) => `<option value="${s.id}">${s.id}</option>`).join('')}</select>
      </div>
      <div id="sim-output"></div>
    </section>`;

  const output = container.querySelector('#sim-output') as HTMLElement;
  const runChapter = container.querySelector('#sim-run-ch') as HTMLButtonElement;
  const runOne = container.querySelector('#sim-run-one') as HTMLButtonElement;

  function getTeam() {
    const preset = (container.querySelector('#sim-team') as HTMLSelectElement).value;
    const lv = Number((container.querySelector('#sim-lv') as HTMLInputElement).value);
    const star = Number((container.querySelector('#sim-star') as HTMLInputElement).value);
    return buildTeam(TEAM_PRESETS[preset] ?? DEFAULT_TEAM, lv, star);
  }

  function renderMatrix(rows: StageReportRow[]): void {
    const html = `<div class="table-wrap"><table class="data">
      <thead><tr><th>关卡</th><th>低手</th><th>中手</th><th>高手</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="mono">${r.stageId}</td>
        <td>${formatResult(r.low)}</td>
        <td>${formatResult(r.mid)}</td>
        <td>${formatResult(r.high)}</td>
      </tr>`).join('')}</tbody></table></div>`;
    output.innerHTML = html;
  }

  runChapter.addEventListener('click', () => {
    output.textContent = '计算中…';
    const ch = Number((container.querySelector('#sim-chapter') as HTMLSelectElement).value);
    const team = getTeam();
    const ids = STAGES.filter((s) => s.chapter === ch).map((s) => s.id);
    queueMicrotask(() => {
      const rows = simulateMatrix(team, ids);
      renderMatrix(rows);
    });
  });

  runOne.addEventListener('click', () => {
    const stageId = (container.querySelector('#sim-stage') as HTMLSelectElement).value;
    const team = getTeam();
    const results = (['low', 'mid', 'high'] as const).map((k) => ({
      name: COMBO_MODELS[k].name,
      r: simulateBattle(team, stageId, COMBO_MODELS[k]),
    }));
    output.innerHTML = `<h3>${stageId}</h3><div class="sim-grid">${results.map(({ name, r }) =>
      `<div class="sim-cell"><strong>${name}</strong><br>${winBadge(r.win, r.stars)}<br><span class="sub">${formatResult(r)}</span></div>`,
    ).join('')}</div>`;
  });

  void PETS;
}
