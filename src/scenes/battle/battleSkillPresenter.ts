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
      await fx.fireProjectileBetween(
        slot.x, slot.y - 60, enemyCenterX, enemyCenterY, result.element ?? pet.def.element,
      );
      hud.playEnemyHit(fx, result.element ?? pet.def.element, damage, true);
      fx.spawnFloat(
        `${damage}`,
        enemyCenterX + (Math.random() - 0.5) * 100,
        enemyCenterY - 40,
        color, 1.4,
      );
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
      fx.spawnFloat(`${damage}`, enemyCenterX, enemyCenterY - 40, color, 1.5);
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
        fx.spawnFloat(
          `${Math.round(total / hits)}`,
          enemyCenterX + (Math.random() - 0.5) * 110,
          enemyCenterY - 40 - i * 8,
          color, 1.2,
        );
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
        fx.spawnFloat(`${initial}`, enemyCenterX, enemyCenterY - 40, color, 1.3);
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
        fx.spawnFloat(`${damage}`, enemyCenterX, enemyCenterY - 40, color, 1.3);
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
      fx.spawnFloat(`+${result.healed ?? 0}`, Game.logicWidth / 2, heroBarY - 24, 0x6fd86a, 1.2);
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0x8be78b, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
      });
      break;
    }
    case 'shieldBurst': {
      fx.spawnFloat(`护盾 ${result.value ?? 0}`, Game.logicWidth / 2, heroBarY - 24, 0x8fd4ff, 1.2);
      fx.burst({
        x: Game.logicWidth / 2, y: heroBarY,
        color: 0x8fd4ff, count: 12, speed: 280, gravity: -200, size: 14, life: 0.6,
      });
      break;
    }
    case 'buffFloat': {
      fx.spawnFloat(
        `全队伤害 ×${result.mult ?? 1}（${result.turns ?? 0} 回合）`,
        Game.logicWidth / 2, heroBarY - 24, 0xffb74d, 1.1,
      );
      break;
    }
    case 'orbConvert': {
      const to = result.to ?? 'heart';
      const cells = result.shape === 'row'
        ? board.convertRow(to)
        : result.shape === 'col'
          ? board.convertCol(to)
          : board.convertRandom(to, result.count ?? 0);
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
