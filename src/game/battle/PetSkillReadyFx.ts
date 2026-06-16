/**
 * 宠物技能就绪提示（对齐 xiao_chu battleTeamBarView 光弧/粒子/箭头方案）
 *
 * 性能：Graphics 仅在创建时绘制一次，运行时只改 transform / alpha，不做 clear/redraw。
 */
import * as PIXI from 'pixi.js';

const FLASH_DURATION = 0.25;

export interface PetSkillReadyFxView {
  root: PIXI.Container;
  flash: PIXI.Graphics;
  ring: PIXI.Container;
  arrowBox: PIXI.Container;
  labelBox: PIXI.Container;
  particles: Array<{ core: PIXI.Sprite; glow: PIXI.Sprite }>;
  /** 上升粒子相位偏移 */
  particlePhase: number[];
  flashT: number;
  animT: number;
}

function drawTriangle(size: number, color: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(color);
  g.moveTo(0, 0);
  g.lineTo(-size * 0.7, size * 0.7);
  g.lineTo(size * 0.7, size * 0.7);
  g.closePath();
  g.endFill();
  return g;
}

/** 创建单个宠物槽的就绪动效层（默认隐藏） */
export function createPetSkillReadyFx(petSize: number, color: number): PetSkillReadyFxView {
  const root = new PIXI.Container();
  root.visible = false;

  const flash = new PIXI.Graphics();
  flash.beginFill(color, 0.55);
  flash.drawCircle(0, 0, petSize * 0.7);
  flash.endFill();
  flash.visible = false;
  root.addChild(flash);

  const ring = new PIXI.Container();
  const ringR = petSize * 0.58;
  for (let a = 0; a < 4; a++) {
    const seg = new PIXI.Graphics();
    seg.lineStyle(2.5, color, 0.85);
    const startA = a * Math.PI * 0.5;
    seg.arc(0, 0, ringR, startA, startA + Math.PI * 0.3);
    ring.addChild(seg);
  }
  root.addChild(ring);

  const particles: Array<{ core: PIXI.Sprite; glow: PIXI.Sprite }> = [];
  for (let pi = 0; pi < 4; pi++) {
    const glow = new PIXI.Sprite(PIXI.Texture.WHITE);
    glow.anchor.set(0.5);
    glow.tint = color;
    const core = new PIXI.Sprite(PIXI.Texture.WHITE);
    core.anchor.set(0.5);
    root.addChild(glow);
    root.addChild(core);
    particles.push({ core, glow });
  }

  const arrowSize = petSize * 0.26;
  const arrowBox = new PIXI.Container();
  const arrow1 = drawTriangle(arrowSize, color);
  const arrow2 = drawTriangle(arrowSize * 0.5, color);
  arrow2.y = -arrowSize * 0.5;
  arrow2.alpha = 0.55;
  arrowBox.addChild(arrow1);
  arrowBox.addChild(arrow2);
  const whiteCore = drawTriangle(arrowSize * 0.8, 0xffffff);
  whiteCore.y = arrowSize * 0.15;
  whiteCore.alpha = 0.9;
  arrowBox.addChild(whiteCore);
  arrowBox.y = -petSize / 2 - arrowSize - 3;
  root.addChild(arrowBox);

  const lblW = petSize * 0.7;
  const lblH = petSize * 0.2;
  const labelBox = new PIXI.Container();
  const lblBg = new PIXI.Graphics();
  lblBg.beginFill(color, 0.85);
  lblBg.drawRoundedRect(-lblW / 2, 0, lblW, lblH, 3);
  lblBg.endFill();
  labelBox.addChild(lblBg);
  const lblText = new PIXI.Text('▲技能', {
    fontSize: Math.round(petSize * 0.13),
    fill: 0xffffff,
    fontWeight: 'bold',
  });
  lblText.anchor.set(0.5);
  lblText.position.set(0, lblH / 2);
  labelBox.addChild(lblText);
  labelBox.y = petSize / 2 + 2;
  root.addChild(labelBox);

  return {
    root,
    flash,
    ring,
    arrowBox,
    labelBox,
    particles,
    particlePhase: [0, 0.25, 0.5, 0.75],
    flashT: 0,
    animT: 0,
  };
}

export function triggerPetSkillReadyFlash(fx: PetSkillReadyFxView): void {
  fx.flashT = FLASH_DURATION;
}

/** 每帧更新；canInteract=false 时隐藏（CD / 上滑中） */
export function updatePetSkillReadyFx(
  fx: PetSkillReadyFxView,
  dt: number,
  petSize: number,
  canAct: boolean,
  canInteract: boolean,
  slotScale?: PIXI.ObservablePoint,
): void {
  if (!canInteract) {
    fx.root.visible = false;
    return;
  }

  fx.root.visible = true;
  fx.animT += dt;
  const t = fx.animT * 4.8;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
  const half = petSize / 2;

  fx.ring.rotation += dt * 1.8;
  fx.ring.alpha = canAct ? 0.6 + pulse * 0.3 : 0.4;

  if (canAct) {
    fx.particles.forEach((p, pi) => {
      const phase = (fx.animT * 2.4 + fx.particlePhase[pi]) % 1;
      const px = -half + petSize * (0.15 + pi * 0.23);
      const py = half - phase * petSize;
      const pAlpha = phase < 0.7 ? 1 : (1 - phase) / 0.3;
      const dot = 2 + pulse * 1.5;
      p.core.position.set(px, py);
      p.glow.position.set(px, py);
      p.core.alpha = pAlpha * 0.8;
      p.glow.alpha = pAlpha * 0.5;
      p.core.width = p.core.height = dot * 2;
      p.glow.width = p.glow.height = dot * 3.6;
      p.core.visible = true;
      p.glow.visible = true;
    });
  } else {
    fx.particles.forEach((p) => {
      p.core.visible = false;
      p.glow.visible = false;
    });
  }

  const arrowSize = petSize * 0.26;
  const bounce = canAct ? Math.sin(t * 1.5) * 4 : 0;
  fx.arrowBox.y = -half - arrowSize - 3 - bounce;
  fx.arrowBox.alpha = canAct ? 0.7 + pulse * 0.3 : 0.5;
  fx.labelBox.alpha = canAct ? 0.85 + pulse * 0.15 : 0.5;

  if (canAct && slotScale) {
    slotScale.set(1 + pulse * 0.02);
  }

  if (fx.flashT > 0) {
    fx.flashT = Math.max(0, fx.flashT - dt);
    const rfP = fx.flashT / FLASH_DURATION;
    fx.flash.visible = true;
    fx.flash.alpha = rfP * 0.7;
    fx.flash.scale.set(0.5 + (1 - rfP) * 0.8);
  } else {
    fx.flash.visible = false;
    fx.flash.scale.set(1);
  }
}
