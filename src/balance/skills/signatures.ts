/**
 * SSR / UR 招牌技（量产名录 pet_031~pet_100 部分）—— 逐只手写，走段式复合技
 *
 * 分层意图（与 petMatrix.ts 的量产矩阵对照）：
 * - R / SR：单效果蓝图，数值按稀有度取一档，靠属性与起名做差异；
 * - SSR：双效果组合（输出 + 一段控制/续航），让「拿到 SSR」有解法上的变化；
 * - UR：三效果招牌技，配合 creatureRoster 给的 skillModifier（自带 CD -1）成为队伍核心。
 *
 * 类目一律避开 nuke / multiNuke / dot / teamNuke —— 那四类会被 monotonic.test.ts 的
 * 跨稀有倒挂审计覆盖，而复合技的 basePower 与纯输出技不可比（见 composite.ts 文件头）。
 */
import { makeComposite } from './composite';
import type { SkillDef } from './types';

export const SIGNATURE_SKILLS: readonly SkillDef[] = [
  // ── 金 ──
  makeComposite({
    id: 'pet_sig_metal_ruin', name: '破军裂阵', category: 'debuff', target: 'enemy', cd: 6,
    tags: ['伤害', '破防'], flavor: '狮吼撕开阵列',
    segments: [
      { kind: 'damage', element: 'metal', multiplier: 6 },
      { kind: 'defenseBreak', pct: 0.45, turns: 3 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_metal_bastion', name: '山岳金壁', category: 'shield', target: 'team', cd: 7,
    tags: ['护盾', '威吓'], flavor: '金像顿地立起山岳',
    segments: [
      { kind: 'shield', pct: 0.35 },
      { kind: 'delayAttack', turns: 1 },
    ],
  }),

  // ── 木 ──
  makeComposite({
    id: 'pet_sig_wood_lance', name: '苍虬贯木', category: 'control', target: 'enemy', cd: 6,
    tags: ['伤害', '眩晕'], flavor: '木龙盘身直贯而上',
    segments: [
      { kind: 'damage', element: 'wood', multiplier: 6.5 },
      { kind: 'stun', turns: 1 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_wood_bloom', name: '九叶回春阵', category: 'heal', target: 'team', cd: 6,
    tags: ['治疗', '转珠'], flavor: '九叶轮转铺开生机',
    segments: [
      { kind: 'heal', pct: 0.42 },
      { kind: 'convert', to: 'heart', count: 4 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_wood_aegis', name: '万岁庇荫', category: 'shield', target: 'team', cd: 7,
    tags: ['护盾', '治疗'], flavor: '神榕垂荫覆护全队',
    segments: [
      { kind: 'shield', pct: 0.32 },
      { kind: 'heal', pct: 0.2 },
    ],
  }),
  // UR：三效招牌技
  makeComposite({
    id: 'pet_sig_wood_worldtree', name: '建木通天', category: 'haste', target: 'team', cd: 7,
    tags: ['缩CD', '治疗', '转珠'], flavor: '建木贯通天地',
    segments: [
      { kind: 'haste', amount: 1 },
      { kind: 'heal', pct: 0.28 },
      { kind: 'convert', to: 'heart', count: 4 },
    ],
  }),

  // ── 水 ──
  makeComposite({
    id: 'pet_sig_water_maelstrom', name: '沧溟涡灭', category: 'gravity', target: 'enemy', cd: 7,
    tags: ['重力', '伤害'], flavor: '蛟王搅起沧溟巨涡',
    segments: [
      { kind: 'gravity', pct: 0.22 },
      { kind: 'damage', element: 'water', multiplier: 5 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_water_bulwark', name: '玄冥重甲', category: 'shield', target: 'team', cd: 7,
    tags: ['护盾', '加时'], flavor: '龟甲沉入玄冥静水',
    segments: [
      { kind: 'shield', pct: 0.36 },
      { kind: 'extraTime', seconds: 2, turns: 3 },
    ],
  }),

  // ── 火 ──
  makeComposite({
    id: 'pet_sig_fire_warhymn', name: '赤霄战诀', category: 'buff', target: 'team', cd: 7,
    tags: ['属性增伤', '转珠'], flavor: '凤将高唱赤霄战诀',
    segments: [
      { kind: 'elementBuff', element: 'fire', mult: 1.5, turns: 2 },
      { kind: 'convert', to: 'fire', count: 4 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_fire_emberflow', name: '流火轮转', category: 'haste', target: 'team', cd: 7,
    tags: ['缩CD', '治疗'], flavor: '天狐踏出流火之轮',
    segments: [
      { kind: 'haste', amount: 1 },
      { kind: 'heal', pct: 0.2 },
    ],
  }),
  makeComposite({
    id: 'pet_sig_fire_magmaward', name: '熔岩壁垒', category: 'shield', target: 'team', cd: 7,
    tags: ['护盾', '转珠'], flavor: '巨魔掀起熔岩为壁',
    segments: [
      { kind: 'shield', pct: 0.33 },
      { kind: 'convert', to: 'heart', count: 4 },
    ],
  }),

  // ── 土 ──
  makeComposite({
    id: 'pet_sig_earth_quake', name: '破岳崩地', category: 'debuff', target: 'enemy', cd: 6,
    tags: ['伤害', '破防'], flavor: '金刚象踏裂岳根',
    segments: [
      { kind: 'damage', element: 'earth', multiplier: 6.2 },
      { kind: 'defenseBreak', pct: 0.42, turns: 3 },
    ],
  }),
  // UR：三效招牌技
  makeComposite({
    id: 'pet_sig_earth_genesis', name: '后土同尘', category: 'buff', target: 'team', cd: 8,
    tags: ['增伤', '护盾', '转珠'], flavor: '神麒踏尘与大地同息',
    segments: [
      { kind: 'damageBuff', mult: 1.55, turns: 2 },
      { kind: 'shield', pct: 0.3 },
      { kind: 'convert', to: 'earth', count: 5 },
    ],
  }),
];
