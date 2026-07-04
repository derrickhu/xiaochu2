/**
 * 宠物主动技演出：把 BattleController.castSkill 的结果按 VFX 类型映射为画面表现
 * （弹道 / 齐射 / 多段 / DOT / 眩晕 / 破防 / 治疗 / 护盾 / 增伤 / 转珠）。
 *
 * 纯演出编排：依赖通过 deps 注入，自身不持有状态。返回 true 表示战斗已在演出中结束
 * （最后一波敌人被击败），编排者据此保留 busy 状态、跳过收尾刷新。
 */
import { ORB_COLOR } from '@/balance/ui';
import { SKILL_VFX_MAP } from '@/balance/skillVfx';
import { UI } from '@/balance/ui';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import type { BattleController } from '@/game/battle/BattleController';
import type { BoardModel } from '@/game/board/BoardModel';
import type { BoardView } from '@/game/board/BoardView';
import type { Element } from '@/balance/combat';
import type { BattleFx } from './BattleFx';
import type { BattleHud } from './BattleHud';
import type { BattlePetBar } from './BattlePetBar';
import type { BattleLayout } from './BattleLayout';

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
  /** 敌人死亡处理，返回 true = 战斗结束 */
  handleEnemyDefeat: () => Promise<boolean>;
}

function spawnSkillDamage(
  fx: BattleFx,
  petBar: BattlePetBar,
  petIndex: number,
  element: Element,
  damage: number,
  opts?: { isCrit?: boolean; orderIdx?: number; minor?: boolean; skill?: boolean },
): void {
  if (damage <= 0) return;
  const slot = petBar.slotAt(petIndex);
  if (!slot || slot.destroyed) return;
  fx.spawnPetDamageFloat({
    slotX: slot.x,
    slotY: slot.y,
    element,
    damage,
    isCrit: opts?.isCrit ?? false,
    orderIdx: opts?.orderIdx ?? 0,
    minor: opts?.minor,
    skill: opts?.skill ?? true,
  });
}

/** 返回 true 表示战斗已结束（最后一波敌人被击败）。 */
export async function presentSkillCast(deps: SkillCastDeps, petIndex: number): Promise<boolean> {
  const { ctrl, fx, hud, petBar, board, boardView, layout } = deps;
  const { enemyCenterX, enemyCenterY, boardX, boardY, heroBarY } = layout;

  const pet = ctrl.team[petIndex];
  const color = ORB_COLOR[pet.def.element];
  const result = ctrl.castSkill(petIndex);
  deps.refreshSkillUi();
  Platform.vibrateShort('medium');

  // 通用演出：属性色全屏闪 + 技能名横幅
  const vfx = SKILL_VFX_MAP.get(result.vfxEvents[0]);
  fx.flash(color, vfx?.flashDuration ?? 0.25, vfx?.flashAlpha ?? 0.4);
  await fx.showSkillBanner(pet.skill.name, color);

  switch (vfx?.kind) {
    case 'projectile': {
      const slot = petBar.slotAt(petIndex);
      const damage = result.damage ?? 0;
      const el = result.element ?? pet.def.element;
      await fx.fireProjectileBetween(slot.x, slot.y - 60, enemyCenterX, enemyCenterY, el);
      // UR 招牌直伤命中：starburst 高光（pkg-fx，缺贴图自动降级白粒子）
      if (pet.def.rarity >= 4) fx.spawnStarburst(enemyCenterX, enemyCenterY, ORB_COLOR[el]);
      hud.playEnemyHit(fx, el, damage, true);
      spawnSkillDamage(fx, petBar, petIndex, el, damage);
      hud.refreshEnemyHp();
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'teamVolley': {
      const damage = result.damage ?? 0;
      // 全队齐射：所有槽位同时发弹道，命中弹一次总伤害
      await Promise.all(ctrl.team.map((member, i) =>
        fx.fireProjectileBetween(
          petBar.slotAt(i).x, petBar.slotAt(i).y - 60, enemyCenterX, enemyCenterY, member.def.element,
        ),
      ));
      hud.playEnemyHit(fx, pet.def.element, damage, true);
      spawnSkillDamage(fx, petBar, petIndex, pet.def.element, damage);
      hud.refreshEnemyHp();
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'multiHit': {
      // 多段直伤：连续发弹道，逐段弹伤害数字
      const total = result.damage ?? 0;
      const hits = result.damageEvents.filter((e) => e.target === 'enemy').length || 1;
      const slot = petBar.slotAt(petIndex);
      const el = result.element ?? pet.def.element;
      for (let i = 0; i < hits; i++) {
        await fx.fireProjectileBetween(slot.x, slot.y - 60, enemyCenterX, enemyCenterY, el);
        hud.playEnemyHit(fx, el, Math.round(total / hits), i === hits - 1);
        spawnSkillDamage(fx, petBar, petIndex, el, Math.round(total / hits), {
          orderIdx: i,
          minor: i > 0,
        });
      }
      hud.refreshEnemyHp();
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'dotApply': {
      const slot = petBar.slotAt(petIndex);
      const el = result.element ?? pet.def.element;
      const initial = result.damage ?? 0;
      await fx.fireProjectileBetween(slot.x, slot.y - 60, enemyCenterX, enemyCenterY, el);
      if (initial > 0) {
        hud.playEnemyHit(fx, el, initial, true);
        spawnSkillDamage(fx, petBar, petIndex, el, initial);
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
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'stun': {
      const damage = result.damage ?? 0;
      if (damage > 0) {
        const slot = petBar.slotAt(petIndex);
        const el = result.element ?? pet.def.element;
        await fx.fireProjectileBetween(slot.x, slot.y - 60, enemyCenterX, enemyCenterY, el);
        hud.playEnemyHit(fx, el, damage, true);
        spawnSkillDamage(fx, petBar, petIndex, el, damage);
      }
      fx.spawnFloat(`眩晕 ${result.turns ?? 0} 回合`, enemyCenterX, enemyCenterY - 76, 0xfff176, 1.2);
      fx.burst({
        x: enemyCenterX, y: enemyCenterY - 50,
        color: 0xfff176, count: 10, speed: 160, gravity: -60, size: 12, life: 0.7,
      });
      hud.refreshEnemyHp();
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'defenseBreak': {
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
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8be78b);
      fx.spawnFloat(`+${result.healed ?? 0}`, Game.logicWidth / 2, heroBarY - 24, 0x6fd86a, 1.2);
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0x8be78b, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
      });
      break;
    }
    case 'shieldBurst': {
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0x8fd4ff);
      fx.spawnFloat(`护盾 ${result.value ?? 0}`, Game.logicWidth / 2, heroBarY - 24, 0x8fd4ff, 1.2);
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
      if (result.type === 'delayAttack') {
        // 威吓可附带直伤：先弹道命中再飘字
        const damage = result.damage ?? 0;
        if (damage > 0) {
          const slot = petBar.slotAt(petIndex);
          const el = result.element ?? pet.def.element;
          await fx.fireProjectileBetween(slot.x, slot.y - 60, enemyCenterX, enemyCenterY, el);
          hud.playEnemyHit(fx, el, damage, true);
          spawnSkillDamage(fx, petBar, petIndex, el, damage);
          hud.refreshEnemyHp();
          if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
        }
        fx.spawnFloat(
          `威吓！敌人攻击推迟 ${result.enemyAttackDelay ?? 0} 回合`,
          enemyCenterX, enemyCenterY - 50, 0xffd54f, 1.15,
        );
        hud.refreshEnemyCd();
        break;
      }
      fx.spawnAuraRing(Game.logicWidth / 2, heroBarY, 0xffb74d);
      fx.spawnFloat(label, Game.logicWidth / 2, heroBarY - 24, 0xffb74d, 1.1);
      break;
    }
    case 'gravityCrush': {
      // 重力：暗色压场 + 敌人下压弹回 + 重震 + starburst 高光 + 伤害数字
      const damage = result.damage ?? 0;
      fx.flash(0x2d1b4e, 0.3, 0.5);
      fx.shakeHeavy();
      Platform.vibrateLong();
      await hud.playEnemyGravityCrush(fx);
      fx.spawnStarburst(enemyCenterX, enemyCenterY, 0x9575cd);
      hud.playEnemyHit(fx, pet.def.element, damage, true);
      spawnSkillDamage(fx, petBar, petIndex, pet.def.element, damage);
      hud.refreshEnemyHp();
      if (result.enemyDead && await deps.handleEnemyDefeat()) return true;
      break;
    }
    case 'hasteGlow': {
      // 连携：每个队友槽位金色光环 + 冷却刷新
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
        `全队技能冷却 -${result.teamCdDelta ?? 0}`,
        Game.logicWidth / 2, heroBarY - 24, 0xffd54f, 1.2,
      );
      deps.refreshSkillUi();
      break;
    }
    case 'purifyWave': {
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
      fx.flash(0xfff8e1, 0.28, 0.35);
      fx.spawnAuraRing(Game.logicWidth / 2, boardY + UI.board.cellSize * 2.5, 0xfff8e1);
      fx.spawnFloat('净化！', Game.logicWidth / 2, heroBarY - 24, 0xfff8e1, 1.25);
      break;
    }
    case 'timeExtend': {
      fx.spawnFloat(
        `转珠时间 +${result.value ?? 0} 秒（${result.turns ?? 0} 回合）`,
        Game.logicWidth / 2, heroBarY - 24, 0xffe082, 1.15,
      );
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0xffe082, count: 10, speed: 240, gravity: -180, size: 13, life: 0.5,
      });
      break;
    }
    case 'orbConvert': {
      const to = result.to ?? 'heart';
      const convertReq = result.boardRequests.find(
        (b): b is Extract<typeof b, { type: 'convertOrbs' }> => b.type === 'convertOrbs',
      );
      const cells = result.shape === 'row'
        ? board.convertRow(to)
        : result.shape === 'col'
          ? board.convertCol(to)
          : result.shape === 'cross'
            ? board.convertCross(to)
            : board.convertRandom(to, result.count ?? 0, convertReq?.from);
      for (const { r, c } of cells) {
        const cell = UI.board.cellSize;
        fx.burst({
          x: boardX + c * cell + cell / 2,
          y: boardY + r * cell + cell / 2,
          color: ORB_COLOR[to],
          count: 5, speed: 240, size: 12, life: 0.35,
        });
      }
      await boardView.playConvert(cells, to);
      break;
    }
    default:
      break;
  }

  return false;
}
