/**
 * 宠物主动技演出：把 BattleController.castSkill 的结果按 VFX 类型映射为画面表现
 * （属性刃弹道 / 齐射 / 多段 / DOT / 眩晕 / 破防 / 治疗 / 护盾 / 增伤 / 转珠）。
 *
 * 直伤类与消珠普攻一致，走 fireElementBladeVolley（属性刃 + 命中爆炸），不再飞原始珠子弹道。
 * 复合技（净世斩 / 破防斩）主分类不是 nuke 时，直伤段由 presentAttachedNuke 补演。
 *
 * 纯演出编排：依赖通过 deps 注入，自身不持有状态。返回 true 表示战斗已在演出中结束
 * （最后一波敌人被击败），编排者据此保留 busy 状态、跳过收尾刷新。
 */
import { hasteChargePctLabel } from '@/balance/skillCharge';
import { ORB_COLOR, FX_ELEMENT_COLOR, UI, ELEMENT_NAME } from '@/balance/ui';
import {
  SKILL_IMPACT_HEAVY_HP_RATIO,
  SKILL_VFX_MAP,
  type SkillImpactTier,
} from '@/balance/skillVfx';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import type { BattleController } from '@/game/battle/BattleController';
import type { BoardModel } from '@/game/board/BoardModel';
import type { BoardView } from '@/game/board/BoardView';
import type { Element } from '@/balance/combat';
import type { BattleFx, TurnPetDamageSummary } from './BattleFx';
import type { BattleHud } from './BattleHud';
import type { BattlePetBar } from './BattlePetBar';
import type { BattleLayout } from './BattleLayout';
import type { SkillCastResult } from '@/game/battle/battleTypes';
import { delay } from './battleWidgets';
import {
  primaryChannelsOfCast,
  type PresentChannel,
} from './skillPresentCoverage';

export interface SkillCastDeps {
  ctrl: BattleController;
  fx: BattleFx;
  hud: BattleHud;
  petBar: BattlePetBar;
  board: BoardModel;
  boardView: BoardView;
  layout: BattleLayout;
  /** 刷新槽位 CD + buff 状态行 */
  refreshSkillUi: () => void;
  /** 敌人死亡处理，返回 true = 战斗结束；直伤击杀时带上施法宠槽位 recap */
  handleEnemyDefeat: (turnRecap?: {
    total: number;
    combo: number;
    hitCount: number;
    petSummaries: TurnPetDamageSummary[];
  }) => Promise<boolean>;
}

interface SkillDamageOpts {
  isCrit?: boolean;
  orderIdx?: number;
  minor?: boolean;
  hitCount?: number;
  /** 五行克制关系，1 时飘字带「克」标记（瞬发直伤专用，齐射与重力不吃克制） */
  counter?: 1 | 0 | -1;
}

/** 本次命中该不该停拍：够狠才停，小段命中停拍会变成掉帧 */
/** 施法宠头像上的伤害 recap，样式与转珠普攻回合末同一套 */
function skillCasterRecap(
  deps: SkillCastDeps,
  petIndex: number,
  result: SkillCastResult,
): TurnPetDamageSummary | null {
  const damage = result.damage ?? 0;
  if (damage <= 0) return null;
  const slot = deps.petBar.slotAt(petIndex);
  if (!slot || slot.destroyed) return null;
  return {
    slotX: slot.x,
    slotY: slot.y,
    element: result.element ?? deps.ctrl.team[petIndex].def.element,
    damage,
  };
}

function showSkillPetRecap(deps: SkillCastDeps, petIndex: number, result: SkillCastResult): void {
  const recap = skillCasterRecap(deps, petIndex, result);
  if (recap) deps.fx.showPetSlotDamageRecap(recap);
}

async function finishIfSkillKilled(
  deps: SkillCastDeps,
  petIndex: number,
  result: SkillCastResult,
): Promise<boolean> {
  if (!result.enemyDead) return false;
  const recap = skillCasterRecap(deps, petIndex, result);
  return deps.handleEnemyDefeat(recap ? {
    total: recap.damage,
    combo: 0,
    hitCount: 1,
    petSummaries: [recap],
  } : undefined);
}

function impactTierOf(damage: number, enemyMaxHp: number): SkillImpactTier {
  const ratio = enemyMaxHp > 0 ? damage / enemyMaxHp : 0;
  return ratio >= SKILL_IMPACT_HEAVY_HP_RATIO ? 'heavy' : 'light';
}

/** 技能直伤飘字：打在敌人身上，与消珠命中共用 enemyHit 样式（槽位飘字会被棋盘挡住） */
function spawnSkillDamage(
  fx: BattleFx,
  layout: BattleLayout,
  element: Element,
  damage: number,
  opts?: SkillDamageOpts,
): void {
  if (damage <= 0) return;
  fx.spawnEnemyHitDamage({
    enemyX: layout.enemyCenterX,
    enemyY: layout.enemyCenterY,
    element,
    damage,
    isCrit: opts?.isCrit ?? false,
    counter: opts?.counter ?? 0,
    orderIdx: opts?.orderIdx ?? 0,
    hitCount: opts?.hitCount ?? 1,
    minor: opts?.minor,
    skill: true,
  });
}

/** 复合技里的转珠段：buff/治疗分类不会走到 orbConvert，必须在主演出后再落地 */
async function presentOrbConvertIfAny(
  deps: SkillCastDeps,
  result: SkillCastResult,
): Promise<void> {
  const convertReq = result.boardRequests.find(
    (b): b is Extract<typeof b, { type: 'convertOrbs' }> => b.type === 'convertOrbs',
  );
  if (!convertReq) return;
  const { fx, board, boardView, layout } = deps;
  const to = result.to ?? convertReq.to;
  const cells = result.shape === 'row'
    ? board.convertRow(to)
    : result.shape === 'col'
      ? board.convertCol(to)
      : result.shape === 'cross'
        ? board.convertCross(to)
        : board.convertRandom(to, result.count ?? convertReq.count, convertReq.from);
  if (cells.length === 0) return;
  SfxManager.playSkillBoardWave();
  for (const { r, c } of cells) {
    const cell = UI.board.cellSize;
    fx.burst({
      x: layout.boardX + c * cell + cell / 2,
      y: layout.boardY + r * cell + cell / 2,
      color: ORB_COLOR[to],
      count: 5, speed: 240, size: 12, life: 0.35,
    });
  }
  await boardView.playConvert(cells, to);
}

/** 从宠槽打出属性刃弹道（与消珠普攻同款效果 UI） */
function fireSkillBlade(
  fx: BattleFx,
  petBar: BattlePetBar,
  petIndex: number,
  toX: number,
  toY: number,
  element: Element,
): Promise<void> {
  const slot = petBar.slotAt(petIndex);
  return fx.fireElementBladeVolley(slot.x, slot.y - 60, toX, toY, element, {
    weight: 'skill',
    lane: petIndex,
  });
}

/**
 * 技能直伤反馈：飘字 + 命中音效 + 受击演出 + 停拍。
 *
 * 与消珠命中的区别全在这里：技能多铺一层专属音（SfxManager.playSkillImpact）、
 * 飘字走加大的 skill 档、命中后停一拍把敌人推近。三样缺一样，放技就又变回「平 A」。
 */
async function presentSkillEnemyDamage(
  deps: Pick<SkillCastDeps, 'ctrl' | 'fx' | 'hud' | 'layout'>,
  element: Element,
  damage: number,
  opts?: SkillDamageOpts & { silent?: boolean; noImpact?: boolean },
): Promise<void> {
  if (damage <= 0) return;
  deps.hud.playEnemyHit(deps.fx, element, damage, opts?.isCrit ?? false);
  const tier = impactTierOf(damage, deps.ctrl.enemy.maxHp);
  if (!opts?.silent) {
    SfxManager.playAttack();
    SfxManager.playSkillImpact(tier === 'heavy');
  }
  spawnSkillDamage(deps.fx, deps.layout, element, damage, opts);
  // 多段技的中间段不停拍：每段都停会把一套连打拖成慢动作
  if (opts?.minor || opts?.noImpact) return;
  await deps.hud.playSkillImpact(deps.fx, tier);
}

/**
 * 复合技附带的直伤段：净化/破防等主分类不会走 projectile，
 * 不补这一下就会出现「方案写着 450% 伤害、画面只有净化」——血已扣、字不飘、条不刷。
 * 返回 true 表示这一刀打死了最后一波。
 */
async function presentAttachedNuke(
  deps: SkillCastDeps,
  petIndex: number,
  result: SkillCastResult,
  element: Element,
  counter: 1 | 0 | -1,
): Promise<boolean> {
  const damage = result.damage ?? 0;
  if (damage <= 0) return false;
  const { fx, hud, petBar, layout } = deps;
  await fireSkillBlade(fx, petBar, petIndex, layout.enemyCenterX, layout.enemyCenterY, element);
  await presentSkillEnemyDamage(deps, element, damage, { counter });
  hud.refreshEnemyHp();
  return finishIfSkillKilled(deps, petIndex, result);
}

/** 施法结束强制对账 HUD：逻辑已在 castSkill 落地，条不刷就会显得「下一次攻击才生效」 */
function syncSkillHud(deps: SkillCastDeps): void {
  deps.hud.refreshEnemyHp();
  deps.hud.refreshHeroHp();
  deps.hud.refreshEnemyCd();
  deps.refreshSkillUi();
}

/**
 * 主 VFX 没播到的效果段：护盾+威吓、增伤+护盾、重力+破防、净世斩直伤等。
 * shown 来自 primaryChannelsOfCast，必须与上面 switch 实际播的频道一致。
 */
async function presentResiduals(
  deps: SkillCastDeps,
  petIndex: number,
  result: SkillCastResult,
  element: Element,
  counter: 1 | 0 | -1,
  shown: Set<PresentChannel>,
): Promise<boolean> {
  const { fx, hud, petBar, board, boardView, layout, ctrl } = deps;
  const {
    enemyCenterX, enemyCenterY, boardX, boardY, heroBarY,
    heroAnnounceX, heroAnnounceY, statusAnnounceX, statusAnnounceY,
  } = layout;

  if (!shown.has('enemyDamage')) {
    if (await presentAttachedNuke(deps, petIndex, result, element, counter)) return true;
  }

  if (!shown.has('heal') && (result.healed ?? 0) > 0) {
    hud.refreshHeroHp();
    SfxManager.playSkillBuff();
    fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8be78b);
    fx.spawnHeroHealFloat(result.healed ?? 0, heroAnnounceX, heroAnnounceY);
  }

  if (!shown.has('convert')) {
    await presentOrbConvertIfAny(deps, result);
  }

  if (!shown.has('shield')) {
    const shieldEv = result.statusEvents.find((e) => e.status === 'shield');
    if (shieldEv) {
      SfxManager.playSkillBuff();
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8fd4ff);
      fx.spawnFloat(`护盾 ${ctrl.shield || result.value || 0}`, heroAnnounceX, heroAnnounceY, 0x8fd4ff, 1.15);
    }
  }

  if (!shown.has('purify') && (result.cleanseTeam || result.boardRequests.some((b) => b.type === 'unsealAll'))) {
    const unsealReq = result.boardRequests.find((b) => b.type === 'unsealAll');
    if (unsealReq) {
      const cells = board.unsealAll();
      for (const { r, c } of cells) {
        const cell = UI.board.cellSize;
        fx.burst({
          x: boardX + c * cell + cell / 2,
          y: boardY + r * cell + cell / 2,
          color: 0xfff8e1, count: 6, speed: 220, size: 12, life: 0.4,
        });
      }
      boardView.refreshOrbStates();
    }
    SfxManager.playSkillBoardWave();
    fx.flash(0xfff8e1, 0.22, 0.28);
    fx.spawnAuraRing(Game.logicWidth / 2, boardY + UI.board.cellSize * 2.5, 0xfff8e1);
    fx.spawnFloat('净化！', heroAnnounceX, heroAnnounceY, 0xfff8e1, 1.2);
  }

  if (!shown.has('defenseBreak')) {
    const ev = result.statusEvents.find((e) => e.status === 'enemyDefenseBreak');
    if (ev) {
      fx.spawnFloat(
        `破防 -${Math.round((ev.value ?? 0) * 100)}% ×${ev.turns ?? 0}`,
        enemyCenterX, enemyCenterY - 50, 0xff8a65, 1.15,
      );
      fx.burst({
        x: enemyCenterX, y: enemyCenterY,
        color: 0xff8a65, count: 10, speed: 200, size: 12, life: 0.4,
      });
    }
  }

  if (!shown.has('stun')) {
    const ev = result.statusEvents.find((e) => e.status === 'stun');
    if (ev || result.immuneControl) {
      if (result.immuneControl) {
        fx.spawnFloat('免疫控制！', enemyCenterX, enemyCenterY - 76, 0xb0bec5, 1.15);
      } else if (ev) {
        fx.spawnFloat(`眩晕 ${ev.turns ?? 0} 回合`, enemyCenterX, enemyCenterY - 76, 0xfff176, 1.15);
      }
    }
  }

  if (!shown.has('delayAttack') && (result.enemyAttackDelay ?? 0) > 0) {
    fx.spawnFloat(
      result.immuneControl
        ? '免疫控制！'
        : `威吓！敌人攻击推迟 ${result.enemyAttackDelay} 回合`,
      enemyCenterX, enemyCenterY - 50, result.immuneControl ? 0xb0bec5 : 0xffd54f, 1.15,
    );
    hud.refreshEnemyCd();
  }

  if (!shown.has('extraTime')) {
    const ev = result.statusEvents.find((e) => e.status === 'extraDragTime');
    if (ev) {
      fx.spawnFloat(
        `转珠时间 +${ev.value ?? 0} 秒（${ev.turns ?? 0} 回合）`,
        heroAnnounceX, heroAnnounceY, 0xffe082, 1.1,
      );
    }
  }

  if (!shown.has('haste') && (result.teamCdDelta ?? 0) > 0) {
    for (let i = 0; i < ctrl.team.length; i++) {
      if (i === petIndex) continue;
      const slot = petBar.slotAt(i);
      fx.spawnAuraRing(slot.x, slot.y - 20, 0xffd54f);
    }
    fx.spawnFloat(`全队充能 +${hasteChargePctLabel(result.teamCdDelta ?? 0)}`, heroAnnounceX, heroAnnounceY, 0xffd54f, 1.1);
  }

  if (!shown.has('dot')) {
    const ev = result.statusEvents.find((e) => e.status === 'dot');
    if (ev) {
      fx.spawnFloat(`灼烧 ${ev.value ?? 0}/回合 ×${ev.turns ?? 0}`, enemyCenterX, enemyCenterY - 76, 0xff7043, 1.05);
    }
  }

  const extraBuffs: string[] = [];
  const dmgBuff = result.statusEvents.find((e) => e.status === 'teamDamageBuff');
  if (!shown.has('dmgBoost') && dmgBuff) {
    extraBuffs.push(`全队伤害 ×${dmgBuff.value ?? 1}（${dmgBuff.turns ?? 0} 回合）`);
  }
  const crit = result.statusEvents.find((e) => e.status === 'guaranteedCrit');
  if (!shown.has('critBoost') && crit) {
    extraBuffs.push(`必暴击（${crit.turns ?? 0} 回合）`);
  }
  const elBuff = result.statusEvents.find((e) => e.status === 'elementDamageBuff');
  if (!shown.has('elementBuff') && elBuff) {
    const elName = elBuff.element ? ELEMENT_NAME[elBuff.element] : '属';
    extraBuffs.push(`${elName}伤害 ×${elBuff.value ?? 1}（${elBuff.turns ?? 0} 回合）`);
  }
  if (extraBuffs.length > 0) {
    SfxManager.playSkillBuff();
    petBar.flourish();
    const glow = FX_ELEMENT_COLOR[element] ?? 0xff8a3c;
    fx.spawnStatusAnnounceFloat(extraBuffs.join('  '), statusAnnounceX, statusAnnounceY, glow);
  }

  return false;
}

/** 返回 true 表示战斗已结束（最后一波敌人被击败）。 */
export async function presentSkillCast(deps: SkillCastDeps, petIndex: number): Promise<boolean> {
  const { ctrl, fx, hud, petBar, board, boardView, layout } = deps;
  const {
    enemyCenterX, enemyCenterY, boardX, boardY, heroBarY,
    heroAnnounceX, heroAnnounceY, statusAnnounceX, statusAnnounceY,
  } = layout;

  const pet = ctrl.team[petIndex];
  // 瞬发直伤已接入五行克制（见 SkillEngine.counterMultFor），飘字要让玩家看见这一层
  const counterOf = (el: Element): 1 | 0 | -1 => ctrl.counterRelationOf(el);
  const color = ORB_COLOR[pet.def.element];
  const result = ctrl.castSkill(petIndex);
  deps.refreshSkillUi();
  Platform.vibrateShort('medium');
  // 与 xiao_chu 一致：施放主音走 skill.mp3；★3+ 再叠一层 pet_skill
  SfxManager.playSkill();
  if (pet.star >= 3) SfxManager.playPetSkill();

  // 通用演出：属性色全屏闪 + 技能名快闪
  const vfx = SKILL_VFX_MAP.get(result.vfxEvents[0]);
  fx.flash(color, vfx?.flashDuration ?? 0.25, vfx?.flashAlpha ?? 0.4);
  await fx.showSkillBanner(pet.skill.name, color);

  switch (vfx?.kind) {
    case 'projectile': {
      const damage = result.damage ?? 0;
      const el = result.element ?? pet.def.element;
      await fireSkillBlade(fx, petBar, petIndex, enemyCenterX, enemyCenterY, el);
      await presentSkillEnemyDamage(deps, el, damage, { counter: counterOf(el) });
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'teamVolley': {
      const damage = result.damage ?? 0;
      // 全队齐射：各宠属性刃同时飞出，命中弹一次总伤害
      await Promise.all(ctrl.team.map((member, i) =>
        fireSkillBlade(fx, petBar, i, enemyCenterX, enemyCenterY, member.def.element),
      ));
      await presentSkillEnemyDamage(deps, pet.def.element, damage);
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'multiHit': {
      // 多段直伤：连续属性刃，逐段弹伤害数字
      const total = result.damage ?? 0;
      const hits = result.damageEvents.filter((e) => e.target === 'enemy').length || 1;
      const el = result.element ?? pet.def.element;
      /*
       * 多段技的节奏：前面几段快速连出（小字、爬升音阶、不停拍），最后一段当收尾——
       * 大飘字 + 停拍。段段都停会把连打拖成慢动作，段段都不停又只是「同一下响了五遍」。
       * 主段因此从第一下改到最后一下：连打的重音在收尾，不在起手。
       */
      for (let i = 0; i < hits; i++) {
        const last = i === hits - 1;
        await fireSkillBlade(fx, petBar, petIndex, enemyCenterX, enemyCenterY, el);
        SfxManager.playSkillMultiHit(i, hits);
        await presentSkillEnemyDamage(deps, el, Math.round(total / hits), {
          orderIdx: i,
          minor: !last,
          hitCount: hits,
          counter: counterOf(el),
          silent: true,
        });
      }
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'dotApply': {
      const el = result.element ?? pet.def.element;
      const initial = result.damage ?? 0;
      await fireSkillBlade(fx, petBar, petIndex, enemyCenterX, enemyCenterY, el);
      if (initial > 0) {
        await presentSkillEnemyDamage(deps, el, initial, { counter: counterOf(el) });
      }
      fx.spawnFloat(
        `灼烧 ${result.value ?? 0}/回合 ×${result.turns ?? 0}`,
        enemyCenterX, enemyCenterY - 76, 0xff7043, 1.1,
      );
      fx.burst({
        x: enemyCenterX, y: enemyCenterY,
        color: 0xff7043, count: 12, speed: 200, gravity: -120, size: 13, life: 0.6,
      });
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'stun': {
      const damage = result.damage ?? 0;
      if (damage > 0) {
        const el = result.element ?? pet.def.element;
        await fireSkillBlade(fx, petBar, petIndex, enemyCenterX, enemyCenterY, el);
        await presentSkillEnemyDamage(deps, el, damage, { counter: counterOf(el) });
      }
      // 敌人凝意时控制段落空：必须给出「免疫」反馈，否则玩家以为技能白放了却看不出原因
      if (result.immuneControl) {
        fx.spawnFloat('免疫控制！', enemyCenterX, enemyCenterY - 76, 0xb0bec5, 1.2);
      } else {
        // 瞬时飘字确认「控上了」；常驻转圈由 EnemyStunHalo 在 refreshSkillUi 后亮起
        const headY = enemyCenterY - UI.battle.enemySize / 2 - 8;
        fx.spawnFloat(`眩晕 ${result.turns ?? 0} 回合`, enemyCenterX, headY - 40, 0xfff176, 1.25);
        fx.burst({
          x: enemyCenterX, y: headY,
          color: 0xfff176, count: 14, speed: 200, gravity: -80, size: 14, life: 0.75,
        });
        fx.shakeLight();
      }
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'defenseBreak': {
      // 破军裂阵 / 破岳崩地：主分类是破防，直伤段必须先打出来
      const el = result.element ?? pet.def.element;
      if (await presentAttachedNuke(deps, petIndex, result, el, counterOf(el))) return true;
      fx.spawnFloat(
        `破防 -${Math.round((result.value ?? 0) * 100)}% ×${result.turns ?? 0}`,
        enemyCenterX, enemyCenterY - 50, 0xff8a65, 1.2,
      );
      fx.burst({
        x: enemyCenterX, y: enemyCenterY,
        color: 0xff8a65, count: 12, speed: 220, size: 13, life: 0.45,
      });
      break;
    }
    case 'healBurst': {
      hud.refreshHeroHp();
      SfxManager.playSkillBuff();
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8be78b);
      fx.spawnHeroHealFloat(result.healed ?? 0, heroAnnounceX, heroAnnounceY);
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0x8be78b, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
      });
      break;
    }
    case 'shieldBurst': {
      SfxManager.playSkillBuff();
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8fd4ff);
      fx.spawnFloat(`护盾 ${result.value ?? 0}`, heroAnnounceX, heroAnnounceY, 0x8fd4ff, 1.2);
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0x8fd4ff, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
      });
      break;
    }
    case 'buffFloat': {
      // 通用增益飘字：全队增伤显示倍率，必暴击/属性强化/威吓走 floatText
      const label = result.type === 'dmgBoost'
        ? `全队伤害 ×${result.mult ?? 1}（${result.turns ?? 0} 回合）`
        : result.type === 'elementBuff'
          ? `${vfx?.floatText ?? ''} ×${result.mult ?? 1}（${result.turns ?? 0} 回合）`
          : `${vfx?.floatText ?? ''}${result.turns ? `（${result.turns} 回合）` : ''}`;
      if (vfx.id === 'delayAttack' || result.type === 'delayAttack' || (result.enemyAttackDelay ?? 0) > 0) {
        // 威吓可把直伤插在第一段，type 会变成 instantDmg，必须看 vfx / delay 字段
        const damage = result.damage ?? 0;
        if (damage > 0) {
          const el = result.element ?? pet.def.element;
          await fireSkillBlade(fx, petBar, petIndex, enemyCenterX, enemyCenterY, el);
          await presentSkillEnemyDamage(deps, el, damage, { counter: counterOf(el) });
          hud.refreshEnemyHp();
          if (await finishIfSkillKilled(deps, petIndex, result)) return true;
        }
        fx.spawnFloat(
          result.immuneControl
            ? '免疫控制！'
            : `威吓！敌人攻击推迟 ${result.enemyAttackDelay ?? 0} 回合`,
          enemyCenterX, enemyCenterY - 50, result.immuneControl ? 0xb0bec5 : 0xffd54f, 1.15,
        );
        hud.refreshEnemyCd();
        break;
      }
      SfxManager.playSkillBuff();
      petBar.flourish();
      const glow = FX_ELEMENT_COLOR[pet.def.element] ?? 0xff8a3c;
      for (let i = 0; i < ctrl.team.length; i++) {
        const slot = petBar.slotAt(i);
        fx.burst({
          x: slot.x, y: slot.y - 24,
          color: glow, count: 10, speed: 220, gravity: -180, size: 13, life: 0.55,
        });
      }
      // 长文案必须走屏幕居中的 statusAnnounce，贴 heroAnnounce 右侧会裁出屏
      fx.spawnStatusAnnounceFloat(label, statusAnnounceX, statusAnnounceY, glow);
      hud.refreshStatus();
      await delay(UI.anim.skillBuffHold);
      break;
    }
    case 'gravityCrush': {
      // 重力：暗色压场 + 敌人下压弹回 + 重震 + starburst 高光 + 伤害数字
      const damage = result.damage ?? 0;
      fx.flash(0x2d1b4e, 0.3, 0.5);
      fx.shakeHeavy();
      Platform.vibrateLong();
      // 重力自带压扁弹回，再叠一次推近会变成莫名其妙的二段抖
      await hud.playEnemyGravityCrush(fx);
      await presentSkillEnemyDamage(deps, pet.def.element, damage, { noImpact: true });
      hud.refreshEnemyHp();
      if (await finishIfSkillKilled(deps, petIndex, result)) return true;
      break;
    }
    case 'hasteGlow': {
      // 连携：每个队友槽位金色光环 + 充能条上涨
      for (let i = 0; i < ctrl.team.length; i++) {
        if (i === petIndex) continue;
        const slot = petBar.slotAt(i);
        fx.spawnAuraRing(slot.x, slot.y - 20, 0xffd54f);
        fx.burst({
          x: slot.x, y: slot.y - 30,
          color: 0xffd54f, count: 8, speed: 200, gravity: -160, size: 12, life: 0.5,
        });
      }
      fx.spawnFloat(
        `全队充能 +${hasteChargePctLabel(result.teamCdDelta ?? 0)}`,
        heroAnnounceX, heroAnnounceY, 0xffd54f, 1.2,
      );
      deps.refreshSkillUi();
      break;
    }
    case 'purifyWave': {
      // 金羽净世：主分类是净化，450% 直伤必须先飞刃再飘字，否则只剩一句「净化」
      const el = result.element ?? pet.def.element;
      if (await presentAttachedNuke(deps, petIndex, result, el, counterOf(el))) return true;
      // 净化：白光扫过棋盘解封 + 清除我方 debuff
      const unsealReq = result.boardRequests.find((b) => b.type === 'unsealAll');
      if (unsealReq) {
        const cells = board.unsealAll();
        for (const { r, c } of cells) {
          const cell = UI.board.cellSize;
          fx.burst({
            x: boardX + c * cell + cell / 2,
            y: boardY + r * cell + cell / 2,
            color: 0xfff8e1, count: 6, speed: 220, size: 12, life: 0.4,
          });
        }
        boardView.refreshOrbStates();
      }
      SfxManager.playSkillBoardWave();
      fx.flash(0xfff8e1, 0.28, 0.35);
      fx.spawnAuraRing(Game.logicWidth / 2, boardY + UI.board.cellSize * 2.5, 0xfff8e1);
      fx.spawnFloat('净化！', heroAnnounceX, heroAnnounceY, 0xfff8e1, 1.25);
      break;
    }
    case 'timeExtend': {
      fx.spawnFloat(
        `转珠时间 +${result.value ?? 0} 秒（${result.turns ?? 0} 回合）`,
        heroAnnounceX, heroAnnounceY, 0xffe082, 1.15,
      );
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0xffe082, count: 10, speed: 240, gravity: -180, size: 13, life: 0.5,
      });
      break;
    }
    case 'orbConvert': {
      await presentOrbConvertIfAny(deps, result);
      break;
    }
    default:
      break;
  }

  const shown = new Set(primaryChannelsOfCast(vfx?.kind, result.type, result.vfxEvents[0]));
  const el = result.element ?? pet.def.element;
  if (await presentResiduals(deps, petIndex, result, el, counterOf(el), shown)) return true;
  syncSkillHud(deps);
  if ((result.damage ?? 0) > 0 && !result.enemyDead) {
    if (UI.anim.turnTotalLeadIn > 0) await delay(UI.anim.turnTotalLeadIn);
    showSkillPetRecap(deps, petIndex, result);
  }
  return false;
}
