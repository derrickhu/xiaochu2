/**
 * 战斗中点击敌人弹出的详情浮层（对齐 xiao_chu drawEnemyDetailDialog）：
 * 名称/档位、属性、HP·ATK·DEF、攻击节奏、技能列表、双方状态；点任意处关闭。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import {
  ENEMY_TIER_COLOR,
  ENEMY_TIER_LABEL,
  enemyDisplayTierOf,
} from '@/balance/enemyDisplay';
import { ELEMENT_NAME } from '@/balance/ui';
import { counterElementOf, resistedElementOf } from '@/balance/combat';
import type { StatusInstance, StatusKind } from '@/game/battle/BattleStatus';
import type { BattleController } from '@/game/battle/BattleController';
import { skillForEnemy } from '@/game/battle/SkillEngine';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { makeElementOrb } from '@/ui/ElementOrb';
import { makeSkillIcon } from '@/ui/SkillIcon';
import { COLORS, FONT_SIZE } from '@/ui/theme';
import { bindPointerTap } from '@/utils/bindPointerTap';

const PANEL_W_RATIO = 0.86;
const PAD_X = 20;
const PAD_Y = 18;
const RADIUS = 16;
const GOLD = 0x8b6914;
const BODY = 0x3d2b1f;
const SUB = 0x6b5b50;
const CLOSE_HINT = 0x9b8b80;

const STATUS_LABEL: Readonly<Partial<Record<StatusKind, string>>> = {
  shield: '护盾',
  teamDamageBuff: '增伤',
  enemyDamageReduction: '减伤',
  charge: '蓄力',
  dot: '持续伤害',
  stun: '眩晕',
  enemyDefenseBreak: '破防',
  extraDragTime: '延时',
  guaranteedCrit: '必暴',
  elementDamageBuff: '属性强化',
  timeSqueeze: '时间压缩',
  healBlock: '禁疗',
  skillSeal: '封技',
  atkDebuff: '攻弱',
  enrage: '狂暴',
  resolve: '凝意',
  elementAbsorb: '属性吸收',
  counterStrike: '反击',
};

export interface EnemyDetailHandle {
  dismiss: () => void;
}

export function showEnemyDetailDialog(
  layer: PIXI.Container,
  ctrl: BattleController,
): EnemyDetailHandle {
  const enemy = ctrl.enemy;
  const def = enemy.def;
  const tier = enemyDisplayTierOf(def);
  const tierColor = ENEMY_TIER_COLOR[tier];
  const panelW = Math.min(Game.logicWidth * PANEL_W_RATIO, Game.logicWidth - 48);
  const innerW = panelW - PAD_X * 2;

  const root = new PIXI.Container();

  const scrim = new PIXI.Graphics();
  scrim.beginFill(0x000000, 0.45);
  scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
  scrim.endFill();
  root.addChild(scrim);

  const content = new PIXI.Container();
  let y = 0;

  // 标题：【首领】名
  const titleRow = new PIXI.Container();
  const tag = makeText(`【${ENEMY_TIER_LABEL[tier]}】`, {
    size: FONT_SIZE.md, fill: tierColor, bold: true, anchor: [0, 0],
  });
  titleRow.addChild(tag);
  const name = makeText(def.name, {
    size: FONT_SIZE.md, fill: BODY, bold: true, anchor: [0, 0],
  });
  name.position.set(tag.width, 0);
  titleRow.addChild(name);
  content.addChild(titleRow);
  y += Math.max(tag.height, name.height) + 8;

  // 属性珠 + 波次
  const meta = new PIXI.Container();
  const orb = makeElementOrb(def.element, 22);
  orb.position.set(11, 11);
  meta.addChild(orb);
  const metaText = makeText(
    `${ELEMENT_NAME[def.element]}属性　　第 ${ctrl.waveIndex + 1}/${ctrl.totalWaves} 波`,
    { size: FONT_SIZE.xs, fill: SUB, bold: true, anchor: [0, 0.5] },
  );
  metaText.position.set(28, 11);
  meta.addChild(metaText);
  meta.position.set(0, y);
  content.addChild(meta);
  y += 28;

  // HP / ATK / DEF（破防时展示现防 + 原防/比例，对齐原型 A）
  const baseDef = Math.round(enemy.def_);
  const defBreakPct = enemyDefenseBreakPct(ctrl);
  const effDef = defBreakPct > 0 ? Math.floor(baseDef * (1 - defBreakPct)) : baseDef;
  const defText = defBreakPct > 0
    ? `DEF：${effDef}（原${baseDef} · 破防-${Math.round(defBreakPct * 100)}%）`
    : `DEF：${baseDef}`;
  const stats = makeText(
    `HP：${Math.round(enemy.hp)} / ${Math.round(enemy.maxHp)}　`
    + `ATK：${Math.round(enemy.atk)}　${defText}`,
    { size: FONT_SIZE.xs, fill: BODY, bold: true, anchor: [0, 0], wordWrapWidth: innerW },
  );
  stats.position.set(0, y);
  content.addChild(stats);
  y += stats.height + 6;

  // 攻击节奏
  const cdLeft = Math.max(0, enemy.attackCountdown);
  const rhythm = enemy.charging
    ? '蓄力中：下回合重击'
    : cdLeft <= 0
      ? `攻击间隔 ${enemy.attackInterval} 回合 · 本回合将行动`
      : `攻击间隔 ${enemy.attackInterval} 回合 · ${cdLeft} 回合后攻击`;
  const rhythmText = makeText(rhythm, {
    size: FONT_SIZE.xs, fill: SUB, bold: true, anchor: [0, 0],
  });
  rhythmText.position.set(0, y);
  content.addChild(rhythmText);
  y += rhythmText.height + 10;

  // 克制 / 抵抗
  const weak = counterElementOf(def.element);
  const resist = resistedElementOf(def.element);
  const counterLine = makeText(
    `克制 ${ELEMENT_NAME[weak]}　·　抵抗 ${ELEMENT_NAME[resist]}`,
    { size: FONT_SIZE.xxs, fill: SUB, bold: true, anchor: [0, 0] },
  );
  counterLine.position.set(0, y);
  content.addChild(counterLine);
  y += counterLine.height + 12;

  // 技能
  const skillIds = enemy.skillIds.length > 0
    ? enemy.skillIds
    : (def.skillIds ?? []);
  if (skillIds.length > 0) {
    const skTitle = makeText('技能列表：', {
      size: FONT_SIZE.sm, fill: GOLD, bold: true, anchor: [0, 0],
    });
    skTitle.position.set(0, y);
    content.addChild(skTitle);
    y += skTitle.height + 8;

    skillIds.forEach((id, i) => {
      const skill = skillForEnemy(id);
      const rowH = 52;
      const row = new PIXI.Container();
      row.position.set(0, y);

      const icon = makeSkillIcon({
        skillId: id,
        size: 40,
        fallbackFill: 0xb8843c,
        fallbackGlyph: skill.name.charAt(0),
      });
      icon.position.set(20, rowH / 2);
      row.addChild(icon);

      const textX = 48;
      const title = makeText(skill.name, {
        size: FONT_SIZE.xs, fill: 0x7a5c30, bold: true, anchor: [0, 0],
        wordWrapWidth: innerW - textX,
      });
      title.position.set(textX, 4);
      row.addChild(title);

      const cdHint = skill.cd > 0 ? `冷却 ${skill.cd} 回合` : '被动/即时';
      const cdLeftSkill = enemy.skillCds[i];
      const cdExtra = typeof cdLeftSkill === 'number' && cdLeftSkill > 0
        ? ` · 剩余 ${cdLeftSkill}`
        : '';
      const desc = makeText(`${skill.desc}\n${cdHint}${cdExtra}`, {
        size: 12, fill: SUB, anchor: [0, 0],
        wordWrapWidth: innerW - textX,
      });
      desc.position.set(textX, 4 + title.height + 2);
      row.addChild(desc);

      const usedH = Math.max(rowH, desc.y + desc.height + 4);
      content.addChild(row);
      y += usedH + 8;
    });
  }

  // 敌方状态（statuses + 立绘侧蓄力/减伤兜底）
  const enemyLines: StatusLine[] = ctrl.statuses
    .filter((s) => s.owner === 'enemy')
    .map((s) => statusLine(s, { baseDef, effDef, defBreakPct }));
  if (
    enemy.dmgReduction
    && enemy.dmgReduction.turnsLeft > 0
    && !enemyLines.some((l) => l.label.startsWith('减伤'))
  ) {
    enemyLines.push({
      label: `减伤 ${Math.round(enemy.dmgReduction.reduction * 100)}%`,
      turns: enemy.dmgReduction.turnsLeft,
      bad: false,
    });
  }
  if (enemy.charging && !enemyLines.some((l) => l.label.startsWith('蓄力'))) {
    enemyLines.push({
      label: `蓄力（×${enemy.charging.mult}）`,
      turns: undefined,
      bad: false,
    });
  }
  if (enemyLines.length > 0) {
    y = appendStatusSection(content, y, '敌方状态：', 0xc0392b, enemyLines, innerW);
  }

  // 己方状态（不含护盾数值细节过多时仍列出）
  const teamStatuses = ctrl.statuses.filter((s) => s.owner === 'team');
  if (teamStatuses.length > 0) {
    y = appendStatusSection(
      content, y, '己方状态：', 0x2e6da4,
      teamStatuses.map((s) => statusLine(s, {})),
      innerW,
    );
  }

  y += 6;
  const hint = makeText('点击任意位置关闭', {
    size: FONT_SIZE.xxs, fill: CLOSE_HINT, bold: true, anchor: [0.5, 0],
  });
  hint.position.set(innerW / 2, y);
  content.addChild(hint);
  y += hint.height;

  const panelH = Math.min(PAD_Y * 2 + y, Game.logicHeight * 0.8);
  const panel = makePanel({
    width: panelW,
    height: panelH,
    radius: RADIUS,
    bg: 0xfbf3e0,
    bgAlpha: 0.98,
    border: COLORS.panelBorder,
    borderWidth: 3,
    centered: false,
  });
  panel.position.set((Game.logicWidth - panelW) / 2, (Game.logicHeight - panelH) / 2);
  root.addChild(panel);

  // 内容区裁剪
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(0, 0, panelW, panelH, RADIUS);
  mask.endFill();
  mask.position.copyFrom(panel.position);
  root.addChild(mask);

  content.position.set(panel.x + PAD_X, panel.y + PAD_Y);
  content.mask = mask;
  root.addChild(content);

  // 整层可点关闭（对齐 xiao_chu「点击任意位置关闭」）
  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.interactiveChildren = false;
  root.hitArea = new PIXI.Rectangle(0, 0, Game.logicWidth, Game.logicHeight);

  root.alpha = 0;
  layer.addChild(root);
  TweenManager.to({
    target: root,
    props: { alpha: 1 },
    duration: 0.15,
    ease: Ease.easeOutQuad,
  });

  let closed = false;
  const handle: EnemyDetailHandle = {
    dismiss() {
      if (closed) return;
      closed = true;
      TweenManager.cancelTarget(root);
      if (root.destroyed) return;
      root.destroy({ children: true });
    },
  };
  bindPointerTap(root, () => handle.dismiss());
  return handle;
}

interface StatusLine {
  label: string;
  turns?: number;
  bad: boolean;
}

interface StatusLineCtx {
  baseDef?: number;
  effDef?: number;
  defBreakPct?: number;
}

/** 与 BattleController._enemyDefEffective 破防口径一致：status + 灵机修饰，封顶 90% */
function enemyDefenseBreakPct(ctrl: BattleController): number {
  const fromStatus = ctrl.statuses
    .find((s) => s.owner === 'enemy' && s.kind === 'enemyDefenseBreak')?.value ?? 0;
  return Math.min(0.9, fromStatus + ctrl.runMods.enemyDefBreak);
}

function statusLine(s: StatusInstance, ctx: StatusLineCtx): StatusLine {
  const base = STATUS_LABEL[s.kind] ?? s.kind;
  let label = base;
  let turns: number | undefined = s.turnsLeft;
  if (s.kind === 'enemyDamageReduction') {
    label = `减伤 ${Math.round(s.value * 100)}%`;
  } else if (s.kind === 'enrage') {
    label = `狂暴（攻×${s.value}）`;
  } else if (s.kind === 'charge') {
    label = `蓄力（×${s.value}）`;
  } else if (s.kind === 'shield') {
    label = `护盾 ${Math.round(s.value)}`;
  } else if (s.kind === 'elementAbsorb' && s.element) {
    label = `吸收${ELEMENT_NAME[s.element]}`;
  } else if (s.kind === 'enemyDefenseBreak') {
    // 原型 A：破防 -40%（3回合）· 防65→39 —— 回合写进 label，避免外层再拼一次
    const pct = Math.round((ctx.defBreakPct ?? s.value) * 100);
    const from = ctx.baseDef ?? 0;
    const to = ctx.effDef ?? Math.floor(from * (1 - s.value));
    const left = s.turnsLeft ?? 0;
    const dur = left > 0 && left < 99 ? `（${left}回合）` : '';
    label = `破防 -${pct}%${dur} · 防${from}→${to}`;
    turns = undefined;
  }
  const bad = s.owner === 'team'
    ? (s.kind === 'dot' || s.kind === 'timeSqueeze' || s.kind === 'healBlock'
      || s.kind === 'skillSeal' || s.kind === 'atkDebuff')
    : (s.kind === 'dot' || s.kind === 'stun' || s.kind === 'enemyDefenseBreak');
  return { label, turns, bad };
}

function appendStatusSection(
  parent: PIXI.Container,
  y0: number,
  title: string,
  titleColor: number,
  lines: StatusLine[],
  _innerW: number,
): number {
  let y = y0 + 4;
  const t = makeText(title, {
    size: FONT_SIZE.sm, fill: titleColor, bold: true, anchor: [0, 0],
  });
  t.position.set(0, y);
  parent.addChild(t);
  y += t.height + 4;
  for (const line of lines) {
    const dur = line.turns != null && line.turns < 99 ? `（${line.turns}回合）` : '';
    const text = makeText(`· ${line.label}${dur}`, {
      size: 12,
      fill: line.bad ? 0xc0392b : 0x27864a,
      bold: true,
      anchor: [0, 0],
    });
    text.position.set(0, y);
    parent.addChild(text);
    y += text.height + 2;
  }
  return y + 6;
}
