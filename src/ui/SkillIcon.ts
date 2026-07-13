/**
 * 技能圆形图标：贴图优先；锁定态 = 原图标灰显 + 叠锁（对齐原型）。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { skillIconImage, passiveIconImage } from '@/config/Assets';
import { COLORS } from './theme';
import { makeText } from './text';

export interface SkillIconOpts {
  /** 主动技 id → skill/{id}.png */
  skillId?: string;
  /** 被动图标 id → skill/{iconId}.png（如 passive_ruiyan） */
  iconId?: string;
  size: number;
  /** true：图标打底灰显，再叠白色锁 */
  locked?: boolean;
  /** 无贴图时的占位底色 */
  fallbackFill?: number;
  /** 无贴图时中心字（通常取技能名首字） */
  fallbackGlyph?: string;
}

/** 简易白色挂锁（叠在灰显图标中央） */
function drawLockBadge(size: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const s = size * 0.22;
  // 锁体
  g.beginFill(0xffffff, 0.95);
  g.drawRoundedRect(-s * 0.85, -s * 0.15, s * 1.7, s * 1.35, s * 0.22);
  g.endFill();
  // 锁梁
  g.lineStyle(Math.max(3, s * 0.35), 0xffffff, 0.95);
  g.moveTo(-s * 0.55, -s * 0.1);
  g.quadraticCurveTo(-s * 0.55, -s * 1.15, 0, -s * 1.15);
  g.quadraticCurveTo(s * 0.55, -s * 1.15, s * 0.55, -s * 0.1);
  g.lineStyle(0);
  // 钥匙孔
  g.beginFill(0x5a5a5a, 0.85);
  g.drawCircle(0, s * 0.25, s * 0.22);
  g.drawRect(-s * 0.12, s * 0.25, s * 0.24, s * 0.45);
  g.endFill();
  return g;
}

export function makeSkillIcon(opts: SkillIconOpts): PIXI.Container {
  const { size, locked } = opts;
  const c = new PIXI.Container();
  const path = opts.iconId
    ? passiveIconImage(opts.iconId)
    : (opts.skillId ? skillIconImage(opts.skillId) : null);
  const tex = path ? TextureCache.get(path) : null;

  if (tex) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    const s = size / Math.max(tex.width, tex.height);
    sp.scale.set(s);
    if (locked) {
      sp.tint = 0x7a7a7a;
      sp.alpha = 0.72;
    }
    c.addChild(sp);
  } else {
    const g = new PIXI.Graphics();
    g.beginFill(opts.fallbackFill ?? (locked ? 0x8a8a8a : COLORS.panelBgAlt), 1);
    g.lineStyle(3, locked ? 0xb0b0b0 : COLORS.panelBorder, 1);
    g.drawCircle(0, 0, size / 2);
    g.endFill();
    if (locked) g.alpha = 0.75;
    c.addChild(g);
    if (opts.fallbackGlyph && !locked) {
      const glyph = makeText(opts.fallbackGlyph.slice(0, 1), {
        size: Math.round(size * 0.38), fill: COLORS.textMain, bold: true, anchor: 0.5,
      });
      c.addChild(glyph);
    } else if (opts.fallbackGlyph && locked) {
      const glyph = makeText(opts.fallbackGlyph.slice(0, 1), {
        size: Math.round(size * 0.34), fill: 0xd0d0d0, bold: true, anchor: 0.5,
      });
      glyph.alpha = 0.55;
      c.addChild(glyph);
    }
  }

  if (locked) {
    c.addChild(drawLockBadge(size));
  }

  c.hitArea = new PIXI.Circle(0, 0, size / 2);
  return c;
}
