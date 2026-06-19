/**
 * 图鉴场景：全灵宠收录进度 + 里程碑发奖（收集驱动留存）
 *
 * 遵循「永远留缺口」：未拥有灵宠以暗格 + ??? 呈现，制造收集目标。
 * 里程碑达成可领灵宠币奖励，已领取持久化到 PlayerData。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { PETS } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { petImage } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';

/** 收录里程碑（阈值 → 灵宠币奖励） */
const CODEX_MILESTONES: readonly { threshold: number; coins: number }[] = [
  { threshold: 3, coins: 100 },
  { threshold: 6, coins: 300 },
  { threshold: PETS.length, coins: 800 },
];

export class CodexScene implements Scene {
  readonly name = 'codex';
  readonly container = new PIXI.Container();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
  }

  onExit(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1126);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    const backBtn = this._makeButton('返回', 130, 56, 0x4a3a72, () => SceneManager.switchTo('title'));
    backBtn.position.set(85, Game.safeTop + 30);
    this.container.addChild(backBtn);

    const title = new PIXI.Text('灵宠图鉴', { fontSize: 40, fill: 0xffe9a6, fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(w / 2, Game.safeTop + 30);
    this.container.addChild(title);

    const count = PlayerData.codexCount;
    const progress = new PIXI.Text(`已收录 ${count} / ${PETS.length}`, {
      fontSize: 28, fill: 0xffd75e, fontWeight: 'bold',
    });
    progress.anchor.set(0.5);
    progress.position.set(w / 2, Game.safeTop + 90);
    this.container.addChild(progress);

    this._buildMilestones(w, Game.safeTop + 130);
    this._buildGrid(w, Game.safeTop + 230);
  }

  /** 里程碑行：达成可领，已领灰显 */
  private _buildMilestones(w: number, y: number): void {
    const count = PlayerData.codexCount;
    const slotW = 200;
    const gap = 20;
    const totalW = CODEX_MILESTONES.length * slotW + (CODEX_MILESTONES.length - 1) * gap;
    const startX = (w - totalW) / 2 + slotW / 2;

    CODEX_MILESTONES.forEach((m, i) => {
      const claimed = PlayerData.isCodexClaimed(m.threshold);
      const reached = count >= m.threshold;
      const canClaim = reached && !claimed;

      const cont = new PIXI.Container();
      cont.position.set(startX + i * (slotW + gap), y);

      const box = new PIXI.Graphics();
      box.beginFill(claimed ? 0x2a2438 : canClaim ? 0x3a7a4a : 0x2e2148);
      box.lineStyle(2, canClaim ? 0x6fd86a : 0x4a3a72);
      box.drawRoundedRect(-slotW / 2, -34, slotW, 68, 14);
      box.endFill();
      cont.addChild(box);

      const label = new PIXI.Text(
        `收录${m.threshold}\n+${m.coins}币${claimed ? '（已领）' : ''}`,
        { fontSize: 20, fill: claimed ? 0x6a5d8a : 0xffffff, align: 'center', fontWeight: 'bold' },
      );
      label.anchor.set(0.5);
      cont.addChild(label);

      if (canClaim) {
        cont.eventMode = 'static';
        cont.cursor = 'pointer';
        cont.on('pointertap', () => {
          if (PlayerData.claimCodexMilestone(m.threshold, m.coins)) {
            Platform.vibrateShort('medium');
            Platform.showToast(`领取 ${m.coins} 灵宠币`);
            this._build();
          }
        });
      }
      this.container.addChild(cont);
    });
  }

  /** 灵宠网格：拥有显示，未拥有暗格 + ??? */
  private _buildGrid(w: number, startY: number): void {
    const cols = 3;
    const itemW = 200;
    const itemH = 200;
    const gapX = 20;
    const gapY = 20;
    const gridW = cols * itemW + (cols - 1) * gapX;
    const startX = (w - gridW) / 2 + itemW / 2;

    PETS.forEach((pet, i) => {
      const owned = PlayerData.isOwned(pet.id);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new PIXI.Container();
      item.position.set(startX + col * (itemW + gapX), startY + row * (itemH + gapY) + itemH / 2);

      const rarityDef = getRarity(pet.rarity);
      const box = new PIXI.Graphics();
      box.beginFill(owned ? 0x2e2148 : 0x201830);
      box.lineStyle(3, owned ? rarityDef.color : 0x3a2d58);
      box.drawRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 16);
      box.endFill();
      item.addChild(box);

      if (owned) {
        const tex = TextureCache.get(petImage(pet.id));
        if (tex) {
          const avatar = new PIXI.Sprite(tex);
          avatar.anchor.set(0.5);
          avatar.scale.set(120 / Math.max(avatar.width, avatar.height));
          avatar.position.set(0, -26);
          item.addChild(avatar);
        }
        const name = new PIXI.Text(pet.name, { fontSize: 22, fill: 0xffffff, fontWeight: 'bold' });
        name.anchor.set(0.5);
        name.position.set(0, 56);
        item.addChild(name);
        const sub = new PIXI.Text(`${rarityDef.code} · ${ELEMENT_NAME[pet.element]}`, {
          fontSize: 18, fill: ORB_COLOR[pet.element],
        });
        sub.anchor.set(0.5);
        sub.position.set(0, 82);
        item.addChild(sub);
      } else {
        const q = new PIXI.Text('?', { fontSize: 80, fill: 0x4a3a72, fontWeight: 'bold' });
        q.anchor.set(0.5);
        q.position.set(0, -16);
        item.addChild(q);
        const locked = new PIXI.Text('未收录', { fontSize: 22, fill: 0x6a5d8a });
        locked.anchor.set(0.5);
        locked.position.set(0, 68);
        item.addChild(locked);
      }
      this.container.addChild(item);
    });
  }

  private _makeButton(
    label: string, width: number, height: number, color: number, onTap: () => void,
  ): PIXI.Container {
    const btn = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(color);
    bg.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    bg.endFill();
    btn.addChild(bg);
    const text = new PIXI.Text(label, {
      fontSize: Math.floor(height * 0.45), fill: 0xffffff, fontWeight: 'bold',
    });
    text.anchor.set(0.5);
    btn.addChild(text);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onTap);
    return btn;
  }
}
