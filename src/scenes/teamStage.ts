/**
 * 战前编队 · 立绘站台（对齐 team_prep_ui_prototype_v3b）
 *
 * 五只宠浅弧站在石座/金座上；队长居中，「队长」飘带 + 队长令气泡在立绘上方。
 * 立绘全身 contain；座锚点偏低，露出圆板下的石块；五行珠同一水平线。
 */
import * as PIXI from 'pixi.js';
import type { PetDef } from '@/balance/pets';
import { UI_IMAGES, petShowcaseLoadPaths } from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  bindLazySprite, makeText, makeTitleText,
} from '@/ui';
import {
  makeLeaderSkillPlaque,
  LEADER_SKILL_PLAQUE_H,
  LEADER_SKILL_PLAQUE_POINTER,
  type LeaderSkillPlaqueInfo,
} from './teamPrepChrome';

/** 队长令气泡最大宽度：队长居中，取到 560 仍在 750 宽内左右留边 */
const LEADER_PLAQUE_MAX_W = 560;

/** 视觉槽 0..4 → team[] 下标。2 永远是队长（team[0]）。 */
export const STAGE_SLOT_TEAM_INDEX = [3, 1, 0, 2, 4] as const;
/** 从后往前画：两翼在后、队长在最前 */
export const STAGE_PAINT_ORDER = [0, 4, 1, 3, 2] as const;
/**
 * 五行珠 / 换队长钮的统一 Y 偏移与珠径。
 *
 * 珠与钮由场景画在所有石座之上（相邻座会互相压盖，尤其放大的队长座）。
 */
export const STAGE_ORB_LOCAL_Y = 46;
export const STAGE_ORB_SIZE = 26;

export interface StageSlotLayout {
  visual: number;
  teamIndex: number;
  x: number;
  y: number;
  scale: number;
  isLeaderSlot: boolean;
}

export interface StageSlotSize {
  width: number;
  height: number;
  unbind: () => void;
  /** 队长技气泡，换队长时由场景 popIn */
  leaderPlaque?: PIXI.Container;
}

export function stageSlotLayout(centerX: number, baseY: number): StageSlotLayout[] {
  const dx = 130;
  const dy = [8, 4, 0, 4, 8];
  const scales = [0.96, 1, 1.12, 1, 0.96];
  return [0, 1, 2, 3, 4].map((i) => ({
    visual: i,
    teamIndex: STAGE_SLOT_TEAM_INDEX[i],
    x: centerX + (i - 2) * dx,
    y: baseY + dy[i],
    scale: scales[i],
    isLeaderSlot: i === 2,
  }));
}

function fitWidth(spr: PIXI.Sprite, tex: PIXI.Texture, width: number): void {
  const s = width / Math.max(1, tex.width);
  spr.scale.set(s);
}

function fitContain(spr: PIXI.Sprite, tex: PIXI.Texture, maxW: number, maxH: number): void {
  const s = Math.min(maxW / Math.max(1, tex.width), maxH / Math.max(1, tex.height));
  spr.scale.set(s);
}

export function addTeamStagePet(
  parent: PIXI.Container,
  pet: PetDef,
  star: number,
  scale: number,
  leader: boolean,
  leaderSkill?: LeaderSkillPlaqueInfo,
): StageSlotSize {
  const unbinds: Array<() => void> = [];
  const pedW = (leader ? 152 : 130) * scale;
  const bodyW = 122 * scale;
  const bodyH = 186 * scale;
  const h = bodyH + 36 + pedW * 0.55;

  const ped = new PIXI.Sprite(PIXI.Texture.EMPTY);
  ped.anchor.set(0.5, 0.28);
  ped.position.set(0, 0);
  parent.addChild(ped);
  unbinds.push(bindLazySprite(ped, {
    path: leader ? UI_IMAGES.teamPedestalGold : UI_IMAGES.teamPedestalStone,
    ensure: true,
    onApplied: (tex) => fitWidth(ped, tex, pedW),
  }));

  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5, 0.92);
  spr.position.set(0, -10);
  parent.addChild(spr);

  let ribbon: (PIXI.Container & { unbind: () => void }) | null = null;
  let leaderPlaque: PIXI.Container | undefined;
  const crownStack = new PIXI.Container();
  if (leader) {
    ribbon = makeLeaderRibbon(scale);
    crownStack.addChild(ribbon);
    if (leaderSkill) {
      leaderPlaque = makeLeaderSkillPlaque(leaderSkill, LEADER_PLAQUE_MAX_W);
      const ribbonH = 160 * scale * RIBBON_ASPECT;
      const gap = 8;
      leaderPlaque.position.set(
        0,
        -ribbonH * 0.5 - LEADER_SKILL_PLAQUE_POINTER - LEADER_SKILL_PLAQUE_H / 2 - gap,
      );
      crownStack.addChild(leaderPlaque);
    }
    crownStack.position.set(0, -bodyH * 0.78);
    parent.addChild(crownStack);
    unbinds.push(ribbon.unbind);
  }

  unbinds.push(bindLazySprite(spr, {
    path: petShowcaseLoadPaths(pet.id, star),
    ensure: true,
    onApplied: (tex) => {
      fitContain(spr, tex, bodyW, bodyH);
      if (ribbon) {
        // 带面下缘约在容器原点 +4，故留 10 的余量让飘带压在头顶之上而不盖脸
        const artTop = spr.y - spr.anchor.y * spr.height;
        crownStack.position.set(0, artTop - 10 * scale);
      }
    },
  }));

  return {
    width: Math.max(bodyW, pedW) + 8,
    height: h,
    unbind: () => { for (const u of unbinds) u(); },
    leaderPlaque,
  };
}

export function addTeamStageEmpty(parent: PIXI.Container, scale: number): StageSlotSize {
  const unbinds: Array<() => void> = [];
  const pedW = 130 * scale;
  const ped = new PIXI.Sprite(PIXI.Texture.EMPTY);
  ped.anchor.set(0.5, 0.28);
  ped.alpha = 0.55;
  parent.addChild(ped);
  unbinds.push(bindLazySprite(ped, {
    path: UI_IMAGES.teamPedestalStone,
    ensure: true,
    onApplied: (tex) => fitWidth(ped, tex, pedW),
  }));
  parent.addChild(makeText('+', {
    size: FONT_SIZE.lg * scale, fill: COLORS.textSub, anchor: 0.5,
  }));
  return {
    width: pedW + 8,
    height: pedW * 0.75 + 24,
    unbind: () => { for (const u of unbinds) u(); },
  };
}

/**
 * 「队长」米色飘带：燕尾裁口 + 朱砂题字，对齐 v3b 原型。
 *
 * 贴图两端燕尾低于带面，题字须按「带面」而非整图居中，故用图形比例反推位置：
 * 带面中心在整图高度的 29.5% 处，带面净高约整图的 60%。
 */
const RIBBON_ASPECT = 122 / 420;
const RIBBON_BAND_CENTER = 0.295;

function makeLeaderRibbon(scale: number): PIXI.Container & { unbind: () => void } {
  const root = new PIXI.Container() as PIXI.Container & { unbind: () => void };
  const w = 160 * scale;
  const h = w * RIBBON_ASPECT;
  const banner = new PIXI.Sprite(PIXI.Texture.EMPTY);
  banner.anchor.set(0.5, 0.5);
  root.addChild(banner);
  root.unbind = bindLazySprite(banner, {
    path: UI_IMAGES.teamLeaderRibbon,
    ensure: true,
    onApplied: (tex) => {
      banner.scale.set(w / Math.max(1, tex.width));
    },
  });
  const label = makeTitleText('队长', {
    size: Math.round(h * 0.52),
    fill: COLORS.textSeal,
    anchor: 0.5,
  });
  label.position.set(0, -h * (0.5 - RIBBON_BAND_CENTER));
  root.addChild(label);
  return root;
}
