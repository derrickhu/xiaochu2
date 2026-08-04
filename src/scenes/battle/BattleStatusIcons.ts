/**
 * 持续状态可视化：敌人名匾右侧 + 英雄血条上方各一行小图标。
 *
 * 敌方 Debuff 锚在怪物名右边（layout.enemyStatusIconX/Y，由 HUD 按名匾实宽刷新），
 * 与左侧克制/抵抗、右侧攻击倒计时错开。数据源为 BattleController.statuses。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UI } from '@/balance/ui';
import { describeUnmet, type GateUnmet } from '@/balance/damageGates';
import { displayAlive, readScale, cancelDisplayTweens } from '@/core/animationGuard';
import type { StatusInstance, StatusKind, StatusOwner } from '@/game/battle/BattleStatus';
import type { BattleController } from '@/game/battle/BattleController';
import type { BattleLayout } from './BattleLayout';
import { COLORS, FONT_SIZE } from '@/ui/theme';
import { applyTextResolution } from '@/ui/text';

interface IconStyle {
  glyph: string;
  color: number;
  /** debuff 用红紫描边，buff 用同色描边 */
  debuff: boolean;
}

/** 敌人侧图标（owner === 'enemy'） */
const ENEMY_ICON: Partial<Record<StatusKind, IconStyle>> = {
  dot: { glyph: '灼', color: 0xff7a5c, debuff: true },
  stun: { glyph: '晕', color: 0xffd54f, debuff: true },
  enemyDefenseBreak: { glyph: '破', color: 0xff8a65, debuff: true },
  enemyDamageReduction: { glyph: '减', color: 0xb0c4de, debuff: false },
  charge: { glyph: '蓄', color: 0xff5252, debuff: false },
  enrage: { glyph: '暴', color: 0xff2d2d, debuff: false },
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
};

const ICON_SIZE = 34;
const ICON_GAP = 8;

interface IconEntry {
  container: PIXI.Container;
  turnsText: PIXI.Text;
  lastTurns: number | null;
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
    this._gateBar.position.set(Game.logicWidth / 2, this._layout.enemyStatusIconY + ICON_SIZE);
    this._gateBar.visible = false;
    parent.addChild(this._gateBar);

    this._teamRow = new PIXI.Container();
    // 英雄血条正上方靠左（右侧留给 buff 状态文字行）
    this._teamRow.position.set(
      UI.board.marginX + ICON_SIZE / 2,
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
    this._layoutRow(teamList, this._teamRow, 'team', false);
    this._refreshGateBar();
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
    const step = ICON_SIZE + ICON_GAP;
    const startX = centered ? -((list.length - 1) * step) / 2 : 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const key = iconKey(s);
      let entry = this._icons.get(key);
      if (!entry) {
        const style = (owner === 'enemy' ? ENEMY_ICON[s.kind] : TEAM_ICON[s.kind])!;
        entry = this._makeIcon(style);
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
      entry.container.position.set(startX + i * step, 0);
      const turns = s.turnsLeft ?? null;
      if (turns !== entry.lastTurns) {
        entry.lastTurns = turns;
        entry.turnsText.text = turns != null ? String(turns) : '';
      }
    }
  }

  private _makeIcon(style: IconStyle): IconEntry {
    const c = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const half = ICON_SIZE / 2;
    bg.beginFill(COLORS.panelBg, 0.95);
    bg.lineStyle(2, style.debuff ? 0xc06cf0 : style.color, 0.95);
    bg.drawRoundedRect(-half, -half, ICON_SIZE, ICON_SIZE, 8);
    bg.endFill();
    c.addChild(bg);

    const glyph = applyTextResolution(new PIXI.Text(style.glyph, {
      fontSize: FONT_SIZE.xxs + 5, fill: style.color, fontWeight: 'bold',
    }));
    glyph.anchor.set(0.5);
    glyph.position.set(0, -1);
    c.addChild(glyph);

    const turnsText = applyTextResolution(new PIXI.Text('', {
      fontSize: FONT_SIZE.xxs, fill: COLORS.textMain, fontWeight: 'bold',
      stroke: COLORS.panelBg, strokeThickness: 3,
    }));
    turnsText.anchor.set(1, 1);
    turnsText.position.set(half + 2, half + 4);
    c.addChild(turnsText);

    return { container: c, turnsText, lastTurns: null };
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
