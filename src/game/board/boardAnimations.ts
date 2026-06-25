import * as PIXI from 'pixi.js';
import { ObjectPool } from '@/core/ObjectPool';
import { Ease, TweenManager } from '@/core/TweenManager';
import { UI } from '@/balance/ui';
import type { OrbType } from '@/balance/combat';
import type { Cell, FallMove, MatchGroup } from './BoardModel';

export interface BoardAnimationContext {
  cell: number;
  sprites: (PIXI.Sprite | null)[][];
  pool: ObjectPool<PIXI.Sprite>;
  spawnSprite: (orb: OrbType, r: number, c: number) => PIXI.Sprite;
  applyOrbTexture: (sp: PIXI.Sprite, orb: OrbType) => void;
  cellCenterY: (r: number) => number;
  refreshOrbStates: () => void;
}

/** 播放一组消除动画（缩放消失），结束后从池回收 */
export function playBoardClear(ctx: BoardAnimationContext, group: MatchGroup): Promise<void> {
  return new Promise((resolve) => {
    let remain = group.cells.length;
    const done = (): void => {
      remain--;
      if (remain <= 0) resolve();
    };
    for (const { r, c } of group.cells) {
      const sp = ctx.sprites[r][c];
      ctx.sprites[r][c] = null;
      if (!sp) {
        done();
        continue;
      }
      TweenManager.to({
        target: sp.scale, props: { x: sp.scale.x * 1.25, y: sp.scale.y * 1.25 },
        duration: UI.anim.orbClear * 0.3, ease: Ease.easeOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: sp.scale, props: { x: 0.01, y: 0.01 },
            duration: UI.anim.orbClear * 0.7, ease: Ease.easeInQuad,
          });
          TweenManager.to({
            target: sp, props: { alpha: 0 },
            duration: UI.anim.orbClear * 0.7,
            onComplete: () => {
              ctx.pool.release(sp);
              done();
            },
          });
        },
      });
    }
    if (group.cells.length === 0) resolve();
  });
}

/** 播放下落/补珠动画 */
export function playBoardFall(ctx: BoardAnimationContext, moves: FallMove[]): Promise<void> {
  return new Promise((resolve) => {
    if (moves.length === 0) {
      resolve();
      return;
    }
    let remain = moves.length;
    const done = (): void => {
      remain--;
      if (remain <= 0) resolve();
    };
    for (const m of moves) {
      let sp: PIXI.Sprite | null;
      if (m.fromRow !== null) {
        sp = ctx.sprites[m.fromRow][m.col];
        ctx.sprites[m.fromRow][m.col] = null;
      } else {
        sp = ctx.spawnSprite(m.orb, -m.spawnAbove, m.col);
      }
      ctx.sprites[m.toRow][m.col] = sp;
      if (!sp) {
        done();
        continue;
      }
      const targetY = ctx.cellCenterY(m.toRow);
      const dist = Math.abs(targetY - sp.y) / ctx.cell;
      const dur = UI.anim.orbFall * (0.5 + 0.5 * Math.min(dist / 3, 1));
      TweenManager.to({
        target: sp, props: { y: targetY },
        duration: dur, ease: Ease.easeOutBounce,
        onComplete: () => {
          done();
          if (remain <= 0) ctx.refreshOrbStates();
        },
      });
    }
  });
}

/** 播放转珠动画：目标格珠子弹跳缩放并切换为新珠贴图 */
export function playBoardConvert(
  ctx: BoardAnimationContext,
  cells: Cell[],
  to: OrbType,
): Promise<void> {
  return new Promise((resolve) => {
    if (cells.length === 0) {
      resolve();
      return;
    }
    let remain = cells.length;
    const done = (): void => {
      remain--;
      if (remain <= 0) resolve();
    };
    const size = ctx.cell * UI.board.orbScale;
    for (const { r, c } of cells) {
      const sp = ctx.sprites[r][c];
      if (!sp) {
        done();
        continue;
      }
      TweenManager.cancelTarget(sp.scale);
      TweenManager.to({
        target: sp, props: { width: size * 0.1, height: size * 0.1 },
        duration: UI.anim.orbSwap * 1.5, ease: Ease.easeInQuad,
        onComplete: () => {
          ctx.applyOrbTexture(sp, to);
          sp.width = size * 0.1;
          sp.height = size * 0.1;
          TweenManager.to({
            target: sp, props: { width: size, height: size },
            duration: UI.anim.orbSwap * 2.5, ease: Ease.easeOutBack,
            onComplete: () => {
              done();
              if (remain <= 0) ctx.refreshOrbStates();
            },
          });
        },
      });
    }
  });
}
