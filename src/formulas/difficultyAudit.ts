/**
 * 难度审计器（纯函数，零渲染 / 零随机）
 *
 * 把 difficultyBudget.ts 的四条护栏变成可计算的报告。测试门禁与 balance-dashboard
 * 共用这一份实现，避免「测试绿了但看板显示另一套数」。
 *
 * 与旧 simulation 契约的根本区别：旧的问「达标队过不过得去」，这里问
 * 「不动脑的玩家会不会也过得去」「换队到底值不值」。
 */
import { counterElementOf, ELEMENTS, type Element } from '@/balance/combat';
import { resolveEncounter } from '@/balance/enemies';
import { DEFAULT_SUMMON_POOL_R_IDS } from '@/balance/creatures';
import { DEFAULT_TEAM, PET_MAP, TEAM_SIZE, type PetDef } from '@/balance/pets';
import { CHAPTER_REWARD_PET, STAGES, stageWaveCount, type StageDef } from '@/balance/stages';
import { getChapterPower, stageTtkFor } from '@/balance/powerBudget';
import {
  MECHANIC_DENSITY,
  MINDLESS_MAX_DEPTH,
  MINDLESS_WALL_CHAPTER,
  TEAM_SWAP_EDGE_MIN,
  TEAM_SWAP_EDGE_FROM_CHAPTER,
  TTK_FLOOR,
  TTK_FLOOR_EXEMPT,
  type EnemyArchetype,
  type PlayerProfile,
} from '@/balance/difficultyBudget';
import { petTagsOf } from '@/balance/petTags';
import { getSkill, SKILL_MAP } from '@/balance/skills';
import { COMBO_MODELS, type SimResult } from './simulationReport';
import { simulateBattle } from './simulation';
import type { TeamMember } from './team';

/** 关卡在 TTK 护栏里的归类（stage.type 已是 normal/elite/boss） */
function ttkKindOf(stage: StageDef): keyof typeof TTK_FLOOR {
  if (stage.isBoss || stage.type === 'boss') return 'boss';
  if (stage.type === 'elite') return 'elite';
  return 'normal';
}

/**
 * 「纯数值关」判定：没有机制标签，且所有波次的敌人既无技能也无分阶段。
 * 这种关卡玩家除了拖珠没有任何决策点，是「没挑战感」最直接的来源。
 */
export function isPlainStage(stage: StageDef): boolean {
  if (stage.mechanics && stage.mechanics.length > 0) return false;
  return stage.encounters.every((ref) => {
    const { def } = resolveEncounter(ref);
    const hasSkill = !!def.skillIds && def.skillIds.length > 0;
    const hasPhase = !!def.phases && def.phases.length > 0;
    return !hasSkill && !hasPhase;
  });
}

/**
 * ── Boss archetype 识别 ──
 *
 * 从关卡末波敌人的技能表（含分阶段追加）反推它属于哪一类。放在审计器而不是关卡数据里，
 * 是为了让 archetype 永远等于「敌人实际会放什么招」——写在数据表里的标签会和实现漂移，
 * 而这正是「防高型 Boss 其实和回复型用同一套技能」这种问题能长期存在的原因。
 */
const ARCHETYPE_BY_ENEMY_SKILL: Readonly<Record<string, EnemyArchetype>> = {
  damageVoid: 'bulwark',
  undying: 'bulwark',
  heal: 'regen',
  elementAbsorb: 'regen',
  resolve: 'fortress',
  charge: 'burst',
  enrage: 'burst',
};

/** archetype 的破解手段：每一类要求玩家带的主动技类型互不相同 */
const COUNTER_SKILL_KINDS: Readonly<Record<EnemyArchetype, readonly string[]>> = {
  // 高防 + 减伤 + 免控：控制技无效，只能破防或用无视防御的重力
  fortress: ['defenseBreak', 'gravity'],
  // 锋锐无效 + 不灭：单发高伤归零，改用多段与持续伤害凿
  bulwark: ['multiHit', 'dot', 'gravity'],
  // 自愈 + 吸收：磨不死，要么持续伤害压住回复节奏，要么攒爆发一口气打穿
  regen: ['dot', 'multiHit', 'elementDamageBuff', 'guaranteedCrit'],
  // 蓄力 + 狂暴：必须在预警回合内减伤、护盾或推迟它出手
  burst: ['shield', 'stun', 'delayEnemyAttack', 'heal'],
};

function archetypeOfStage(stage: StageDef): EnemyArchetype {
  const last = stage.encounters[stage.encounters.length - 1];
  if (!last) return 'burst';
  const { def } = resolveEncounter(last);
  const ids = [
    ...(def.skillIds ?? []),
    ...(def.phases ?? []).flatMap((p) => p.addSkillIds ?? []),
  ];
  const votes = new Map<EnemyArchetype, number>();
  for (const id of ids) {
    for (const effect of getSkill(id).effects) {
      const kind = ARCHETYPE_BY_ENEMY_SKILL[effect.kind];
      if (kind) votes.set(kind, (votes.get(kind) ?? 0) + 1);
    }
  }
  let best: EnemyArchetype = 'burst';
  let bestN = 0;
  for (const [kind, n] of votes) if (n > bestN) { best = kind; bestN = n; }
  return best;
}

function hasAnyEffectKind(def: PetDef, kinds: readonly string[]): boolean {
  const skill = SKILL_MAP.get(def.skillId);
  if (!skill) return false;
  return skill.effects.some((e) => kinds.includes(e.kind));
}

/** 按章节锚点构造队伍 */
function atAnchor(defs: readonly PetDef[], chapter: number): TeamMember[] {
  const anchor = getChapterPower(chapter);
  return defs.map((def) => ({ def, level: anchor.enterLevel, star: anchor.enterStar }));
}

/**
 * 玩家在进入第 N 章时**实际能拿到**的宠物池：
 * 初始 5R + 开局即在召唤池里的全部 R 档 + 前面各章 Boss 直掉。
 *
 * 把 R 档全池算进来是关键。只算「初始队 + Boss 掉落」的话池子仅十来只，
 * 玩家压根没有挑选余地，换队收益必然测出 0——那测到的是「没得选」，
 * 不是「换队没用」。R 档从建档起就能通过召唤获得，是真实可支配资源。
 *
 * 通用队与针对队都从这个池里挑，且锁死同等级同星级。这样 TEAM_SWAP_EDGE 测到的
 * 就只有一件事：玩家动脑研究对位能换来多少收益。
 */
function availablePool(chapter: number): PetDef[] {
  const ids = new Set<string>([...DEFAULT_TEAM, ...DEFAULT_SUMMON_POOL_R_IDS]);
  for (let ch = 1; ch < chapter; ch++) {
    const id = CHAPTER_REWARD_PET[ch];
    if (id) ids.add(id);
  }
  return [...ids].map((id) => PET_MAP.get(id)).filter((d): d is PetDef => !!d);
}

/** 每色取稀有度最高的一只，凑满五行 */
function oneBestPerElement(pool: readonly PetDef[]): PetDef[] {
  const byElement = new Map<Element, PetDef>();
  for (const def of pool) {
    const cur = byElement.get(def.element);
    if (!cur || def.rarity > cur.rarity) byElement.set(def.element, def);
  }
  return [...byElement.values()];
}

function fillToSize(picked: PetDef[], pool: readonly PetDef[]): PetDef[] {
  const out = [...picked];
  const taken = new Set(out.map((p) => p.id));
  const rest = [...pool]
    .filter((p) => !taken.has(p.id))
    .sort((a, b) => b.rarity - a.rarity || a.id.localeCompare(b.id));
  for (const def of rest) {
    if (out.length >= TEAM_SIZE) break;
    out.push(def);
  }
  return out.slice(0, TEAM_SIZE);
}

/**
 * 通用队：不研究对位的玩家会用的队——每色挑手上稀有度最高的，凑满五行。
 * 这是绝大多数玩家的真实队伍，也是判断「太简单」的基准。
 */
export function genericTeam(chapter: number): TeamMember[] {
  const pool = availablePool(chapter);
  return atAnchor(fillToSize(oneBestPerElement(pool), pool), chapter);
}

/**
 * 针对队候选构造。
 *
 * 「换阵容」在实战里不止一种形态，所以这里给出三种典型思路，由 bestCounterRun
 * 取其中表现最好的一支——衡量的是「玩家动脑后能达到的上限」，而不是某个特定套路。
 */
function counterTeamCandidates(
  chapter: number,
  bossElement: Element,
  archetype: EnemyArchetype,
): TeamMember[][] {
  const pool = availablePool(chapter);
  const counterEl = counterElementOf(bossElement);
  const isKiller = (d: PetDef): boolean => petTagsOf(d).killerElement === bossElement;

  // A：保持五行齐全，每色内**在最高稀有度档里**优先挑对位特攻的那只。
  //    先比稀有度再比特攻，避免为了一个特攻标签把整队降档（那不是配队，是自残）。
  const byElement = new Map<Element, PetDef>();
  for (const def of pool) {
    const cur = byElement.get(def.element);
    if (!cur) { byElement.set(def.element, def); continue; }
    if (def.rarity > cur.rarity) { byElement.set(def.element, def); continue; }
    if (def.rarity === cur.rarity && isKiller(def) && !isKiller(cur)) {
      byElement.set(def.element, def);
    }
  }
  const spread = fillToSize([...byElement.values()], pool);

  // B：向克制色集中——放弃部分覆盖换取克制乘区，被克色一律不带
  const focus = fillToSize(
    [...pool]
      .filter((d) => d.element !== bossElement)
      .sort((a, b) => {
        const s = (d: PetDef): number =>
          (d.element === counterEl ? 40 : 0) + (isKiller(d) ? 30 : 0) + d.rarity * 5;
        return s(b) - s(a) || a.id.localeCompare(b.id);
      }),
    pool,
  );

  // C：特攻优先，同稀有度内先取对位，再按稀有度补满
  const killerFirst = fillToSize(
    [...pool].sort((a, b) => {
      const s = (d: PetDef): number => (isKiller(d) ? 50 : 0) + d.rarity * 10;
      return s(b) - s(a) || a.id.localeCompare(b.id);
    }),
    pool,
  );

  // D：按 Boss archetype 挑**主动技对位**——真正的换阵容主要发生在这一层。
  //    属性/特攻只是乘区大小的差别，技能类型才决定「打不打得动」：
  //    破防之于高防、多段之于锋锐无效、持续伤害之于自愈、护盾控制之于蓄力。
  const wanted = COUNTER_SKILL_KINDS[archetype];
  const bySkill = fillToSize(
    [...pool].sort((a, b) => {
      const s = (d: PetDef): number =>
        (hasAnyEffectKind(d, wanted) ? 60 : 0) + (isKiller(d) ? 20 : 0) + d.rarity * 10;
      return s(b) - s(a) || a.id.localeCompare(b.id);
    }),
    pool,
  );

  // E：技能对位 + 保持五行齐全（前者常常会牺牲覆盖，这一档把两者折中）
  const byElementSkill = new Map<Element, PetDef>();
  for (const def of pool) {
    const cur = byElementSkill.get(def.element);
    if (!cur) { byElementSkill.set(def.element, def); continue; }
    const s = (d: PetDef): number =>
      (hasAnyEffectKind(d, wanted) ? 6 : 0) + (isKiller(d) ? 2 : 0) + d.rarity;
    if (s(def) > s(cur)) byElementSkill.set(def.element, def);
  }
  const skillSpread = fillToSize([...byElementSkill.values()], pool);

  // F：三色甜点区——同源相斥的解法。放弃「五色齐」，只带 3 种属性（含克制色），
  //    每色内按技能对位挑。这是最能体现「换阵容」的一档：它主动牺牲盘面覆盖，
  //    换掉敌人 ×1.6 的攻击加成。
  const triColor = ((): PetDef[] => {
    const prefer: Element[] = [counterEl];
    for (const el of ELEMENTS) {
      if (prefer.length >= 3) break;
      if (el !== counterEl && el !== bossElement) prefer.push(el);
    }
    const picked: PetDef[] = [];
    for (const el of prefer) {
      const inEl = pool
        .filter((d) => d.element === el)
        .sort((a, b) => {
          const s = (d: PetDef): number =>
            (hasAnyEffectKind(d, wanted) ? 6 : 0) + (isKiller(d) ? 3 : 0) + d.rarity;
          return s(b) - s(a) || a.id.localeCompare(b.id);
        });
      // 每色最多两只，凑满 5 个位置又不超出 3 种属性
      picked.push(...inEl.slice(0, 2));
    }
    return picked.slice(0, TEAM_SIZE);
  })();

  // G：不换队。玩家永远可以选择「就用现在这队」，所以它是收益的下界；
  //    没有这一档，某个思路跑砸了就会让指标变成负数，掩盖真正的问题。
  const stay = fillToSize(oneBestPerElement(pool), pool);

  return [spread, focus, killerFirst, bySkill, skillSpread, triColor, stay]
    .map((defs) => atAnchor(defs, chapter));
}

/** 一次模拟的优劣比较：胜过败，同为胜则回合少者优，同为败则撑得久者优 */
function better(a: SimResult, b: SimResult): SimResult {
  if (a.win !== b.win) return a.win ? a : b;
  if (a.win) return b.turnsUsed < a.turnsUsed ? b : a;
  return b.turnsUsed > a.turnsUsed ? b : a;
}

/** 爬山搜索每轮考察的候补宠数量：够覆盖对位选择，又不至于让审计跑成分钟级 */
const HILL_CLIMB_SHORTLIST = 28;
const HILL_CLIMB_MAX_PASSES = 4;

/**
 * 针对队实测：玩家动脑之后**能达到的上限**。
 *
 * 先用几套典型思路（克制集中 / 特攻优先 / 技能对位 / 三色甜点区）做多起点，
 * 再从最好的那支出发做逐位爬山——每次只换一只，换了更好就留下。
 *
 * 之所以不能只靠手写思路：那些贪心规则只看属性和技能类型，会顺手把奶妈换成输出、
 * 把羁绊拆散，于是「针对队」经常还不如什么都不换。那样测出来的低收益是**搜索太弱**，
 * 不是游戏真的不需要换队；照着这种读数去改数值，只会把游戏越调越离谱。
 * 逐位爬山正好对应玩家在编队页的真实动作：盯着一个位置试着换一只看看行不行。
 */
function bestCounterRun(stage: StageDef): SimResult {
  const chapter = stage.chapter;
  const seeds = counterTeamCandidates(chapter, stage.element, archetypeOfStage(stage));
  const run = (team: TeamMember[]): SimResult => simulateBattle(team, stage.id, COMBO_MODELS.mid);

  let bestTeam = seeds[0];
  let best = run(bestTeam);
  for (const team of seeds.slice(1)) {
    const r = run(team);
    if (better(best, r) === r) { best = r; bestTeam = team; }
  }

  // 候补池按「对位相关度」剪枝：全池 100 只 × 5 位 × 多轮会把审计拖到分钟级，
  // 而与本场无关的宠换上去必然更差，跑它们只是白费算力。
  const wanted = COUNTER_SKILL_KINDS[archetypeOfStage(stage)];
  const counterEl = counterElementOf(stage.element);
  const shortlist = [...availablePool(chapter)]
    .sort((a, b) => {
      const s = (d: PetDef): number =>
        (petTagsOf(d).killerElement === stage.element ? 8 : 0)
        + (hasAnyEffectKind(d, wanted) ? 6 : 0)
        + (d.element === counterEl ? 4 : 0)
        + (d.element === stage.element ? -4 : 0)
        + d.rarity;
      return s(b) - s(a) || a.id.localeCompare(b.id);
    })
    .slice(0, HILL_CLIMB_SHORTLIST);

  for (let pass = 0; pass < HILL_CLIMB_MAX_PASSES; pass++) {
    let improved = false;
    for (let slot = 0; slot < bestTeam.length; slot++) {
      for (const def of shortlist) {
        if (bestTeam.some((m) => m.def.id === def.id)) continue;
        const defs = bestTeam.map((m) => m.def);
        defs[slot] = def;
        const team = atAnchor(defs, chapter);
        const r = run(team);
        if (better(best, r) === r) { best = r; bestTeam = team; improved = true; }
      }
    }
    if (!improved) break;
  }
  return best;
}

export interface StageAudit {
  stageId: string;
  chapter: number;
  kind: keyof typeof TTK_FLOOR;
  plain: boolean;
  /** 本关是否挂了硬闸门（闸门按设计要多花回合，TTK 上限据此放宽） */
  gated: boolean;
  /** 波数（同样影响 TTK 上限） */
  waves: number;
  results: Readonly<Record<PlayerProfile, SimResult>>;
}

/** 对单关跑四画像（通用队口径） */
export function auditStage(stage: StageDef): StageAudit {
  const team = genericTeam(stage.chapter);
  const run = (p: PlayerProfile): SimResult => simulateBattle(team, stage.id, COMBO_MODELS[p]);
  return {
    stageId: stage.id,
    chapter: stage.chapter,
    kind: ttkKindOf(stage),
    plain: isPlainStage(stage),
    gated: (stage.mechanics ?? []).some((m) => m.startsWith('gate_')),
    waves: stageWaveCount(stage),
    results: {
      mindless: run('mindless'),
      low: run('low'),
      mid: run('mid'),
      high: run('high'),
    },
  };
}

export interface Violation {
  rule: 'ttkFloor' | 'ttkCeiling' | 'mindlessWall' | 'mindlessDepth' | 'teamSwapEdge'
    | 'mechanicDensity' | 'plainStages';
  stageId?: string;
  chapter?: number;
  detail: string;
}

export interface DifficultyReport {
  audits: readonly StageAudit[];
  violations: readonly Violation[];
  /** 无脑基线能连续推进到第几章（卡在第 N 章 Boss 则为 N-1） */
  mindlessDepth: number;
  /** 纯数值关总数 */
  plainStageCount: number;
  /** 各章 Boss 的换队收益（针对队相对通用队节省的回合比例） */
  swapEdgeByChapter: Readonly<Record<number, number>>;
}

/** 无脑基线连续通关到的最深章节：第一个打不过的 Boss 之前那一章 */
function mindlessDepthOf(audits: readonly StageAudit[]): number {
  const bossByChapter = new Map<number, StageAudit>();
  for (const a of audits) if (a.kind === 'boss') bossByChapter.set(a.chapter, a);
  let depth = 0;
  for (let ch = 1; ch <= Math.max(...bossByChapter.keys()); ch++) {
    const boss = bossByChapter.get(ch);
    if (!boss || !boss.results.mindless.win) break;
    depth = ch;
  }
  return depth;
}

/** ① TTK 下限：中手达标队不许秒推 */
function checkTtkFloor(audits: readonly StageAudit[]): Violation[] {
  const out: Violation[] = [];
  for (const a of audits) {
    if (TTK_FLOOR_EXEMPT.includes(a.stageId)) continue;
    const floor = TTK_FLOOR[a.kind];
    /*
     * 下限必须按**最快的那一档**判定。
     *
     * v0.8 前这里读的是中手，于是护栏永远绿：中手确实要打 4~6 回合。但同一批关卡
     * 换高手跑，128 关全部三星、29% 的普通关 2 回合结束——玩家熟练之后看到的是那个世界，
     * 护栏却一直在量另一个。用中手定「秒推」下限，等于承诺「只要有人打得慢就不算简单」，
     * 这正是旧体系测不出「太简单」的同一个毛病。
     */
    const fastest = a.results.high;
    if (fastest.win && fastest.turnsUsed < floor) {
      out.push({
        rule: 'ttkFloor',
        stageId: a.stageId,
        chapter: a.chapter,
        detail: `高手 ${fastest.turnsUsed} 回合通关，低于 ${a.kind} 下限 ${floor}（秒推）`,
      });
    }
  }
  return out;
}

/**
 * ①b TTK 上限：中手达标队也不许被磨死。
 *
 * 与下限成对，两条一起才算「难度带」。只钉下限的话，每次为了消灭秒推而加压，
 * 都可能悄悄把某些关推到几十回合——那不是变难，是变得难熬。
 * 上限沿用 powerBudget 的既有口径（带闸门的关卡按设计要多花回合，故额外放宽）。
 */
function checkTtkCeiling(
  audits: readonly StageAudit[],
  counterRuns: Readonly<Record<string, SimResult>>,
): Violation[] {
  const out: Violation[] = [];
  for (const a of audits) {
    const band = stageTtkFor(a.kind, a.gated, a.waves);
    /*
     * 章末 Boss 按「针对队」验收，铺垫关按「通用队」验收。
     *
     * 通用队在 Boss 关被卡住不是失败，那正是同源相斥与 archetype 想要的效果——
     * 「这一场得换阵容」。真正不可接受的是**换了也过不去**，那是超出中度难度目标。
     * 这条界线要是不划，护栏就会反过来逼着把每个 Boss 都调成通用队能顺推，
     * 于是又回到「一队通关」的老样子。
     */
    const mid = a.kind === 'boss' ? (counterRuns[a.stageId] ?? a.results.mid) : a.results.mid;
    if (!mid.win) {
      out.push({
        rule: 'ttkCeiling',
        stageId: a.stageId,
        chapter: a.chapter,
        detail: a.kind === 'boss'
          ? `换上针对队仍打不过（${mid.turnsUsed} 回合未通关）`
          : `中手达标队打不过（${mid.turnsUsed} 回合未通关）`,
      });
      continue;
    }
    if (mid.turnsUsed > band.max) {
      out.push({
        rule: 'ttkCeiling',
        stageId: a.stageId,
        chapter: a.chapter,
        detail: `中手 ${mid.turnsUsed} 回合，超出 ${a.kind} 上限 ${band.max}（磨人）`,
      });
    }
  }
  return out;
}

/** ② 无脑基线墙：指定章节起，不动脑的玩法必须打不过 Boss */
function checkMindlessWall(audits: readonly StageAudit[]): Violation[] {
  const out: Violation[] = [];
  for (const a of audits) {
    if (a.kind !== 'boss') continue;
    if (a.chapter < MINDLESS_WALL_CHAPTER) continue;
    if (a.results.mindless.win) {
      out.push({
        rule: 'mindlessWall',
        stageId: a.stageId,
        chapter: a.chapter,
        detail: `第 ${a.chapter} 章 Boss 被无脑基线 ${a.results.mindless.turnsUsed} 回合通关`,
      });
    }
  }
  return out;
}

/** ③ 换队收益：针对队必须明显优于通用队 */
function checkTeamSwapEdge(): {
  violations: Violation[];
  edges: Record<number, number>;
  /** 各 Boss 关针对队的实测结果，供 TTK 上限按「换队后」口径复用 */
  counterRuns: Record<string, SimResult>;
} {
  const violations: Violation[] = [];
  const edges: Record<number, number> = {};
  const counterRuns: Record<string, SimResult> = {};
  const bosses = STAGES.filter((s) => s.isBoss || s.type === 'boss');

  for (const stage of bosses) {
    if (stage.chapter < TEAM_SWAP_EDGE_FROM_CHAPTER) continue;
    const generic = simulateBattle(genericTeam(stage.chapter), stage.id, COMBO_MODELS.mid);
    const counter = bestCounterRun(stage);
    counterRuns[stage.id] = counter;

    // 通用队打不过、针对队打得过 —— 换队收益拉满，直接达标
    if (!generic.win && counter.win) {
      edges[stage.chapter] = 1;
      continue;
    }
    if (!generic.win && !counter.win) {
      violations.push({
        rule: 'teamSwapEdge',
        stageId: stage.id,
        chapter: stage.chapter,
        detail: '通用队与针对队都打不过，该关超出中度难度目标',
      });
      edges[stage.chapter] = 0;
      continue;
    }

    const edge = (generic.turnsUsed - counter.turnsUsed) / generic.turnsUsed;
    edges[stage.chapter] = Math.round(edge * 1000) / 1000;
    if (edge < TEAM_SWAP_EDGE_MIN) {
      violations.push({
        rule: 'teamSwapEdge',
        stageId: stage.id,
        chapter: stage.chapter,
        detail: `针对队仅快 ${(edge * 100).toFixed(1)}%（通用 ${generic.turnsUsed} → 针对 ${counter.turnsUsed}），`
          + `低于下限 ${(TEAM_SWAP_EDGE_MIN * 100).toFixed(0)}%：换队没有意义`,
      });
    }
  }
  return { violations, edges, counterRuns };
}

/** ④ 机制密度：不许再出现大片纯数值关 */
function checkMechanicDensity(audits: readonly StageAudit[]): Violation[] {
  const out: Violation[] = [];
  const byChapter = new Map<number, StageAudit[]>();
  for (const a of audits) {
    const list = byChapter.get(a.chapter) ?? [];
    list.push(a);
    byChapter.set(a.chapter, list);
  }
  for (const [chapter, list] of [...byChapter].sort((a, b) => a[0] - b[0])) {
    const withMechanic = list.filter((a) => !a.plain).length;
    const need = chapter === 1
      ? MECHANIC_DENSITY.tutorialChapterRelaxTo
      : MECHANIC_DENSITY.minMechanicStagesPerChapter;
    if (withMechanic < need) {
      out.push({
        rule: 'mechanicDensity',
        chapter,
        detail: `第 ${chapter} 章仅 ${withMechanic}/${list.length} 关带机制，低于下限 ${need}`,
      });
    }
  }
  return out;
}

/** 跑一次全量难度审计 */
export function auditDifficulty(): DifficultyReport {
  const audits = STAGES.map(auditStage);
  const swap = checkTeamSwapEdge();

  const mindlessDepth = mindlessDepthOf(audits);
  const plainStageCount = audits.filter((a) => a.plain).length;

  const violations: Violation[] = [
    ...checkTtkFloor(audits),
    ...checkTtkCeiling(audits, swap.counterRuns),
    ...checkMindlessWall(audits),
    ...swap.violations,
    ...checkMechanicDensity(audits),
  ];

  if (mindlessDepth > MINDLESS_MAX_DEPTH) {
    violations.push({
      rule: 'mindlessDepth',
      detail: `无脑基线可推进到第 ${mindlessDepth} 章，超过上限第 ${MINDLESS_MAX_DEPTH} 章`,
    });
  }

  if (plainStageCount > MECHANIC_DENSITY.maxPlainStages) {
    violations.push({
      rule: 'plainStages',
      detail: `纯数值关 ${plainStageCount} 关，超过上限 ${MECHANIC_DENSITY.maxPlainStages}`,
    });
  }

  return {
    audits,
    violations,
    mindlessDepth,
    plainStageCount,
    swapEdgeByChapter: swap.edges,
  };
}

/** 人类可读的审计摘要（调参时 console 打印 / dashboard 展示） */
export function formatDifficultyReport(report: DifficultyReport): string {
  const lines: string[] = [];
  lines.push(`纯数值关：${report.plainStageCount} 关`);
  lines.push(`无脑基线推进深度：第 ${report.mindlessDepth} 章（上限 ${MINDLESS_MAX_DEPTH}）`);
  const edges = Object.entries(report.swapEdgeByChapter)
    .map(([ch, e]) => `${ch}:${(e * 100).toFixed(0)}%`)
    .join(' ');
  lines.push(`换队收益（按章）：${edges}`);
  lines.push(`违规 ${report.violations.length} 条`);
  for (const v of report.violations) {
    lines.push(`  [${v.rule}] ${v.stageId ?? `第${v.chapter}章`} — ${v.detail}`);
  }
  return lines.join('\n');
}
