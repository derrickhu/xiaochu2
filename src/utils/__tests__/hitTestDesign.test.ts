/**
 * 命中顺序回归测试。
 *
 * 小游戏的 tap 不走 Pixi 原生 hitTest，层级完全由 pickTopmostHit 自己判。曾经它把
 * 父链索引压成一个数（order * 1000 + index，从叶往根累加），等于让叶节点的索引占了
 * 最高位——于是「点 GM 按钮弹出怪物说明」：Overlay 里的 GM 按钮算出 3002，战斗场景
 * 里埋得更深的全宽点怪热区算出 15001，热区赢了。
 *
 * 这类 bug 在真机上极难复现定位，用例锁住三条规则。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as PIXI from 'pixi.js';

const hoisted = vi.hoisted(() => ({ stage: null as PIXI.Container | null }));
vi.mock('@/core/Game', () => ({
  Game: { get stage(): PIXI.Container | null { return hoisted.stage; } },
}));

// eslint-disable-next-line import/first
import { pickTopmostHit } from '../hitTestDesign';

function zone(x: number, y: number, w: number, h: number): PIXI.Container {
  const c = new PIXI.Container();
  c.eventMode = 'static';
  c.hitArea = new PIXI.Rectangle(x, y, w, h);
  return c;
}

describe('pickTopmostHit', () => {
  let stage: PIXI.Container;

  beforeEach(() => {
    stage = new PIXI.Container();
    hoisted.stage = stage;
  });

  it('顶层容器胜过深层子树里的叶节点', () => {
    // 复刻战斗界面：场景子树又深又宽，Overlay 只有薄薄两层
    const scene = new PIXI.Container();
    stage.addChild(scene);
    for (let i = 0; i < 15; i++) scene.addChild(new PIXI.Container());
    const enemyZone = zone(0, 100, 750, 150);
    scene.addChild(enemyZone);

    const overlay = new PIXI.Container();
    stage.addChild(overlay);
    const gmBtn = zone(686, 94, 56, 32);
    overlay.addChild(gmBtn);

    // 右上角 GM 按钮完全落在全宽点怪热区内，必须由 GM 接走
    expect(pickTopmostHit([enemyZone, gmBtn], 700, 105)).toBe(gmBtn);
  });

  it('同一父容器下后添加的在上', () => {
    const scene = new PIXI.Container();
    stage.addChild(scene);
    const under = zone(0, 0, 400, 400);
    const over = zone(0, 0, 400, 400);
    scene.addChild(under);
    scene.addChild(over);

    expect(pickTopmostHit([under, over], 100, 100)).toBe(over);
  });

  it('同一条父链上更深的在上', () => {
    const scene = new PIXI.Container();
    stage.addChild(scene);
    const panel = zone(0, 0, 400, 400);
    scene.addChild(panel);
    const child = zone(0, 0, 200, 200);
    panel.addChild(child);

    expect(pickTopmostHit([panel, child], 50, 50)).toBe(child);
  });

  it('未命中的候选一律忽略', () => {
    const scene = new PIXI.Container();
    stage.addChild(scene);
    const far = zone(600, 600, 50, 50);
    const near = zone(0, 0, 100, 100);
    scene.addChild(near);
    scene.addChild(far);

    expect(pickTopmostHit([far, near], 10, 10)).toBe(near);
    expect(pickTopmostHit([far], 10, 10)).toBeNull();
  });
});
