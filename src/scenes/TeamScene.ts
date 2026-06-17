/**
 * 编队场景：上阵 5 槽 + 宠物列表（Demo 全解锁）+ 队伍三维预览 + 属性覆盖提示
 *
 * 点击列表宠物 = 上阵/下阵切换，改动即时存档。
 * 每次 onEnter 全量重建，保证与 PlayerData 一致。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { ELEMENTS } from '@/balance/combat';
import {
  PETS, PET_MAP, TEAM_SIZE, DEMO_TEAM_LEVEL, DEMO_TEAM_STAR,
  PET_ROLE_NAME, type PetDef,
} from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { teamMaxHp, teamAtk, teamRcv, teamElements, type TeamMember } from '@/formulas/team';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { skillForPet } from '@/game/battle/SkillEngine';
import { petImage } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';

export class TeamScene implements Scene {
  readonly name = 'team';
  readonly container = new PIXI.Container();

  /** 上阵槽容器（重建用） */
  private _slotArea = new PIXI.Container();
  /** 列表项勾选标记：petId → 标记节点 */
  private _listChecks = new Map<string, PIXI.Container>();
  private _statsText!: PIXI.Text;
  private _coverageText!: PIXI.Text;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._build();
  }

  onExit(): void {
    this._listChecks.clear();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._slotArea = new PIXI.Container();
  }

  // ════════════ 构建 ════════════

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1126);
    bg.drawRect(0, 0, w, h);
    bg.endFill();
    this.container.addChild(bg);

    // 顶栏
    const backBtn = this._makeButton('返回', 130, 56, 0x4a3a72, () => {
      SceneManager.switchTo('title');
    });
    backBtn.position.set(85, Game.safeTop + 30);
    this.container.addChild(backBtn);

    const title = new PIXI.Text('编队', { fontSize: 40, fill: 0xffe9a6, fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(w / 2, Game.safeTop + 30);
    this.container.addChild(title);

    // 上阵槽区
    this._slotArea = new PIXI.Container();
    this.container.addChild(this._slotArea);

    // 队伍三维预览 + 属性覆盖提示
    this._statsText = new PIXI.Text('', { fontSize: 26, fill: 0xd9cdf5, fontWeight: 'bold' });
    this._statsText.anchor.set(0.5);
    this._statsText.position.set(w / 2, Game.safeTop + 250);
    this.container.addChild(this._statsText);

    this._coverageText = new PIXI.Text('', { fontSize: 22, fill: 0xff9142 });
    this._coverageText.anchor.set(0.5);
    this._coverageText.position.set(w / 2, Game.safeTop + 290);
    this.container.addChild(this._coverageText);

    this._buildPetList(Game.safeTop + 340);
    this._refreshTeamUi();
  }

  /** 宠物列表：2 列网格，每项 = 头像 + 名字/角色/技能名 + 上阵勾 */
  private _buildPetList(startY: number): void {
    const w = Game.logicWidth;
    const cols = 2;
    const itemW = 330;
    const itemH = 130;
    const gapX = 30;
    const gapY = 22;
    const gridW = cols * itemW + (cols - 1) * gapX;
    const startX = (w - gridW) / 2 + itemW / 2;

    PETS.forEach((pet, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new PIXI.Container();
      item.position.set(startX + col * (itemW + gapX), startY + row * (itemH + gapY) + itemH / 2);

      const bg = new PIXI.Graphics();
      bg.beginFill(0x2e2148);
      bg.lineStyle(3, ORB_COLOR[pet.element]);
      bg.drawRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 18);
      bg.endFill();
      item.addChild(bg);

      // 头像
      const tex = TextureCache.get(petImage(pet.id));
      if (tex) {
        const avatar = new PIXI.Sprite(tex);
        avatar.anchor.set(0.5);
        const size = itemH - 26;
        avatar.scale.set(size / Math.max(avatar.width, avatar.height));
        avatar.position.set(-itemW / 2 + 70, 0);
        item.addChild(avatar);
      }

      // 稀有度标 + 名字 + 属性/角色 + 三维 + 技能名
      const textX = -itemW / 2 + 132;
      const rarityDef = getRarity(pet.rarity);
      const rarityText = new PIXI.Text(rarityDef.code, {
        fontSize: 20, fill: rarityDef.color, fontWeight: 'bold',
      });
      rarityText.anchor.set(0, 0.5);
      rarityText.position.set(textX, -44);
      item.addChild(rarityText);

      const nameText = new PIXI.Text(pet.name, {
        fontSize: 26, fill: 0xffffff, fontWeight: 'bold',
      });
      nameText.anchor.set(0, 0.5);
      nameText.position.set(textX + rarityText.width + 10, -44);
      item.addChild(nameText);

      const roleText = new PIXI.Text(
        `${ELEMENT_NAME[pet.element]} · ${PET_ROLE_NAME[pet.role]}`,
        { fontSize: 20, fill: ORB_COLOR[pet.element] },
      );
      roleText.anchor.set(0, 0.5);
      roleText.position.set(textX, -16);
      item.addChild(roleText);

      const lv = DEMO_TEAM_LEVEL;
      const star = DEMO_TEAM_STAR;
      const statsText = new PIXI.Text(
        `攻${petAtk(pet, lv, star)} 血${petHp(pet, lv, star)} 复${petRcv(pet, lv, star)}`,
        { fontSize: 19, fill: 0xc7b8ee, fontWeight: 'bold' },
      );
      statsText.anchor.set(0, 0.5);
      statsText.position.set(textX, 12);
      item.addChild(statsText);

      const skillText = new PIXI.Text(`技 ${skillForPet(pet, DEMO_TEAM_STAR).name}`, {
        fontSize: 19, fill: 0x9b8cc4,
      });
      skillText.anchor.set(0, 0.5);
      skillText.position.set(textX, 40);
      item.addChild(skillText);

      // 上阵勾标记
      const check = new PIXI.Container();
      const checkBg = new PIXI.Graphics();
      checkBg.beginFill(0x6fd86a);
      checkBg.drawCircle(0, 0, 18);
      checkBg.endFill();
      check.addChild(checkBg);
      const checkMark = new PIXI.Text('上', { fontSize: 20, fill: 0x1a1126, fontWeight: 'bold' });
      checkMark.anchor.set(0.5);
      check.addChild(checkMark);
      check.position.set(itemW / 2 - 26, -itemH / 2 + 26);
      item.addChild(check);
      this._listChecks.set(pet.id, check);

      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.on('pointertap', () => this._togglePet(pet.id));

      this.container.addChild(item);
    });
  }

  // ════════════ 交互 ════════════

  private _togglePet(petId: string): void {
    if (PlayerData.isInTeam(petId)) {
      if (!PlayerData.removeFromTeam(petId)) {
        Platform.showToast('至少保留 1 只灵宠');
        return;
      }
    } else if (!PlayerData.addToTeam(petId)) {
      Platform.showToast(`最多上阵 ${TEAM_SIZE} 只`);
      return;
    }
    Platform.vibrateShort('light');
    this._refreshTeamUi();
  }

  /** 重建上阵槽 + 三维预览 + 覆盖提示 + 列表勾选 */
  private _refreshTeamUi(): void {
    const w = Game.logicWidth;
    this._slotArea.removeChildren().forEach((c) => c.destroy({ children: true }));

    const slotSize = 116;
    const gap = 14;
    const totalW = TEAM_SIZE * slotSize + (TEAM_SIZE - 1) * gap;
    const startX = (w - totalW) / 2 + slotSize / 2;
    const y = Game.safeTop + 150;

    const team = PlayerData.team;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const slot = new PIXI.Container();
      slot.position.set(startX + i * (slotSize + gap), y);
      const petId = team[i];
      const pet = petId ? PET_MAP.get(petId) : undefined;

      const frame = new PIXI.Graphics();
      frame.beginFill(0x241a38);
      frame.lineStyle(4, pet ? ORB_COLOR[pet.element] : 0x3a2d58);
      frame.drawRoundedRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 16);
      frame.endFill();
      slot.addChild(frame);

      if (pet) {
        const tex = TextureCache.get(petImage(pet.id));
        if (tex) {
          const avatar = new PIXI.Sprite(tex);
          avatar.anchor.set(0.5);
          avatar.scale.set((slotSize - 14) / Math.max(avatar.width, avatar.height));
          slot.addChild(avatar);
        }
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        slot.on('pointertap', () => this._togglePet(pet.id));
      } else {
        const plus = new PIXI.Text('+', { fontSize: 48, fill: 0x5a4a82 });
        plus.anchor.set(0.5);
        slot.addChild(plus);
      }
      this._slotArea.addChild(slot);
    }

    // 三维预览
    const members: TeamMember[] = team
      .map((id) => PET_MAP.get(id))
      .filter((def): def is PetDef => !!def)
      .map((def) => ({ def, level: DEMO_TEAM_LEVEL, star: DEMO_TEAM_STAR }));
    this._statsText.text =
      `生命 ${teamMaxHp(members)}   攻击 ${teamAtk(members)}   回复 ${teamRcv(members)}`;

    // 属性覆盖提示
    const covered = teamElements(members);
    const missing = ELEMENTS.filter((e) => !covered.has(e));
    this._coverageText.text = missing.length === 0
      ? '五行全覆盖，所有属性珠均有效'
      : `未覆盖：${missing.map((e) => ELEMENT_NAME[e]).join('、')}（对应珠子无伤害）`;
    this._coverageText.style.fill = missing.length === 0 ? 0x6fd86a : 0xff9142;

    // 列表勾选
    for (const [petId, check] of this._listChecks) {
      check.visible = PlayerData.isInTeam(petId);
    }
  }

  // ════════════ 工具 ════════════

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
