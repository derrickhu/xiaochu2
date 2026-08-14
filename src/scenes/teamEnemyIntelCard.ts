/**
 * 战前编队 · 敌情细条（对齐 team_prep_ui_prototype_v3b）
 *
 * 单行浅色胶囊：属性珠 + 头像 + 名/血攻/克制/抵抗 + 波次。内容避开两端圆弧。
 */
import * as PIXI from 'pixi.js';
import { enemyImage } from '@/config/Assets';
import { counterElementOf, resistedElementOf } from '@/balance/combat';
import { resolveEncounter, type EnemyDef } from '@/balance/enemies';
import { formatEnemyBattleName } from '@/balance/enemyDisplay';
import { enemyStats } from '@/formulas/growth';
import type { PetDef } from '@/balance/pets';
import type { StageDef } from '@/balance/stages';
import {
  COLORS, FONT_SIZE,
  bindLazySprite, makeElementOrb, makeStatIcon, makeText, pressFeedback,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { addSoftCapsule, TEAM_CHROME_STRIP_H } from './teamPrepChrome';

export interface TeamEnemyIntelHandle {
  root: PIXI.Container;
  height: number;
  setWave(index: number): void;
  setTeam(team: readonly PetDef[]): void;
}

const STRIP_H = TEAM_CHROME_STRIP_H;
/** 避开胶囊两端圆弧 / 如意纹 */
const INSET = 58;
/** 属性珠在头像前：先认色再认怪（夹在名字里会被血攻吃掉） */
const ELEM_ORB = 28;
const ELEM_GAP = 8;
/** 无边框圆头像直径 */
const PORTRAIT = 52;
const ARROW_SIZE = 26;
/** 左箭头 + 页码 + 右箭头 的总宽 */
const PAGER_W = 96;

/**
 * 波次翻页箭头：只画一个线条尖角。
 *
 * 敌情是配角信息，不用主线章节那种奶油圆钮（金环 + 高光），否则比敌人本体还抢眼；
 * 命中区仍按 ARROW_SIZE 给足，不因视觉变小而难点。
 */
function makeWaveChevron(dir: -1 | 1, onTap: () => void): PIXI.Container {
  const btn = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.lineStyle(2.6, COLORS.textSub, 0.85, 0.5, true);
  g.moveTo(dir * -3.5, -6);
  g.lineTo(dir * 3.5, 0);
  g.lineTo(dir * -3.5, 6);
  btn.addChild(g);
  btn.hitArea = new PIXI.Rectangle(-ARROW_SIZE / 2, -ARROW_SIZE / 2, ARROW_SIZE, ARROW_SIZE);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.interactiveChildren = false;
  bindPointerTap(btn, onTap);
  pressFeedback(btn, { scale: 0.86 });
  return btn;
}

export function buildTeamEnemyIntelCard(opts: {
  stage: StageDef;
  width: number;
  team?: readonly PetDef[];
}): TeamEnemyIntelHandle {
  const { stage, width } = opts;
  const encounters = stage.encounters.map(resolveEncounter);
  const waveCount = Math.max(1, encounters.length);

  const root = new PIXI.Container();
  addSoftCapsule(root, width, STRIP_H, {
    x: width / 2,
    y: STRIP_H / 2,
  });

  const identLeft = INSET;
  const portraitX = identLeft + ELEM_ORB + ELEM_GAP + PORTRAIT / 2;
  const infoX = identLeft + ELEM_ORB + ELEM_GAP + PORTRAIT + 12;

  const elementHost = new PIXI.Container();
  elementHost.position.set(identLeft + ELEM_ORB / 2, STRIP_H / 2);
  root.addChild(elementHost);

  const portraitHost = new PIXI.Container();
  portraitHost.position.set(portraitX, STRIP_H / 2);
  root.addChild(portraitHost);

  const infoHost = new PIXI.Container();
  infoHost.position.set(infoX, STRIP_H / 2);
  root.addChild(infoHost);

  const pagerHost = new PIXI.Container();
  root.addChild(pagerHost);

  let selected = 0;
  let unbindPortrait: (() => void) | null = null;

  const paintPortrait = (def: EnemyDef): void => {
    unbindPortrait?.();
    unbindPortrait = null;
    portraitHost.removeChildren().forEach((c) => c.destroy({ children: true }));

    const unbinds: Array<() => void> = [];
    const art = new PIXI.Container();
    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5);
    art.addChild(spr);
    const r = PORTRAIT / 2;
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0, 0, r);
    mask.endFill();
    art.addChild(mask);
    art.mask = mask;
    portraitHost.addChild(art);
    unbinds.push(bindLazySprite(spr, {
      path: def.image ?? enemyImage(def.id),
      ensure: true,
      onApplied: (tex) => {
        spr.scale.set(Math.min(PORTRAIT / tex.width, PORTRAIT / tex.height));
      },
    }));
    unbindPortrait = () => { for (const u of unbinds) u(); };

    elementHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    elementHost.addChild(makeElementOrb(def.element, ELEM_ORB));
  };

  const paintInfo = (def: EnemyDef): void => {
    infoHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    const stats = enemyStats(def, stage.chapter, stage.difficulty);
    const pagerW = waveCount > 1 ? PAGER_W + 8 : 0;
    const identW = ELEM_ORB + ELEM_GAP + PORTRAIT;
    const infoW = width - INSET - identW - 12 - INSET - pagerW;

    let x = 0;
    const mid = 0;
    const name = makeText(formatEnemyBattleName(def), {
      size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    name.position.set(x, mid);
    infoHost.addChild(name);
    x += name.width + 10;

    const addStat = (kind: 'hp' | 'atk', value: number): void => {
      const icon = makeStatIcon(kind, 18);
      icon.position.set(x + 9, mid);
      infoHost.addChild(icon);
      const t = makeText(`${value}`, {
        size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      });
      t.position.set(x + 22, mid);
      infoHost.addChild(t);
      x += 22 + t.width + 14;
    };
    addStat('hp', stats.hp);
    addStat('atk', stats.atk);

    const addRel = (label: string, el: ReturnType<typeof counterElementOf>): void => {
      const lab = makeText(label, {
        size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(x, mid);
      infoHost.addChild(lab);
      const o = makeElementOrb(el, 20);
      o.position.set(x + lab.width + 14, mid);
      infoHost.addChild(o);
      x += lab.width + 28;
    };
    addRel('克制', counterElementOf(def.element));
    addRel('抵抗', resistedElementOf(def.element));

    if (x > infoW && infoHost.children.length) {
      const s = infoW / x;
      infoHost.scale.set(Math.min(1, s));
    }
  };

  const paintPager = (): void => {
    pagerHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (waveCount <= 1) return;
    const pg = new PIXI.Container();
    pg.position.set(width - INSET, STRIP_H / 2);

    const step = (delta: number): void => {
      handle.setWave((selected + delta + waveCount) % waveCount);
    };
    const left = makeWaveChevron(-1, () => step(-1));
    left.position.set(-PAGER_W + ARROW_SIZE / 2, 0);
    pg.addChild(left);

    const t = makeText(`${selected + 1}/${waveCount}`, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5,
    });
    t.position.set(-PAGER_W / 2, 0);
    pg.addChild(t);

    const right = makeWaveChevron(1, () => step(1));
    right.position.set(-ARROW_SIZE / 2, 0);
    pg.addChild(right);

    pagerHost.addChild(pg);
  };

  const refresh = (): void => {
    const enc = encounters[selected] ?? encounters[0];
    paintPortrait(enc.def);
    paintInfo(enc.def);
    paintPager();
  };

  const handle: TeamEnemyIntelHandle = {
    root,
    height: STRIP_H,
    setWave(index: number) {
      if (index < 0 || index >= waveCount) return;
      selected = index;
      refresh();
    },
    setTeam(_next: readonly PetDef[]) {
      /* 细条不展示对策清单 */
    },
  };

  refresh();
  return handle;
}
