/**
 * 资源飞入动效（对齐 xiao_chu resourceFlyParticles）
 *
 * 从领取起点抛物线飞向顶栏落点：easeOutCubic + sin 抬升，错开多粒子。
 * 挂在 Overlay 最高层，盖过签到弹窗。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UI_IMAGES } from '@/config/Assets';
import type { RewardBundle } from '@/balance/rewards';

const FLY_DURATION = 0.52;
const STAGGER = 0.09;
const COPIES = 3;

export interface FlyTarget {
  x: number;
  y: number;
}

/** 奖励 → 要飞的图标路径（每种资源飞一组） */
export function rewardFlyIcons(r: RewardBundle): string[] {
  const icons: string[] = [];
  if (r.lingyu) icons.push(UI_IMAGES.iconLingyu);
  if (r.coins) icons.push(UI_IMAGES.iconCoin);
  if (r.exp) icons.push(UI_IMAGES.iconExp);
  if (r.tickets) icons.push(UI_IMAGES.iconTicket);
  if (r.shards) icons.push(UI_IMAGES.iconShard);
  return icons;
}

/** 签到/任务格子上展示的主图标（复合奖励优先券/碎片） */
export function primaryRewardIcon(r: RewardBundle): string {
  if (r.tickets) return UI_IMAGES.iconTicket;
  if (r.shards) return UI_IMAGES.iconShard;
  if (r.lingyu) return UI_IMAGES.iconLingyu;
  if (r.coins) return UI_IMAGES.iconCoin;
  if (r.exp) return UI_IMAGES.iconExp;
  return UI_IMAGES.iconLingyu;
}

/** 主图标旁数量文案（复合奖励取最显眼的一项） */
export function primaryRewardAmount(r: RewardBundle): string {
  if (r.tickets) return `×${r.tickets}`;
  if (r.shards) return `×${r.shards}`;
  if (r.lingyu) return `×${r.lingyu}`;
  if (r.coins) return `×${r.coins}`;
  if (r.exp) return `×${r.exp}`;
  return '';
}

function defaultTargetFor(iconPath: string, index: number): FlyTarget {
  const topY = Game.safeHeaderCenterY;
  if (iconPath === UI_IMAGES.iconLingyu) {
    return { x: Game.logicWidth * 0.42, y: topY };
  }
  if (iconPath === UI_IMAGES.iconCoin) {
    return { x: Game.logicWidth * 0.58, y: topY };
  }
  // 券 / 碎片 / 经验：飞向顶栏中央一带
  return { x: Game.logicWidth * (0.35 + index * 0.15), y: topY };
}

/**
 * 在 layer 上播放资源飞入。
 * @returns 全部粒子播完的大致时长（秒），便于调用方延后刷新 UI
 */
export function playRewardFly(
  layer: PIXI.Container,
  reward: RewardBundle,
  from: FlyTarget,
  opts?: { targets?: Partial<Record<string, FlyTarget>> },
): number {
  const icons = rewardFlyIcons(reward);
  if (icons.length === 0) return 0;

  let maxEnd = 0;
  icons.forEach((iconPath, i) => {
    const dest = opts?.targets?.[iconPath] ?? defaultTargetFor(iconPath, i);
    for (let j = 0; j < COPIES; j++) {
      const delay = i * STAGGER + j * 0.04;
      maxEnd = Math.max(maxEnd, delay + FLY_DURATION);
      spawnOne(layer, iconPath, {
        sx: from.x + (j - 1) * 14,
        sy: from.y,
        tx: dest.x + (j - 1) * 10,
        ty: dest.y,
        delay,
      });
    }
  });
  return maxEnd;
}

/** 领取点金色爆光（短促，配合飞效） */
export function playClaimBurst(layer: PIXI.Container, x: number, y: number): void {
  const burst = new PIXI.Graphics();
  burst.position.set(x, y);
  layer.addChild(burst);

  const state = { r: 8, a: 0.7 };
  const redraw = (): void => {
    burst.clear();
    burst.beginFill(0xffd76a, state.a * 0.35);
    burst.drawCircle(0, 0, state.r);
    burst.endFill();
    burst.lineStyle(3, 0xffe6a0, state.a);
    burst.drawCircle(0, 0, state.r * 0.72);
  };
  redraw();

  TweenManager.to({
    target: state,
    props: { r: 56, a: 0 },
    duration: 0.38,
    ease: Ease.easeOutCubic,
    onUpdate: redraw,
    onComplete: () => {
      if (!burst.destroyed) burst.destroy();
    },
  });

  // 星点四散
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI * 2 * i) / 10;
    const star = new PIXI.Graphics();
    star.beginFill(0xffe08a, 1);
    star.drawCircle(0, 0, 3.5);
    star.endFill();
    star.position.set(x, y);
    layer.addChild(star);
    const dist = 36 + (i % 3) * 10;
    TweenManager.to({
      target: star,
      props: {
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
      },
      duration: 0.42,
      ease: Ease.easeOutCubic,
      onComplete: () => {
        if (!star.destroyed) star.destroy();
      },
    });
  }
}

function spawnOne(
  layer: PIXI.Container,
  iconPath: string,
  p: { sx: number; sy: number; tx: number; ty: number; delay: number },
): void {
  const tex = TextureCache.get(iconPath);
  const root = new PIXI.Container();
  root.position.set(p.sx, p.sy);
  root.alpha = 0;
  layer.addChild(root);

  // 金色光晕垫底
  const glow = new PIXI.Graphics();
  glow.beginFill(0xffd700, 0.35);
  glow.drawCircle(0, 0, 22);
  glow.endFill();
  root.addChild(glow);

  if (tex) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = 36;
    sp.height = 36;
    root.addChild(sp);
  } else {
    void TextureCache.load(iconPath).then((loaded) => {
      if (root.destroyed) return;
      const sp = new PIXI.Sprite(loaded);
      sp.anchor.set(0.5);
      sp.width = 36;
      sp.height = 36;
      root.addChild(sp);
    }).catch(() => null);
  }

  const state = { t: 0 };
  TweenManager.to({
    target: state,
    props: { t: 1 },
    duration: FLY_DURATION,
    delay: p.delay,
    ease: Ease.easeOutCubic,
    onUpdate: () => {
      if (root.destroyed) return;
      const ep = state.t;
      root.position.set(
        p.sx + (p.tx - p.sx) * ep,
        p.sy + (p.ty - p.sy) * ep - Math.sin(ep * Math.PI) * 48,
      );
      root.alpha = ep <= 0.001 ? 0 : ep < 0.8 ? 1 : (1 - ep) / 0.2;
      const sz = 32 + 16 * Math.sin(ep * Math.PI);
      glow.clear();
      glow.beginFill(0xffd700, 0.28 * root.alpha);
      glow.drawCircle(0, 0, sz * 0.65);
      glow.endFill();
      for (const child of root.children) {
        if (child instanceof PIXI.Sprite) {
          child.width = sz;
          child.height = sz;
        }
      }
    },
    onComplete: () => {
      if (!root.destroyed) root.destroy({ children: true });
    },
  });
}
