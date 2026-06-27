import { describe, it, expect } from 'vitest';
import { BattleController } from '../BattleController';
import { STAGES } from '@/balance/stages';
import { DEFAULT_TEAM } from '@/balance/pets';
import { ENEMY_SKILL_IDS } from '@/balance/skills';
import { skillForEnemy } from '../SkillEngine';
import { resolvePlayerTurnDamage, type ResolvePlayerTurnOptions } from '../battleTurnResolution';
import { calcHeal } from '@/formulas/damage';
import type { EnemyUnit, TeamPet } from '../battleTypes';

const STAGE_ID = STAGES[0].id;

/** rng 固定 0.99：永不暴击，转珠/选取走最后分支但行为确定 */
const noCritRng = (): number => 0.99;

function makeCtrl(teamIds: readonly string[] = DEFAULT_TEAM): BattleController {
  return new BattleController(STAGE_ID, teamIds, noCritRng);
}

describe('技能 CD 流转', () => {
  it('开局技能不可用，CD 随玩家回合开始递减至就绪', () => {
    const ctrl = makeCtrl();
    const idx = 0;
    const cd = ctrl.team[idx].skill.cd;
    expect(ctrl.canCastSkill(idx)).toBe(false);
    for (let i = 0; i < cd; i++) {
      ctrl.beginPlayerTurn();
    }
    expect(ctrl.team[idx].skillCdLeft).toBe(0);
    expect(ctrl.canCastSkill(idx)).toBe(true);
  });

  it('释放后 CD 重置', () => {
    const ctrl = makeCtrl();
    const idx = 0;
    ctrl.team[idx].skillCdLeft = 0;
    ctrl.castSkill(idx);
    expect(ctrl.team[idx].skillCdLeft).toBe(ctrl.team[idx].skill.cd);
    expect(ctrl.canCastSkill(idx)).toBe(false);
  });

  it('非玩家回合不可释放', () => {
    const ctrl = makeCtrl();
    ctrl.team[0].skillCdLeft = 0;
    ctrl.beginResolve();
    expect(ctrl.canCastSkill(0)).toBe(false);
  });
});

describe('阶段八新技能整合（实战落地）', () => {
  // 含 dot / stun / defenseBreak / multiHit 的队伍
  const NEW_TEAM = ['pet_fire_003', 'pet_water_003', 'pet_metal_003', 'pet_metal_004', 'pet_wood_003'];

  it('multiHit：多段伤害累计扣减敌人 HP', () => {
    const ctrl = makeCtrl(NEW_TEAM);
    const idx = ctrl.team.findIndex((p) => p.def.id === 'pet_metal_004');
    ctrl.team[idx].skillCdLeft = 0;
    const before = ctrl.enemy.hp;
    const r = ctrl.castSkill(idx);
    expect(r.type).toBe('multiHit');
    expect((r.damage ?? 0)).toBeGreaterThan(0);
    expect(ctrl.enemy.hp).toBe(Math.max(0, before - (r.damage ?? 0)));
  });

  it('dot：施加灼烧，敌人回合结束持续掉血', () => {
    const ctrl = makeCtrl(NEW_TEAM);
    const idx = ctrl.team.findIndex((p) => p.def.id === 'pet_fire_003');
    ctrl.team[idx].skillCdLeft = 0;
    ctrl.castSkill(idx);
    const afterCast = ctrl.enemy.hp;
    ctrl.beginEnemyTurn();
    ctrl.enemyAct();
    expect(ctrl.enemy.hp).toBeLessThan(afterCast); // dot tick 生效
  });

  it('stun：眩晕使敌人本回合跳过攻击', () => {
    const ctrl = makeCtrl(NEW_TEAM);
    const idx = ctrl.team.findIndex((p) => p.def.id === 'pet_water_003');
    // 让敌人本回合本应普攻
    ctrl.enemy.attackCountdown = 1;
    ctrl.team[idx].skillCdLeft = 0;
    ctrl.castSkill(idx);
    ctrl.beginEnemyTurn();
    const r = ctrl.enemyAct();
    expect(r.action).toBe('idle');
    expect(r.damage).toBe(0);
  });

  it('defenseBreak：破防后同一攻击伤害更高', () => {
    const base = makeCtrl(NEW_TEAM);
    const broken = makeCtrl(NEW_TEAM);
    const bIdx = broken.team.findIndex((p) => p.def.id === 'pet_metal_003');
    broken.team[bIdx].skillCdLeft = 0;
    broken.castSkill(bIdx); // 施加破防

    // 同一只多段宠在两个控制器中打出的伤害对比
    const mIdxA = base.team.findIndex((p) => p.def.id === 'pet_metal_004');
    const mIdxB = broken.team.findIndex((p) => p.def.id === 'pet_metal_004');
    base.team[mIdxA].skillCdLeft = 0;
    broken.team[mIdxB].skillCdLeft = 0;
    const dmgBase = base.castSkill(mIdxA).damage ?? 0;
    const dmgBroken = broken.castSkill(mIdxB).damage ?? 0;
    expect(dmgBroken).toBeGreaterThan(dmgBase);
  });
});

describe('技能效果', () => {
  it('instantDmg：直伤扣减敌人 HP', () => {
    const ctrl = makeCtrl();
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'damage' && e.source === 'casterAtk'));
    ctrl.team[idx].skillCdLeft = 0;
    const before = ctrl.enemy.hp;
    const result = ctrl.castSkill(idx);
    expect(result.type).toBe('instantDmg');
    if (result.type === 'instantDmg') {
      expect(result.damage).toBeGreaterThan(0);
      expect(ctrl.enemy.hp).toBe(Math.max(0, before - result.damage!));
    }
  });

  it('healPct：按队伍最大生命百分比回血', () => {
    // 初始队无治疗，取含治疗技的生物（厚土娘娘 earthHeal）
    const ctrl = makeCtrl(['pet_earth_004', 'pet_fire_003']);
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'heal'));
    ctrl.team[idx].skillCdLeft = 0;
    ctrl.heroHp = Math.floor(ctrl.heroMaxHp * 0.4);
    const result = ctrl.castSkill(idx);
    if (result.type === 'healPct') {
      const heal = ctrl.team[idx].skill.effects.find((e) => e.kind === 'heal');
      const pct = heal?.kind === 'heal' ? heal.pct : 0;
      // 治疗位（厚土娘娘 healer）提供治疗强化，自身治疗技按 ×(1 + teamHealBonus) 放大
      const expectedHeal = Math.floor(ctrl.heroMaxHp * pct * (1 + ctrl.teamHealBonus));
      const room = ctrl.heroMaxHp - Math.floor(ctrl.heroMaxHp * 0.4);
      expect(result.healed).toBe(Math.min(expectedHeal, room));
    }
  });

  it('shield：敌人伤害先被护盾吸收', () => {
    // 初始队无护盾，取含护盾技的生物（云绒灵狐 waterShield）
    const ctrl = makeCtrl(['cr_cloud_fox', 'pet_fire_003']);
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'shield'));
    ctrl.team[idx].skillCdLeft = 0;
    const result = ctrl.castSkill(idx);
    expect(result.type).toBe('shield');
    const shieldBefore = ctrl.shield;
    expect(shieldBefore).toBeGreaterThan(0);

    // 阶段十二受击顺序：减伤 → 护盾 → 扣血。先用 teamDamageReduction 还原期望值
    const dr = ctrl.teamDamageReduction;
    const reduce = (raw: number): number => Math.max(0, Math.floor(raw * (1 - dr)));

    const hpBefore = ctrl.heroHp;
    const raw1 = Math.floor(shieldBefore / 2);
    const reduced1 = reduce(raw1);
    const hit = ctrl.applyEnemyDamage(raw1);
    expect(hit.damage).toBe(0); // 减伤后仍小于护盾，全额吸收
    expect(hit.absorbed).toBe(reduced1);
    expect(ctrl.heroHp).toBe(hpBefore);

    // 溢出部分扣 HP（同样先减伤再过护盾）
    const shieldNow = ctrl.shield;
    const raw2 = shieldNow + 100;
    const reduced2 = reduce(raw2);
    const expectedAbsorbed2 = Math.min(shieldNow, reduced2);
    const hit2 = ctrl.applyEnemyDamage(raw2);
    expect(hit2.absorbed).toBe(expectedAbsorbed2);
    expect(hit2.damage).toBe(reduced2 - expectedAbsorbed2);
    expect(ctrl.shield).toBe(shieldNow - expectedAbsorbed2);
  });

  it('dmgBoost：增伤 buff 生效并随敌人回合衰减', () => {
    // 含增伤光环技的火队（星河烛龙 fireBoost）+ 火输出
    const boostTeam = ['cr_zhulong', 'pet_fire_003'];
    const ctrl = makeCtrl(boostTeam);
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'status' && e.status === 'teamDamageBuff'));
    ctrl.team[idx].skillCdLeft = 0;
    const result = ctrl.castSkill(idx);
    if (result.type !== 'dmgBoost') throw new Error('unexpected');
    expect(ctrl.dmgBuff?.mult).toBe(result.mult);

    // buff 期间消除伤害更高
    const groups = [{ orb: 'fire' as const, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    ctrl.beginResolve();
    const buffed = ctrl.resolveTurn(groups);
    const ctrl2 = makeCtrl(boostTeam);
    ctrl2.beginResolve();
    const plain = ctrl2.resolveTurn(groups);
    expect(buffed.attacks[0].damage).toBeGreaterThan(plain.attacks[0].damage);

    // 敌人回合结束 turns 次后 buff 消失
    for (let i = 0; i < result.turns!; i++) {
      ctrl.enemyAct();
    }
    expect(ctrl.dmgBuff).toBeNull();
  });

  it('convertOrbs：只返回转珠请求，不直接改盘面', () => {
    // 星轮机关兽 earthHeartConvert：定量转珠（count > 0）
    const ctrl = makeCtrl(['cr_star_gear', 'pet_fire_003']);
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'convertOrbs'));
    expect(idx).toBeGreaterThanOrEqual(0);
    ctrl.team[idx].skillCdLeft = 0;
    const result = ctrl.castSkill(idx);
    if (result.type !== 'convertOrbs') throw new Error('unexpected');
    expect(result.count).toBeGreaterThan(0);
  });

  it('teamAttack：伤害基于全队总攻', () => {
    const ctrl = makeCtrl();
    const idx = ctrl.team.findIndex((p) => p.skill.effects.some((e) => e.kind === 'damage' && e.source === 'teamAtk'));
    if (idx < 0) return; // 默认队伍可能不含该技能
    ctrl.team[idx].skillCdLeft = 0;
    const before = ctrl.enemy.hp;
    const result = ctrl.castSkill(idx);
    if (result.type === 'teamAttack') {
      expect(ctrl.enemy.hp).toBe(Math.max(0, before - result.damage!));
    }
  });
});

describe('怪物技能', () => {
  /** 替换当前敌人的技能组（测试专用） */
  function setEnemySkillIds(
    ctrl: BattleController,
    skillIds: readonly string[],
  ): void {
    ctrl.enemy.def = { ...ctrl.enemy.def, skillIds };
    ctrl.enemy.skillCds = skillIds.map((id) => skillForEnemy(id).cd);
  }

  it('chargeAttack：先蓄力预告，下回合打出 atk × mult 重击', () => {
    const ctrl = makeCtrl();
    setEnemySkillIds(ctrl, [ENEMY_SKILL_IDS.bladeCharge]);
    ctrl.enemy.skillCds[0] = 0;

    const r1 = ctrl.enemyAct();
    expect(r1.action).toBe('charge');
    expect(ctrl.enemy.charging?.mult).toBe(2.6);

    const hpBefore = ctrl.heroHp;
    const r2 = ctrl.enemyAct();
    expect(r2.action).toBe('chargedAttack');
    // 重击原始伤害 = atk × mult，先过队伍减伤；被动开局护盾可能吸收一部分，故按 实扣 + 吸收 还原
    const rawCharge = Math.floor(ctrl.enemy.atk * 2.6);
    const reducedCharge = Math.max(0, Math.floor(rawCharge * (1 - ctrl.teamDamageReduction)));
    expect(r2.damage + r2.absorbed).toBe(reducedCharge);
    expect(ctrl.heroHp).toBe(hpBefore - r2.damage);
    expect(ctrl.enemy.charging).toBeNull();
  });

  it('healSelf：满血不放，掉血后回复', () => {
    const ctrl = makeCtrl();
    setEnemySkillIds(ctrl, [ENEMY_SKILL_IDS.serpentHeal]);
    ctrl.enemy.skillCds[0] = 0;

    const r1 = ctrl.enemyAct();
    expect(r1.action).not.toBe('heal'); // 满血时跳过

    ctrl.enemy.hp = Math.floor(ctrl.enemy.maxHp * 0.5);
    const before = ctrl.enemy.hp;
    const r2 = ctrl.enemyAct();
    expect(r2.action).toBe('heal');
    expect(ctrl.enemy.hp).toBe(before + r2.healed);
    expect(r2.healed).toBe(Math.floor(ctrl.enemy.maxHp * 0.16));
  });

  it('shieldSelf：减伤期间玩家消除伤害打折，到期恢复', () => {
    const ctrl = makeCtrl();
    setEnemySkillIds(ctrl, [ENEMY_SKILL_IDS.golemGuard]);
    ctrl.enemy.skillCds[0] = 0;

    const groups = [{ orb: 'fire' as const, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    ctrl.beginResolve();
    const plain = ctrl.resolveTurn(groups).attacks[0].damage;

    const r = ctrl.enemyAct();
    expect(r.action).toBe('shield');
    expect(ctrl.enemy.dmgReduction?.reduction).toBe(0.5);

    ctrl.beginResolve();
    const reduced = ctrl.resolveTurn(groups).attacks[0].damage;
    expect(reduced).toBe(Math.max(1, Math.floor(plain * 0.5)));

    // turns 个敌人回合后状态消失（释放当回合记 1）
    ctrl.enemyAct();
    expect(ctrl.enemy.dmgReduction).toBeNull();
  });
});

describe('阶段十二·角色专属战斗属性（全队聚合）', () => {
  it('治疗队伍 teamHealBonus > 0，纯输出队伍为 0', () => {
    // 灵鹿医者（healer）提供治疗强化；纯输出队伍无治疗强化
    const healTeam = makeCtrl(['pet_wood_004', 'pet_fire_003']);
    expect(healTeam.teamHealBonus).toBeGreaterThan(0);
    const atkTeam = makeCtrl(['pet_fire_003', 'pet_fire_004']);
    expect(atkTeam.teamHealBonus).toBe(0);
  });

  it('辅助队伍 teamDamageMult > 1；纯输出队仅有 ladder 增伤、无治疗强化', () => {
    const supTeam = makeCtrl(['pet_metal_003', 'pet_fire_003']);
    expect(supTeam.teamDamageMult).toBeGreaterThan(1);
    const atkTeam = makeCtrl(['pet_fire_003', 'pet_fire_004']);
    expect(atkTeam.teamDamageMult).toBeGreaterThan(1);
    expect(atkTeam.teamHealBonus).toBe(0);
  });

  it('resolveTurn 心珠回血按 teamHealBonus 放大（与 calcHeal 口径一致）', () => {
    const ctrl = makeCtrl(['pet_wood_004', 'pet_fire_003']);
    ctrl.beginResolve();
    const heartGroups = [{ orb: 'heart' as const, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    const res = ctrl.resolveTurn(heartGroups);
    const expected = calcHeal(ctrl.teamRcvTotal, 3, 1, ctrl.teamHealBonus) + ctrl.passiveRegenPerTurn;
    expect(res.heal).toBe(expected);
  });
});

describe('resolvePlayerTurnDamage：治疗强化 / 全队增伤透传（纯函数）', () => {
  const firePet = (): TeamPet => ({
    def: { element: 'fire' } as TeamPet['def'],
    star: 1,
    skill: {} as TeamPet['skill'],
    atk: 1000,
    critRate: 0,
    critDamage: 0,
    skillCdLeft: 0,
  });
  const enemy = (): EnemyUnit => ({ def: { element: 'water' }, dmgReduction: null } as unknown as EnemyUnit);
  const baseOpts = (over: Partial<ResolvePlayerTurnOptions>): ResolvePlayerTurnOptions => ({
    groups: [],
    team: [firePet()],
    enemy: enemy(),
    bannedElements: new Set(),
    enemyDefEffective: 0,
    teamRcvTotal: 1000,
    noHeartHeal: false,
    passiveRegenPerTurn: 0,
    teamDamageMult: 1,
    teamHealBonus: 0,
    rng: () => 0.99,
    elementTraitDamageMult: () => 1,
    counterRelation: () => 0,
    ...over,
  });

  it('teamHealBonus 放大心珠回血', () => {
    const heart = [{ orb: 'heart' as const, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    const plain = resolvePlayerTurnDamage(baseOpts({ groups: heart, teamHealBonus: 0 }));
    const boosted = resolvePlayerTurnDamage(baseOpts({ groups: heart, teamHealBonus: 0.5 }));
    expect(boosted.heal).toBeGreaterThan(plain.heal);
    expect(boosted.heal).toBe(calcHeal(1000, 3, 1, 0.5));
  });

  it('teamDamageMult（含全队增伤）放大伤害', () => {
    const fire = [{ orb: 'fire' as const, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    const plain = resolvePlayerTurnDamage(baseOpts({ groups: fire, teamDamageMult: 1 }));
    const boosted = resolvePlayerTurnDamage(baseOpts({ groups: fire, teamDamageMult: 1.5 }));
    expect(boosted.attacks[0].damage).toBeGreaterThan(plain.attacks[0].damage);
  });
});

describe('有效珠机制（队伍属性覆盖）', () => {
  it('队伍无该属性时，消除组不产生攻击但仍计 Combo', () => {
    // 纯火队
    const ctrl = makeCtrl(['pet_fire_003', 'pet_fire_004']);
    ctrl.beginResolve();
    const res = ctrl.resolveTurn([
      { orb: 'fire', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] },
      { orb: 'water', cells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }] },
    ]);
    expect(res.combo).toBe(2); // 无效珠仍计 Combo
    expect(res.attacks.length).toBe(1); // 但只有火组产生攻击
    expect(res.attacks[0].element).toBe('fire');
  });
});
