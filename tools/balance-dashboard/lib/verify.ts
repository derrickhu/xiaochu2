import { PETS } from '@/balance/pets';
import { petAtk } from '@/formulas/growth';
import { STAGE_MAP } from '@/balance/stages';
import { resolveEncounter } from '@/balance/enemies';
import { enemyStats } from '@/formulas/growth';
import { simulateBattle } from '@/formulas/simulation';
import { buildTeam, COMBO_MODELS } from '@/formulas/simulationReport';
import { DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR } from '@/balance/pets';

export interface VerifyCase {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
}

/** 与 growth.test / simulation.test 抽样对齐 */
export function runVerifyCases(): VerifyCase[] {
  const cases: VerifyCase[] = [];

  const attacker = PETS.find((p) => p.role === 'attacker' && p.rarity === 1);
  if (attacker) {
    const atk = petAtk(attacker, 1, 1);
    cases.push({
      name: 'R 攻击者 Lv1★1 攻击',
      pass: atk === 53,
      expected: '53',
      actual: String(atk),
    });
  }

  const stage = STAGE_MAP.get('stage_1_1');
  if (stage && stage.encounters[0]?.kind === 'mob') {
    const { def } = resolveEncounter(stage.encounters[0]);
    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    cases.push({
      name: 'stage_1_1 首波杂怪 HP（公式）',
      pass: stats.hp > 0 && stats.hp === Math.floor(def.baseHp * stage.difficulty),
      expected: `floor(${def.baseHp}×${stage.difficulty})`,
      actual: String(stats.hp),
    });
  }

  const team = buildTeam(DEFAULT_TEAM, INITIAL_PET_LEVEL, INITIAL_PET_STAR);
  const mid = simulateBattle(team, 'stage_1_1', COMBO_MODELS.mid);
  cases.push({
    name: 'stage_1_1 默认队中手模拟',
    pass: mid.win === true,
    expected: 'win',
    actual: mid.win ? `win ${mid.stars}★` : 'lose',
  });

  const boss = simulateBattle(team, 'stage_1_8', COMBO_MODELS.mid);
  cases.push({
    name: 'stage_1_8 默认队中手（收录 Boss）',
    pass: typeof boss.win === 'boolean',
    expected: '有结果',
    actual: boss.win ? `win ${boss.stars}★ t=${boss.turnsUsed}` : `lose t=${boss.turnsUsed}`,
  });

  return cases;
}
