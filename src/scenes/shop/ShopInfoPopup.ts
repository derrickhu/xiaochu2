/**
 * 商店轻量说明浮层
 * 严格对齐 game_assets/.../prototypes/ui/shop_pet_info_popup_mock.png：
 * 浅奶油双线金框、大立绘顶区、主动技左对齐、奶油「知道了」。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UI_IMAGES, petShowcaseLoadPaths } from '@/config/Assets';
import { ELEMENT_NAME } from '@/balance/ui';
import { PET_ROLE_NAME, type PetDef } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { ECONOMY } from '@/balance/economy';
import { PlayerData } from '@/game/PlayerData';
import { resolvePetAbilities } from '@/game/petAbilities';
import {
  FONT_SIZE,
  bindLazySprite, makeActionButton, makeBodyText, makePanel, makeText, makeTitleText,
} from '@/ui';
import { ensureAssets } from '@/config/Subpackages';
import { warmupCustomFonts } from '@/core/FontService';

/** 从 mock 采样：底 #f8f0e0 · 墨 #4a3121 · 金框 #c9a06a */
const MOCK = {
  parchment: 0xf8f0e0,
  parchmentDeep: 0xf3e8d4,
  ink: 0x4a3121,
  inkMuted: 0x8a7358,
  status: 0xb37a4c,
  goldOuter: 0xd4af7a,
  goldInner: 0xb8925a,
  goldLine: 0xc9a06a,
  tagWater: { bg: 0x5a9fd4, border: 0x3a7ab0 },
  tagRole: { bg: 0x5eb89a, border: 0x3d9078 },
  cdBg: 0xefe0c4,
  cdBorder: 0xc4a574,
} as const;

const PANEL_W = 560;
const PANEL_H = 640;
const PAD = 40;
const HERO_W = 220;
const HERO_H = 248;

function makeTagChip(label: string, bg: number, border: number, inkWhite = true): PIXI.Container {
  const h = 28;
  const w = Math.max(40, Math.ceil(label.length * 16 + 18));
  const root = new PIXI.Container();
  root.addChild(makePanel({
    width: w, height: h, radius: 7, centered: false,
    bg, bgAlpha: 1, border, borderWidth: 1.5,
  }));
  const t = makeText(label, {
    size: FONT_SIZE.xxs,
    fill: inkWhite ? 0xffffff : MOCK.ink,
    bold: true,
    anchor: 0.5,
  });
  t.position.set(w / 2, h / 2);
  root.addChild(t);
  (root as PIXI.Container & { pillW: number }).pillW = w;
  return root;
}

function makeDiamondDivider(width: number): PIXI.Container {
  const root = new PIXI.Container();
  const g = new PIXI.Graphics();
  const half = width / 2;
  g.lineStyle(1.5, MOCK.goldLine, 0.95);
  g.moveTo(-half, 0);
  g.lineTo(-12, 0);
  g.moveTo(12, 0);
  g.lineTo(half, 0);
  g.beginFill(MOCK.parchment, 1);
  g.lineStyle(1.5, MOCK.goldLine, 1);
  g.drawPolygon([0, -6, 7, 0, 0, 6, -7, 0]);
  g.endFill();
  root.addChild(g);
  return root;
}

/** mock 双线金边奶油底板 + 角花 */
function makeMockPanelFrame(w: number, h: number): PIXI.Container {
  const root = new PIXI.Container();
  const r = 26;

  const fill = new PIXI.Graphics();
  fill.beginFill(MOCK.parchment, 1);
  fill.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  fill.endFill();
  // 轻微径向感：中心略亮
  fill.beginFill(0xffffff, 0.14);
  fill.drawEllipse(0, -h * 0.08, w * 0.38, h * 0.28);
  fill.endFill();
  root.addChild(fill);

  const border = new PIXI.Graphics();
  border.lineStyle(3.5, MOCK.goldOuter, 1);
  border.drawRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r - 2);
  border.lineStyle(1.5, MOCK.goldInner, 0.95);
  border.drawRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, r - 6);
  root.addChild(border);

  // 四角卷云（简化）
  const ornament = (ox: number, oy: number, sx: number, sy: number) => {
    const g = new PIXI.Graphics();
    g.lineStyle(2, MOCK.goldOuter, 0.9);
    g.moveTo(ox, oy + 22 * sy);
    g.quadraticCurveTo(ox + 2 * sx, oy + 2 * sy, ox + 22 * sx, oy);
    g.moveTo(ox + 6 * sx, oy + 18 * sy);
    g.quadraticCurveTo(ox + 14 * sx, oy + 14 * sy, ox + 18 * sx, oy + 6 * sy);
    root.addChild(g);
  };
  const ix = w / 2 - 18;
  const iy = h / 2 - 18;
  ornament(-ix, -iy, 1, 1);
  ornament(ix, -iy, -1, 1);
  ornament(-ix, iy, 1, -1);
  ornament(ix, iy, -1, -1);

  return root;
}

export class ShopInfoPopup extends PIXI.Container {
  private _dim: PIXI.Graphics | null = null;
  private _panel: PIXI.Container | null = null;
  private _open = false;
  private _unbindArt: (() => void) | null = null;

  constructor() {
    super();
    this.visible = false;
    this.alpha = 0;
    this.eventMode = 'static';
  }

  get isOpen(): boolean {
    return this._open;
  }

  openPet(pet: PetDef): void {
    // 壳层先出；立绘走 bindLazySprite（ensure+CDN 到货刷新），避免真机空窗
    void Promise.all([
      ensureAssets([UI_IMAGES.btnPlateCream]),
      warmupCustomFonts(),
    ]).finally(() => {
      this._show(() => this._buildPetBody(pet));
    });
  }

  openUniversal(): void {
    void Promise.all([
      ensureAssets([UI_IMAGES.iconShard, UI_IMAGES.btnPlateCream]),
      warmupCustomFonts(),
    ]).finally(() => {
      this._show(() => this._buildUniversalBody());
    });
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => {
        this.visible = false;
        this._clearBody();
      },
    });
  }

  closeImmediate(): void {
    this._open = false;
    this.visible = false;
    this.alpha = 0;
    this._clearBody();
  }

  private _show(build: () => void): void {
    this._clearBody();
    this._buildShell();
    build();
    this._open = true;
    this.visible = true;
    this.alpha = 0;
    TweenManager.to({
      target: this,
      props: { alpha: 1 },
      duration: 0.2,
      ease: Ease.easeOutQuad,
    });
    if (this._panel) {
      this._panel.scale.set(0.94);
      TweenManager.to({
        target: this._panel.scale,
        props: { x: 1, y: 1 },
        duration: 0.22,
        ease: Ease.easeOutBack,
      });
    }
  }

  private _clearBody(): void {
    this._unbindArt?.();
    this._unbindArt = null;
    this.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
    this._dim = null;
    this._panel = null;
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._dim = new PIXI.Graphics();
    this._dim.beginFill(0x1a1410, 0.58);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._panel = new PIXI.Container();
    this._panel.position.set(w / 2, h / 2 - 8);
    this._panel.eventMode = 'static';
    this._panel.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._panel);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.22);
    shadow.drawRoundedRect(-PANEL_W / 2 + 8, -PANEL_H / 2 + 14, PANEL_W, PANEL_H, 26);
    shadow.endFill();
    this._panel.addChild(shadow);
    this._panel.addChild(makeMockPanelFrame(PANEL_W, PANEL_H));
  }

  private _leftX(): number {
    return -PANEL_W / 2 + PAD;
  }

  private _buildPetBody(pet: PetDef): void {
    if (!this._panel) return;
    const panel = this._panel;
    const top = -PANEL_H / 2;
    const owned = PlayerData.isOwned(pet.id);
    const shards = PlayerData.petShards(pet.id);
    const level = owned ? PlayerData.petLevel(pet.id) : 1;
    const star = owned ? PlayerData.petStar(pet.id) : 1;
    const abilities = resolvePetAbilities(pet, { level, star });
    const skill = abilities.active.skill;
    const rar = getRarity(pet.rarity);

    // ── 顶区：大立绘左 + 名/标签右（对齐 mock）──
    const heroTop = top + 36;
    const heroCx = this._leftX() + HERO_W / 2;
    const heroCy = heroTop + HERO_H / 2;

    // 顶区淡山雾底（mock 上半有水墨远山）
    const wash = new PIXI.Graphics();
    wash.beginFill(0xdde8e4, 0.35);
    wash.drawRoundedRect(-PANEL_W / 2 + 16, top + 16, PANEL_W - 32, HERO_H + 28, 18);
    wash.endFill();
    panel.addChild(wash);

    const heroHost = new PIXI.Container();
    heroHost.position.set(heroCx, heroCy);
    panel.addChild(heroHost);
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(-HERO_W / 2, -HERO_H / 2, HERO_W, HERO_H, 16);
    mask.endFill();
    heroHost.addChild(mask);
    heroHost.mask = mask;

    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5);
    heroHost.addChild(spr);
    this._unbindArt = bindLazySprite(spr, {
      path: petShowcaseLoadPaths(pet.id, star),
      ensure: true,
      onApplied: (tex) => {
        const s = Math.max(HERO_W / tex.width, HERO_H / tex.height) * 0.98;
        spr.scale.set(s);
      },
    });

    const infoX = this._leftX() + HERO_W + 20;
    const name = makeTitleText(pet.name, {
      size: 44, fill: MOCK.ink, anchor: [0, 0.5],
    });
    name.position.set(infoX, heroCy - 36);
    panel.addChild(name);

    const pills = new PIXI.Container();
    const rarityPill = makeTagChip(rar.code, rar.ui.badgeBg, rar.ui.badgeBorder);
    const elemPill = makeTagChip(ELEMENT_NAME[pet.element], MOCK.tagWater.bg, MOCK.tagWater.border);
    const rolePill = makeTagChip(PET_ROLE_NAME[pet.role], MOCK.tagRole.bg, MOCK.tagRole.border);
    let px = 0;
    for (const p of [rarityPill, elemPill, rolePill]) {
      p.position.set(px, 0);
      pills.addChild(p);
      px += (p as PIXI.Container & { pillW: number }).pillW + 8;
    }
    pills.position.set(infoX, heroCy + 22);
    panel.addChild(pills);

    // ── 分隔 ──
    const divY = heroTop + HERO_H + 28;
    const divider = makeDiamondDivider(PANEL_W - PAD * 2);
    divider.position.set(0, divY);
    panel.addChild(divider);

    // ── 技能区：全部左对齐（mock 关键差异）──
    const contentW = PANEL_W - PAD * 2;
    const left = this._leftX();

    const section = makeBodyText('主动技能', {
      size: 26, fill: MOCK.ink, bold: true, anchor: [0, 0.5],
    });
    section.position.set(left, divY + 34);
    panel.addChild(section);

    const skillName = makeTitleText(skill.name, {
      size: 30, fill: MOCK.ink, anchor: [0, 0.5],
    });
    skillName.position.set(left, section.y + 40);
    panel.addChild(skillName);

    const cdPill = makeTagChip(`CD ${skill.cd}`, MOCK.cdBg, MOCK.cdBorder, false);
    cdPill.position.set(left + skillName.width + 12, skillName.y - 14);
    panel.addChild(cdPill);

    const desc = makeBodyText(skill.desc, {
      size: 22, fill: MOCK.ink, anchor: [0, 0],
      wordWrapWidth: contentW, align: 'left',
    });
    desc.position.set(left, skillName.y + 28);
    panel.addChild(desc);

    const starNeed = owned ? PlayerData.starUpCost(pet.id) : null;
    const shardLine = starNeed === null
      ? (owned ? `当前碎片 ${shards} · 已满星` : `当前碎片 ${shards} · 未拥有`)
      : `当前碎片 ${shards}/${starNeed} · 升星所需`;
    const status = makeText(shardLine, {
      size: FONT_SIZE.xs, fill: MOCK.status, bold: true, anchor: 0.5,
    });
    status.position.set(0, PANEL_H / 2 - 118);
    panel.addChild(status);

    this._addGotItButton(panel);
  }

  private _buildUniversalBody(): void {
    if (!this._panel) return;
    const panel = this._panel;
    const top = -PANEL_H / 2;
    const rate = ECONOMY.universal.exchangeRate;
    const left = this._leftX();
    const contentW = PANEL_W - PAD * 2;

    const iconSize = 128;
    const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
    icon.anchor.set(0.5);
    icon.position.set(0, top + 56 + iconSize / 2);
    panel.addChild(icon);
    this._unbindArt = bindLazySprite(icon, {
      path: UI_IMAGES.iconShard,
      ensure: true,
      onApplied: (tex) => {
        icon.scale.set(iconSize / Math.max(tex.width, tex.height));
      },
    });

    const name = makeTitleText('通用碎片', {
      size: 44, fill: MOCK.ink, anchor: 0.5,
    });
    name.position.set(0, top + 56 + iconSize + 32);
    panel.addChild(name);

    const divY = name.y + 36;
    const divider = makeDiamondDivider(PANEL_W - PAD * 2);
    divider.position.set(0, divY);
    panel.addChild(divider);

    const section = makeBodyText('用途说明', {
      size: 26, fill: MOCK.ink, bold: true, anchor: [0, 0.5],
    });
    section.position.set(left, divY + 34);
    panel.addChild(section);

    const desc = makeBodyText(
      `升星时可折算为任意已拥有灵宠的本体碎片。\n`
      + `折算阶梯：R/SR ×${rate[1]} · SSR ×${rate[3]} · UR ×${rate[4]}`,
      {
        size: 22, fill: MOCK.ink, anchor: [0, 0],
        wordWrapWidth: contentW, align: 'left',
      },
    );
    desc.position.set(left, section.y + 28);
    panel.addChild(desc);

    const status = makeText(
      `当前持有 ${PlayerData.universalShards}`,
      {
        size: FONT_SIZE.xs, fill: MOCK.status, bold: true, anchor: 0.5,
      },
    );
    status.position.set(0, PANEL_H / 2 - 118);
    panel.addChild(status);

    this._addGotItButton(panel);
  }

  private _addGotItButton(panel: PIXI.Container): void {
    const btn = makeActionButton({
      title: '知道了',
      width: 320,
      height: 70,
      variant: 'cream',
      fontSize: 34,
      onTap: () => this.close(),
    });
    btn.position.set(0, PANEL_H / 2 - 56);
    panel.addChild(btn);
  }
}
