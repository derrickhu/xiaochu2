/**
 * 灵宠详情场景：三维展示 + 升级（消耗经验池）+ 升星（消耗碎片）+ 上阵/下阵
 *
 * 数值与养成进度全部读写 PlayerData，单一真源。每次操作后局部刷新。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { UI, ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import { PET_MAP, PET_ROLE_NAME, type PetDef } from '@/balance/pets';
import { getStarProfile } from '@/balance/growth';
import { getRarity } from '@/balance/rarity';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { skillForPet } from '@/game/battle/SkillEngine';
import { petImage } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';

export interface PetDetailEnterData {
  petId: string;
}

export class PetDetailScene implements Scene {
  readonly name = 'petDetail';
  readonly container = new PIXI.Container();

  private _petId = '';

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    this._petId = (data as PetDetailEnterData | undefined)?.petId ?? PlayerData.ownedPets[0] ?? '';
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

    const pet = PET_MAP.get(this._petId);
    if (!pet) {
      const back = this._makeButton('返回编队', 220, 60, 0x4a3a72, () => SceneManager.switchTo('team'));
      back.position.set(w / 2, h / 2);
      this.container.addChild(back);
      return;
    }

    // 顶栏
    const backBtn = this._makeButton('返回', 130, 56, 0x4a3a72, () => SceneManager.switchTo('team'));
    backBtn.position.set(85, Game.safeTop + 30);
    this.container.addChild(backBtn);

    const lv = PlayerData.petLevel(this._petId);
    const star = PlayerData.petStar(this._petId);
    const rarityDef = getRarity(pet.rarity);

    // 标题：名字 + 稀有度
    const title = new PIXI.Text(`${pet.name}`, { fontSize: 40, fill: 0xffe9a6, fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(w / 2, Game.safeTop + 30);
    this.container.addChild(title);

    // 头像
    const tex = TextureCache.get(petImage(pet.id));
    const avatarY = Game.safeTop + 200;
    if (tex) {
      const avatar = new PIXI.Sprite(tex);
      avatar.anchor.set(0.5);
      avatar.scale.set(220 / Math.max(avatar.width, avatar.height));
      avatar.position.set(w / 2, avatarY);
      this.container.addChild(avatar);
    }

    // 稀有度 / 属性 / 角色 / 等级星级
    const meta = new PIXI.Text(
      `${rarityDef.code} · ${ELEMENT_NAME[pet.element]} · ${PET_ROLE_NAME[pet.role]}`,
      { fontSize: 24, fill: rarityDef.color, fontWeight: 'bold' },
    );
    meta.anchor.set(0.5);
    meta.position.set(w / 2, avatarY + 140);
    this.container.addChild(meta);

    const maxLv = getStarProfile(star).maxLevel;
    const lvStar = new PIXI.Text(`Lv.${lv}/${maxLv}   ${'★'.repeat(star)}${'☆'.repeat(5 - star)}`, {
      fontSize: 28, fill: 0xffd75e, fontWeight: 'bold',
    });
    lvStar.anchor.set(0.5);
    lvStar.position.set(w / 2, avatarY + 180);
    this.container.addChild(lvStar);

    // 三维
    const stats = new PIXI.Text(
      `攻击 ${petAtk(pet, lv, star)}    生命 ${petHp(pet, lv, star)}    回复 ${petRcv(pet, lv, star)}`,
      { fontSize: 26, fill: 0xd9cdf5, fontWeight: 'bold' },
    );
    stats.anchor.set(0.5);
    stats.position.set(w / 2, avatarY + 226);
    this.container.addChild(stats);

    const skillText = new PIXI.Text(`技能：${skillForPet(pet, star).name}`, {
      fontSize: 22, fill: 0x9b8cc4,
    });
    skillText.anchor.set(0.5);
    skillText.position.set(w / 2, avatarY + 264);
    this.container.addChild(skillText);

    // ── 升级 ──
    const lvCost = PlayerData.levelUpCost(this._petId);
    const canLv = PlayerData.canLevelUp(this._petId);
    const lvLabel = lvCost === null
      ? '已满级'
      : `升级  经验 ${PlayerData.exp}/${lvCost}`;
    const lvBtn = this._makeButton(lvLabel, 420, 64, canLv ? 0x3a7a4a : 0x35303f, () => {
      if (PlayerData.levelUp(this._petId)) {
        Platform.vibrateShort('light');
        this._build();
      } else {
        Platform.showToast(lvCost === null ? '已满级' : '经验不足');
      }
    });
    lvBtn.position.set(w / 2, avatarY + 340);
    this.container.addChild(lvBtn);

    // ── 升星 ──
    const starCost = PlayerData.starUpCost(this._petId);
    const canStar = PlayerData.canStarUp(this._petId);
    const shards = PlayerData.petShards(this._petId);
    const starLabel = starCost === null
      ? '已满星'
      : `升星  碎片 ${shards}/${starCost}`;
    const starBtn = this._makeButton(starLabel, 420, 64, canStar ? 0x8c5ad6 : 0x35303f, () => {
      if (PlayerData.starUp(this._petId)) {
        Platform.vibrateShort('medium');
        this._build();
      } else {
        Platform.showToast(starCost === null ? '已满星' : '碎片不足');
      }
    });
    starBtn.position.set(w / 2, avatarY + 420);
    this.container.addChild(starBtn);

    // ── 上阵/下阵 ──
    const inTeam = PlayerData.isInTeam(this._petId);
    const teamBtn = this._makeButton(inTeam ? '下阵' : '上阵', 420, 64, inTeam ? 0x6a4a4a : 0x4a3a72, () => {
      if (inTeam) {
        if (!PlayerData.removeFromTeam(this._petId)) {
          Platform.showToast('至少保留 1 只灵宠');
          return;
        }
      } else if (!PlayerData.addToTeam(this._petId)) {
        Platform.showToast('队伍已满 5 只');
        return;
      }
      Platform.vibrateShort('light');
      this._build();
    });
    teamBtn.position.set(w / 2, avatarY + 500);
    this.container.addChild(teamBtn);
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
      fontSize: Math.floor(height * 0.4), fill: 0xffffff, fontWeight: 'bold',
    });
    text.anchor.set(0.5);
    btn.addChild(text);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onTap);
    return btn;
  }
}
