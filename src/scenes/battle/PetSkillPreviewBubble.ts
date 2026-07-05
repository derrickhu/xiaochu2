/**
 * 战斗队伍栏：点击宠物头像弹出的主动技说明气泡（轻量，无全局遮罩）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager } from '@/core/TweenManager';
import { computePetBarPetSize } from './BattleLayout';
import { UI, ORB_COLOR } from '@/balance/ui';
import type { TeamPet } from '@/game/battle/battleTypes';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { COLORS, FONT_SIZE } from '@/ui/theme';

const AUTO_DISMISS_SEC = 4;
const TAP_SLOP = 14;

export { TAP_SLOP };

export interface PetSkillPreviewHandle {
  dismiss: () => void;
}

/** 在 layer 上显示技能气泡；再次调用前须 dismiss 旧实例 */
export function showPetSkillPreview(
  layer: PIXI.Container,
  pet: TeamPet,
  slotX: number,
  slotY: number,
): PetSkillPreviewHandle {
  const panelW = Math.min(320, Game.logicWidth - 32);
  const wrapW = panelW - 28;
  const color = ORB_COLOR[pet.def.element];
  const skill = pet.skill;

  const title = makeText(`${skill.name}  ·  CD ${skill.cd}`, {
    size: FONT_SIZE.sm,
    fill: color,
    bold: true,
    anchor: [0.5, 0],
    align: 'center',
    wordWrapWidth: wrapW,
  });

  const parts: PIXI.Text[] = [title];
  let y = 12 + title.height;

  if (pet.skillCdLeft > 0) {
    const cd = makeText(`冷却中 · 剩 ${pet.skillCdLeft} 回合`, {
      size: FONT_SIZE.xs,
      fill: COLORS.textSub,
      anchor: [0.5, 0],
      align: 'center',
    });
    cd.position.set(0, y + 4);
    parts.push(cd);
    y += 4 + cd.height;
  }

  const desc = makeText(skill.desc, {
    size: FONT_SIZE.xs,
    fill: COLORS.textMain,
    anchor: [0.5, 0],
    align: 'center',
    wordWrapWidth: wrapW,
  });
  desc.position.set(0, y + 8);
  parts.push(desc);
  y += 8 + desc.height + 14;

  const panelH = y;
  const root = new PIXI.Container();
  const margin = UI.board.marginX;
  let cx = slotX;
  cx = Math.max(margin + panelW / 2, Math.min(Game.logicWidth - margin - panelW / 2, cx));
  root.position.set(cx, slotY - computePetBarPetSize(Game.logicWidth, 5) / 2 - 12);

  root.addChild(makePanel({
    width: panelW, height: panelH, radius: 12, centered: true,
    bg: COLORS.panelBg, bgAlpha: 0.96,
    border: color, borderWidth: 2,
  }));

  const content = new PIXI.Container();
  content.position.set(0, -panelH / 2);
  for (const t of parts) content.addChild(t);
  root.addChild(content);

  root.alpha = 0;
  root.scale.set(0.92);
  layer.addChild(root);

  TweenManager.to({ target: root, props: { alpha: 1 }, duration: 0.12 });
  TweenManager.to({ target: root.scale, props: { x: 1, y: 1 }, duration: 0.14 });

  const autoTimer = { t: 0 };
  const dismiss = (): void => {
    if (!root.parent) return;
    TweenManager.cancelTarget(autoTimer);
    TweenManager.cancelTarget(root);
    TweenManager.cancelTarget(root.scale);
    root.destroy({ children: true });
  };

  TweenManager.to({
    target: autoTimer,
    props: { t: 1 },
    duration: AUTO_DISMISS_SEC,
    onComplete: dismiss,
  });

  return { dismiss };
}
