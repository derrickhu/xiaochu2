/**
 * 持续状态可视化：敌人名匾右侧方标 + 两血条之间我方增益/减益胶囊。
 * 我方胶囊深底金/紫边，避免浅字贴在火红场景上看不见。
 *
 * 敌方 Debuff 锚在怪物名右边（layout.enemyStatusIconX/Y，由 HUD 按名匾实宽刷新），
 * 与左侧克制/抵抗、右侧攻击倒计时错开。数据源为 BattleController.statuses。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { ELEMENT_NAME, UI } from '@/balance/ui';
import { describeUnmet, type GateUnmet } from '@/balance/damageGates';
import { displayAlive, readScale, cancelDisplayTweens } from '@/core/animationGuard';
import type { StatusInstance, StatusKind, StatusOwner } from '@/game/battle/BattleStatus';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';
import { FONT_SIZE } from '@/ui/theme';
import { applyTextResolution } from '@/ui/text';

interface IconStyle {
  glyph: string;
  color: number;
  /** debuff 用红紫描边，buff 用同色描边 */
  debuff: boolean;
}

/** 胶囊底板：深色才能压住火红场景，浅金字贴上去等于没字 */
const PILL_PLATE = 0x1a120c;
const PILL_H = 30;
const PILL_GAP = 8;
const PILL_PAD_X = 10;

/** 敌人侧图标（owner === 'enemy'） */
const ENEMY_ICON: Partial<Record<StatusKind, IconStyle>> = {
  dot: { glyph: '灼', color: 0xff7a5c, debuff: true },
  stun: { glyph: '晕', color: 0xffd54f, debuff: true },
  enemyDefenseBreak: { glyph: '破', color: 0xff8a65, debuff: true },
  enemyDamageReduction: { glyph: '减', color: 0xb0c4de, debuff: false },
  charge: { glyph: '蓄', color: 0xff5252, debuff: false },
  enrage: { glyph: '暴', color: 0xff2d2d, debuff: false },
  resolve: { glyph: '凝', color: 0xb0bec5, debuff: false },
  elementAbsorb: { glyph: '吸', color: 0x7ad3ff, debuff: false },
  counterStrike: { glyph: '反', color: 0xff8a65, debuff: false },
  // 硬闸门：图标只负责「还剩几回合」，条件正文由下方常驻条承担
  elementGate: { glyph: '阵', color: 0x7ad3ff, debuff: false },
  comboGate: { glyph: '锁', color: 0x9ae6a0, debuff: false },
  damageVoid: { glyph: '钝', color: 0xffb74d, debuff: false },
  undying: { glyph: '灭', color: 0xff8a80, debuff: false },
};

/** 我方侧图标（owner === 'team'；护盾走血条青色段，不进图标行） */
const TEAM_ICON: Partial<Record<StatusKind, IconStyle>> = {
  teamDamageBuff: { glyph: '伤', color: 0xffd76a, debuff: false },
  guaranteedCrit: { glyph: '暴', color: 0xffe14d, debuff: false },
  elementDamageBuff: { glyph: '强', color: 0x8fd4ff, debuff: false },
  extraDragTime: { glyph: '时', color: 0x6fd86a, debuff: false },
  dot: { glyph: '毒', color: 0xc06cf0, debuff: true },
  timeSqueeze: { glyph: '缩', color: 0xc06cf0, debuff: true },
  healBlock: { glyph: '禁', color: 0xc06cf0, debuff: true },
  skillSeal: { glyph: '封', color: 0xc06cf0, debuff: true },
  atkDebuff: { glyph: '弱', color: 0xc06cf0, debuff: true },
};

const ICON_SIZE = 34;
const ICON_GAP = 8;

interface IconEntry {
  container: PIXI.Container;
  plate: PIXI.Graphics;
  glyph: PIXI.Text;
  label: PIXI.Text | null;
  turnsText: PIXI.Text;
  lastTurns: number | null;
  lastLabel: string;
  width: number;
  pill: boolean;
}

export class BattleStatusIcons {
  private _enemyRow!: PIXI.Container;
  private _teamRow!: PIXI.Container;
  private _gateBar!: PIXI.Text;
  private readonly _icons = new Map<string, IconEntry>();
  /** 上一回合没过的闸门；有值时常驻条改写成「还差多少」 */
  private _shortfall: readonly GateUnmet[] = [];

  constructor(
    private readonly _ctrl: BattleController,
    private readonly _layout: BattleLayout,
  ) {}

  build(parent: PIXI.Container): void {
    this._enemyRow = new PIXI.Container();
    this._syncEnemyRowPos();
    parent.addChild(this._enemyRow);

    // 闸门条件常驻在敌人立绘下沿：图标只能说明「还剩几回合」，
    // 但玩家真正需要一直看见的是「这回合要做到什么」
    this._gateBar = applyTextResolution(new PIXI.Text('', {
      fontSize: FONT_SIZE.xxs, fill: 0xffe9b0, fontWeight: 'bold',
      stroke: 0x2b1c10, strokeThickness: 4,
      align: 'center', wordWrap: true, wordWrapWidth: Game.logicWidth - 48,
    }));
    this._gateBar.anchor.set(0.5, 0);
    this._gateBar.visible = false;
    parent.addChild(this._gateBar);
    this._syncGateBarPos();

    this._teamRow = new PIXI.Container();
    // 两血条空隙靠左起排：增益金胶囊在前，减益紫胶囊在后
    this._teamRow.position.set(
      UI.board.marginX + 8,
      this._layout.teamStatusIconY,
    );
    parent.addChild(this._teamRow);
  }

  /** 与 BattleStatusStore 对账：新增弹入 / 到期淡出 / 剩余回合刷新 */
  refresh(): void {
    const alive = new Set<string>();
    const enemyList: StatusInstance[] = [];
    const teamList: StatusInstance[] = [];
    for (const s of this._ctrl.statuses) {
      const style = s.owner === 'enemy' ? ENEMY_ICON[s.kind] : TEAM_ICON[s.kind];
      if (!style) continue;
      alive.add(iconKey(s));
      (s.owner === 'enemy' ? enemyList : teamList).push(s);
    }

    for (const [key, entry] of Array.from(this._icons.entries())) {
      if (alive.has(key)) continue;
      this._icons.delete(key);
      this._fadeOut(entry.container);
    }

    this._syncEnemyRowPos();
    // 敌方：从名匾右侧向右排布（不居中，避免压倒计时）
    this._layoutRow(enemyList, this._enemyRow, 'enemy', false);
    teamList.sort((a, b) => Number(TEAM_ICON[a.kind]?.debuff) - Number(TEAM_ICON[b.kind]?.debuff));
    this._layoutRow(teamList, this._teamRow, 'team', false);
    this._refreshGateBar();
  }

  private _syncGateBarPos(): void {
    if (!this._gateBar || this._gateBar.destroyed) return;
    this._gateBar.position.set(
      Game.logicWidth / 2,
      this._layout.enemyStatusIconY + ICON_SIZE,
    );
  }

  /** 由 BattleScene 在回合结算后回填「还差多少」；空数组 = 本回合过了 */
  setGateShortfall(unmet: readonly GateUnmet[]): void {
    this._shortfall = unmet;
    this._refreshGateBar();
  }

  private _refreshGateBar(): void {
    if (!this._gateBar || this._gateBar.destroyed) return;
    const lines: string[] = [];
    // 差多少排在最前：条件玩家已经读过一遍了，真正要盯的是缺口
    for (const u of this._shortfall) lines.push(describeUnmet(u));
    for (const s of this._ctrl.statuses) {
      if (s.owner !== 'enemy') continue;
      const text = gateConditionText(s);
      if (text) lines.push(text);
    }
    this._gateBar.visible = lines.length > 0;
    this._gateBar.text = lines.join('\n');
  }

  destroy(): void {
    for (const entry of this._icons.values()) {
      if (displayAlive(entry.container)) {
        cancelDisplayTweens(entry.container);
      }
    }
    this._icons.clear();
  }

  /** 状态图标世界坐标（DoT 飘字从「毒」图标冒出，而不是和普攻大红字抢中路） */
  iconAnchor(owner: StatusOwner, kind: StatusKind): { x: number; y: number } | null {
    const entry = this._icons.get(`${owner}:${kind}`);
    if (!entry || !displayAlive(entry.container)) return null;
    const row = owner === 'enemy' ? this._enemyRow : this._teamRow;
    if (!displayAlive(row)) return null;
    return {
      x: row.x + entry.container.x,
      y: row.y + entry.container.y,
    };
  }

  /** tick 时图标轻弹一下，把视线从普攻数字引到状态源 */
  pulseIcon(owner: StatusOwner, kind: StatusKind): void {
    const entry = this._icons.get(`${owner}:${kind}`);
    if (!entry || !displayAlive(entry.container)) return;
    const scale = readScale(entry.container);
    if (!scale) return;
    cancelDisplayTweens(entry.container);
    TweenManager.cancelTarget(scale);
    scale.set(1);
    TweenManager.to({
      target: scale, props: { x: 1.28, y: 1.28 },
      duration: 0.1, ease: Ease.easeOutQuad,
      onComplete: () => {
        if (!displayAlive(entry.container)) return;
        TweenManager.to({
          target: scale, props: { x: 1, y: 1 },
          duration: 0.16, ease: Ease.easeOutBack,
        });
      },
    });
  }

  private _syncEnemyRowPos(): void {
    if (!this._enemyRow) return;
    this._enemyRow.position.set(
      this._layout.enemyStatusIconX,
      this._layout.enemyStatusIconY,
    );
  }

  private _layoutRow(
    list: StatusInstance[],
    row: PIXI.Container,
    owner: StatusOwner,
    centered: boolean,
  ): void {
    const pill = owner === 'team';
    let cursor = 0;
    const iconStep = ICON_SIZE + ICON_GAP;
    const startX = !pill && centered ? -((list.length - 1) * iconStep) / 2 : 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const key = iconKey(s);
      const style = (owner === 'enemy' ? ENEMY_ICON[s.kind] : TEAM_ICON[s.kind])!;
      let entry = this._icons.get(key);
      if (!entry) {
        entry = pill ? this._makePill(style) : this._makeIcon(style);
        this._icons.set(key, entry);
        row.addChild(entry.container);
        const iconScale = readScale(entry.container);
        if (iconScale) {
          iconScale.set(0.2);
          TweenManager.to({
            target: iconScale, props: { x: 1, y: 1 },
            duration: 0.25, ease: Ease.easeOutBack,
          });
        }
      }
      if (pill) this._syncPill(entry, style, s);
      const turns = s.turnsLeft ?? null;
      if (turns !== entry.lastTurns) {
        entry.lastTurns = turns;
        entry.turnsText.text = turns != null ? String(turns) : '';
      }
      if (pill) {
        entry.container.position.set(cursor + entry.width / 2, 0);
        cursor += entry.width + PILL_GAP;
      } else {
        entry.container.position.set(startX + i * iconStep, 0);
      }
    }
  }

  private _makeIcon(style: IconStyle): IconEntry {
    const c = new PIXI.Container();
    const plate = new PIXI.Graphics();
    const half = ICON_SIZE / 2;
    plate.beginFill(PILL_PLATE, 0.92);
    plate.lineStyle(2.5, style.debuff ? 0xe070ff : style.color, 1);
    plate.drawRoundedRect(-half, -half, ICON_SIZE, ICON_SIZE, 8);
    plate.endFill();
    c.addChild(plate);

    const glyph = applyTextResolution(new PIXI.Text(style.glyph, {
      fontSize: FONT_SIZE.xxs + 5, fill: style.color, fontWeight: 'bold',
      stroke: PILL_PLATE, strokeThickness: 3,
    }));
    glyph.anchor.set(0.5);
    glyph.position.set(0, -1);
    c.addChild(glyph);

    const turnsText = applyTextResolution(new PIXI.Text('', {
      fontSize: FONT_SIZE.xxs, fill: 0xfff6e0, fontWeight: 'bold',
      stroke: PILL_PLATE, strokeThickness: 4,
    }));
    turnsText.anchor.set(1, 1);
    turnsText.position.set(half + 2, half + 4);
    c.addChild(turnsText);

    return {
      container: c, plate, glyph, label: null, turnsText,
      lastTurns: null, lastLabel: '', width: ICON_SIZE, pill: false,
    };
  }

  private _makePill(style: IconStyle): IconEntry {
    const c = new PIXI.Container();
    const plate = new PIXI.Graphics();
    c.addChild(plate);

    const fill = style.debuff ? 0xffd6ff : 0xfff0c8;
    const glyph = applyTextResolution(new PIXI.Text(style.glyph, {
      fontSize: 16, fill: style.color, fontWeight: 'bold',
      stroke: PILL_PLATE, strokeThickness: 3,
    }));
    glyph.anchor.set(0.5);
    c.addChild(glyph);

    const label = applyTextResolution(new PIXI.Text('', {
      fontSize: 17, fill, fontWeight: '800',
      stroke: PILL_PLATE, strokeThickness: 4,
    }));
    label.anchor.set(0, 0.5);
    c.addChild(label);

    const turnsText = applyTextResolution(new PIXI.Text('', {
      fontSize: 15, fill: 0xfff6e0, fontWeight: 'bold',
      stroke: PILL_PLATE, strokeThickness: 4,
    }));
    turnsText.anchor.set(0.5);
    c.addChild(turnsText);

    return {
      container: c, plate, glyph, label, turnsText,
      lastTurns: null, lastLabel: '', width: 80, pill: true,
    };
  }

  private _syncPill(entry: IconEntry, style: IconStyle, status: StatusInstance): void {
    const label = entry.label;
    if (!label) return;
    const text = pillLabel(status);
    const turns = status.turnsLeft != null ? String(status.turnsLeft) : '';
    if (text === entry.lastLabel && turns === (entry.lastTurns != null ? String(entry.lastTurns) : '')) {
      return;
    }
    entry.lastLabel = text;
    label.text = text;
    entry.turnsText.text = turns;

    const glyphW = 18;
    const turnsW = turns ? 22 : 0;
    const w = Math.ceil(PILL_PAD_X + glyphW + 6 + label.width + (turnsW ? 8 + turnsW : 0) + PILL_PAD_X);
    entry.width = w;
    const halfW = w / 2;
    const halfH = PILL_H / 2;
    const border = style.debuff ? 0xe070ff : 0xffc84a;
    entry.plate.clear();
    entry.plate.beginFill(PILL_PLATE, 0.92);
    entry.plate.lineStyle(2.5, border, 1);
    entry.plate.drawRoundedRect(-halfW, -halfH, w, PILL_H, PILL_H / 2);
    entry.plate.endFill();
    entry.plate.beginFill(style.color, 0.95);
    entry.plate.drawCircle(-halfW + PILL_PAD_X + 7, 0, 8);
    entry.plate.endFill();

    entry.glyph.position.set(-halfW + PILL_PAD_X + 7, -1);
    label.position.set(-halfW + PILL_PAD_X + glyphW + 8, 0);
    entry.turnsText.position.set(halfW - PILL_PAD_X - 8, 0);
  }

  /** 到期：短促闪烁后淡出销毁 */
  private _fadeOut(c: PIXI.Container): void {
    if (!displayAlive(c)) return;
    cancelDisplayTweens(c);
    TweenManager.to({
      target: c, props: { alpha: 0 },
      duration: 0.3, ease: Ease.easeInQuad,
      onComplete: () => {
        if (!c.destroyed) c.destroy({ children: true });
      },
    });
  }
}

function iconKey(s: StatusInstance): string {
  return `${s.owner}:${s.kind}`;
}

function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 胶囊上的效果短句：玩家要一眼读到「加了什么 / 还剩几回合」 */
function pillLabel(s: StatusInstance): string {
  switch (s.kind) {
    case 'teamDamageBuff':
      return `伤害×${trimNum(s.value)}`;
    case 'guaranteedCrit':
      return '必暴击';
    case 'elementDamageBuff':
      return `${s.element ? ELEMENT_NAME[s.element] : '属'}×${trimNum(s.value)}`;
    case 'extraDragTime':
      return `时限+${s.value}秒`;
    case 'atkDebuff':
      return `伤害×${trimNum(s.value)}`;
    case 'dot':
      return '中毒';
    case 'timeSqueeze':
      return `时限-${s.value}秒`;
    case 'healBlock':
      return '禁疗';
    case 'skillSeal':
      return '封技';
    default:
      return '';
  }
}

/** 闸门的一行条件；非闸门状态返回 null（它们有图标就够了） */
function gateConditionText(s: StatusInstance): string | null {
  const left = s.turnsLeft != null ? ` · 剩 ${s.turnsLeft} 回合` : '';
  switch (s.kind) {
    case 'elementGate':
      return `五行阵盾：首消需 ${s.value} 种属性${left}`;
    case 'comboGate':
      return `连锁盾：首消需 ${s.value} 连${left}`;
    case 'damageVoid':
      return `锋锐无效：大伤害被吞，用 5 连及以上穿透${left}`;
    case 'undying':
      return '不灭：一次致死会留 1 血，备好持续伤害补刀';
    default:
      return null;
  }
}
