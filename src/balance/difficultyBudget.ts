/**
 * 难度契约真源（v0.7 新建，纯数据 + 纯函数，零依赖）
 *
 * ── 为什么要有这张表 ──
 *
 * 旧配平体系（powerBudget.STAGE_TTK + simulation 契约）只回答两个问题：
 *   「达标队能不能过？」「会不会打太久？」
 * 它的每一条断言都是**上限**——turns ≤ max、达标必胜。于是无论数值怎么漂，
 * 只要没变得更难，测试永远全绿。STAGE_TTK.min 字段甚至从定义之日起就没被断言过。
 * 「主线太简单」不是配错了阈值，是这套尺子**在结构上就量不到这个维度**。
 *
 * 这张表补上缺失的另一半，四条护栏各自钉死一种「太简单」：
 *   ① TTK 下限     —— 达标队不许秒推（对抗数值膨胀）
 *   ② 无脑基线墙   —— 不看机制、不放技能、不换队的玩法必须在指定章节撞墙（对抗机制缺位）
 *   ③ 换队收益下限 —— 针对性配队必须显著优于万能队（对抗「一队通关」）
 *   ④ 机制密度下限 —— 不许再出现大片纯数值关（对抗关卡设计偷懒）
 *
 * 难度目标：**中度**。按锚点养成 + 会看机制的玩家顺推；无脑玩家从第 4 章起明显卡住，
 * 需要停下来补养成或换阵容，但不至于要求每关解谜。
 */
import type { TtkStageKind } from './powerBudget';

/**
 * ── 玩家画像 ──
 *
 * `mindless` 代表「完全不动脑」的玩法——见珠就拖、不放技能、不理会闸门提示、全程一队到底。
 * 「游戏太简单」的准确定义就是：这一档能推得太远。
 *
 * `newbie` / `rookie` 是 v1.0 补的**下限档**，来自抖音首发日的线上归因：
 * 那天 4476 个新号里 94.5% 一关都没过，第一关按尝试次数口径只有 12.8% 的通过率。
 * 复盘发现根因不在关卡也不在引导，而在这份画像表本身——
 * 当时最菜的 `mindless` 参数是 `combo: 3`，即**假设玩家每回合都能稳定消掉 3 组珠**。
 * 从信息流进来、第一次见转珠的人在 12 秒限时里通常只拖得出 1 组，甚至空手。
 * 于是整套护栏虽然全绿，却没有任何一条在描述真实的新玩家。
 *
 * 这两档存在的意义与 `mindless` 恰好相反：`mindless` 用来验证**过不了**（防太简单），
 * 它们用来验证**过得了**（防劝退）。两头都钉住，难度才有区间可言。
 */
export type PlayerProfile = 'newbie' | 'rookie' | 'mindless' | 'low' | 'mid' | 'high';

export const PLAYER_PROFILE_NAME: Readonly<Record<PlayerProfile, string>> = {
  newbie: '真新手1C',
  rookie: '生手2C',
  mindless: '无脑基线3C',
  low: '低手3C',
  mid: '中手5C',
  high: '高手7C',
};

/**
 * ── ① TTK 下限（中手达标队口径）──
 *
 * 与 powerBudget.STAGE_TTK.max 成对使用：max 防止磨人，min 防止秒推。
 * 旧表里 min 是死字段（normal 2 / boss 6 从未被断言），这里重新定标并真正接入门禁。
 *
 * 取值依据：一场战斗要「有来有回」，玩家至少得经历
 *   进场 → 敌人出一次手 → 调整 → 收尾
 * 普通关 3 回合是这个循环的最小长度；Boss 关 8 回合保证蓄力/转阶段/闸门至少各触发一次。
 */
export const TTK_FLOOR: Readonly<Record<TtkStageKind, number>> = {
  normal: 3,
  elite: 4,
  boss: 8,
};

/**
 * TTK 下限的豁免关卡。
 *
 * 只有全游戏第一场战斗在列：那一关的职能是「让玩家知道拖珠会打出伤害」，
 * 秒杀正是想要的反馈。把它也拉到 3 回合只会让开场变拖沓。
 * 这份名单要一直保持只有一两条——每多一条豁免，护栏就少管一块地方。
 *
 * 注：第 1 章已被下面的整章豁免覆盖，这条留着是为了给别的章节开一次性口子时有地方写。
 */
export const TTK_FLOOR_EXEMPT: readonly string[] = ['stage_1_1'];

/**
 * TTK 下限整章豁免的章节（含）。
 *
 * v1.0 新增，用来解掉护栏内部的一处**数学矛盾**，不是为了放水：
 *
 * TTK 下限按高手（7C、4 连）判定「不许秒推」，而 ①c 早期下限按 1C~3C 判定「不许劝退」。
 * 两档的输出差在 4.7 倍以上，于是同一关同时满足「高手 ≥ 3 回合」和「生手 ≤ 13 回合」
 * 需要 HP 既大于 3×高手每回合输出、又小于 13×生手每回合输出 —— 这个区间是空的。
 * 实测第 1 章有 4 关无论怎么配都落不进去。
 *
 * 教学章里这个矛盾只有一个合理解法：让防劝退优先。高手用 2 回合清掉第 1 章不是问题，
 * 他们本来就不是这一章的受众；新玩家被第 1 关挡住才是问题。
 * 第 2 章起两条护栏不再冲突（那时下限只要求 3C），秒推下限照常生效。
 */
export const TTK_FLOOR_EXEMPT_THROUGH_CHAPTER = 1;

/**
 * ── ①b 早期下限（v1.0 新增，与 TTK 下限成对）──
 *
 * 旧契约的四条护栏全部朝一个方向：防止游戏太简单。于是「第一关就把 87% 的新号劝退」
 * 这种事一条都测不出来 —— 抖音首发日就是这么漏掉的，审计当时 0 违规。
 *
 * 这一条反过来钉住下限：**指定关卡必须能被指定的菜档打过去**。
 * 三级台阶对应「教学 → 上手 → 正常」：
 *
 * - `newbieStages`：真新手（1C）必须能自己打赢，且留血不低于 `newbieMinHpPct`。
 *   留血下限是必要的：勉强赢和轻松赢对新手是两种体验，剩 5% 血过关的人下一关照样走。
 * - 第 1 章其余非 Boss 关：生手（2C）必须能过。玩家打到这里已经消了十几回合，
 *   手上功夫理应从 1C 长到 2C，但还谈不上会看机制。
 * - 第 1 章 Boss：无脑档（3C）必须能过。第一章的墙会直接砸在「还没建立循环」的人身上，
 *   真正的墙从 MINDLESS_WALL_CHAPTER 起才立。
 *
 * 与 ② 无脑基线墙不冲突：那条管的是「第 4 章起 mindless 不许过」，
 * 这条管的是「第 1 章 mindless 必须过」，两条一起把无脑档的推进深度夹在 1~3 章。
 */
export interface EarlyFloorSpec {
  stageId: string;
  /** 必须能通关这一关的最菜画像 */
  profile: PlayerProfile;
  /** 该画像通关时的回合上限（只要求「过得了」是不够的，磨 50 回合也是劝退） */
  maxTurns: number;
  /** 该画像通关后的剩余血量下限（惨胜和轻松赢对新手是两种体验） */
  minHpPct: number;
}

/**
 * 逐关下限。分三段，对应技巧的真实成长节奏 1C → 2C → 3C：
 *
 * - 1-1 / 1-2 教学段：`newbie`。此时玩家还在找「按住珠子拖一条路」的手感。
 * - 1-3 / 1-4 上手段：`rookie`。已经能稳定连到 2 组，但不会放技能、不看闸门。
 * - 1-5 起：`mindless`（3C）。打过十几场之后该有的水平，也正好接上 ② 无脑基线墙的口径
 *   —— 那条要求 mindless 从第 4 章起过不去，这条要求它在第 1、2 章必须过得去，
 *   两条一起把无脑档的推进深度夹在 1~3 章，而不是像首发版那样连第 1 关都过不去。
 *
 * 第 2 章只挂非 Boss 关：章 Boss 是允许卡人的地方，铺垫关不是。
 */
export const EARLY_FLOOR: readonly EarlyFloorSpec[] = [
  { stageId: 'stage_1_1', profile: 'newbie', maxTurns: 7, minHpPct: 0.65 },
  { stageId: 'stage_1_2', profile: 'newbie', maxTurns: 12, minHpPct: 0.50 },
  { stageId: 'stage_1_3', profile: 'rookie', maxTurns: 13, minHpPct: 0.35 },
  { stageId: 'stage_1_4', profile: 'rookie', maxTurns: 13, minHpPct: 0.30 },
  { stageId: 'stage_1_5', profile: 'mindless', maxTurns: 12, minHpPct: 0.30 },
  { stageId: 'stage_1_6', profile: 'mindless', maxTurns: 12, minHpPct: 0.25 },
  { stageId: 'stage_1_7', profile: 'mindless', maxTurns: 13, minHpPct: 0.25 },
  { stageId: 'stage_1_8', profile: 'mindless', maxTurns: 20, minHpPct: 0.10 },
];

/**
 * 除逐关表之外的兜底：第 2 章的**非 Boss** 关必须能被这一档打过去。
 * 第 2 章接手第 1 章毕业的玩家，铺垫关不该成为第二道劝退墙。
 *
 * 用 `low` 而不是 `mindless`：`mindless` 的闸门满足率按定义是 0，而第 2 章有 3 关带
 * `gate_*`。要求一个「从不理会闸门」的画像通过闸门关，是拿护栏去否定关卡设计本身，
 * 只会逼着把闸门拆掉。`low` 同样是 3C、同样不放技能，但会碰机制。
 *
 * 只管**无机制标签**的铺垫关。带 `orb_sealed` / `gate_*` 的挑战关正是设计上
 * 「必须按机制打」的地方，而 `low` 的定义里 `useSkills: false` —— 用一个从不放技能的画像
 * 去判定封珠关是否劝退，判出来的是画像的短板，不是关卡的问题。
 *
 * 因此这条规则对第 2 章的实际覆盖只有 4 关（2-1/2-2/2-4/2-6），teeth 有限，
 * 主要作用是防回归：以后有人给这几关加数值时会被拦下。第 1 章的真实约束在上面那张逐关表。
 */
export const EARLY_FLOOR_FALLBACK = {
  throughChapter: 2,
  profile: 'low' as PlayerProfile,
} as const;

/**
 * ── ② 无脑基线墙 ──
 *
 * 从该章起，`mindless` 画像即便养成达标也**不允许**通关该章 Boss。
 * 第 4 章是刻意选的：前三章是教学（认五行、认心珠、认封珠），第 4 章是第一次
 * 「你得开始想了」。再早会劝退新手，再晚就是现在这个「前八章白给」的局面。
 */
export const MINDLESS_WALL_CHAPTER = 4;

/**
 * 无脑基线的最大推进深度：它能连续通关到第几章的 Boss。
 *
 * 不用「全 128 关的通关率」是因为那个口径会骗人——玩家卡在第 4 章 Boss 就根本
 * 到不了第 10 章，把第 10 章的关卡也算进「可通关」里毫无意义。真正要管的是
 * **推进链在哪里断掉**。
 */
export const MINDLESS_MAX_DEPTH = MINDLESS_WALL_CHAPTER - 1;

/**
 * ── ③ 换队收益下限 ──
 *
 * 量化「玩家需不需要动脑换阵容」。做法：同一个 Boss 分别用
 *   - 通用队：五行齐全、按章节锚点养成（大多数玩家的实际队伍）
 *   - 针对队：同等养成，但按 Boss 属性/archetype 挑对位特攻 + 克制色
 * 两者跑同一套模拟，比较回合数。
 *
 * 针对队至少要快这么多比例，否则说明「换队没用，堆数值就行」——
 * 这条是整份契约里**唯一直接对准用户原始诉求**（动态搭配不同宠物体系）的指标。
 *
 * v0.9 出珠改回与 xiao_chu 一致：盘面恒定五色+心珠，不再按上阵宠物收窄。
 * 旧 30% 下限有一半来自「针对队盘面更密」；那部分被玩家明确否定后，换队收益
 * 只剩克制倍率与覆盖死珠，实测章末大约 12%~70%。下限收到 10%，避免把「出珠
 * 跟宠物无关」又用关卡数值倒逼回去。
 */
export const TEAM_SWAP_EDGE_MIN = 0.10;

/** 从该章起开始要求换队收益（前三章教学期不作要求） */
export const TEAM_SWAP_EDGE_FROM_CHAPTER = 4;

/**
 * ── ④ 机制密度下限 ──
 *
 * 「纯数值关」= 无 mechanics 标签，且该关所有波次的敌人都没有技能、没有分阶段。
 * 这种关卡玩家除了拖珠没有任何决策，是「没挑战感」最直接的来源。
 * 现状 128 关里有 22 关如此（第 1~3 章的 24 关里就占了 14 关）。
 */
export const MECHANIC_DENSITY = {
  /** 每章至少这么多关要带机制（共 8 关） */
  minMechanicStagesPerChapter: 6,
  /** 全局允许的纯数值关总数 */
  maxPlainStages: 6,
  /** 第 1 章可放宽到这么多关带机制（教学章要留出认识棋盘的空间） */
  tutorialChapterRelaxTo: 3,
} as const;

/**
 * ── 敌人 archetype ──
 *
 * 用户诉求里点名的四类。旧实现里这四类只有数值差（HP/DEF 高低），机制上
 * tank/healer/support 共用 golemGuard（周期减伤，出现在 128 关中的 64 关）+ serpentHeal，
 * 所谓「防高型 / 回复型」其实是同两个技能换皮，玩家用同一套打法都能过。
 *
 * 这里把四类的**破解方式**钉死为互不相同——每一类都要求玩家做一件其他类不需要的事，
 * 这才是「换阵容」的需求来源。
 */
export type EnemyArchetype = 'burst' | 'bulwark' | 'fortress' | 'regen';

export interface ArchetypeSpec {
  kind: EnemyArchetype;
  name: string;
  /** 一句话说明这类怪逼玩家做什么（UI 图鉴与关卡预告共用） */
  counterplay: string;
  /** 该类必须具备的机制（Boss 组装时校验，防止又退化成 golemGuard 换皮） */
  requiredMechanics: readonly string[];
}

export const ARCHETYPES: Readonly<Record<EnemyArchetype, ArchetypeSpec>> = {
  burst: {
    kind: 'burst',
    name: '伤害型',
    counterplay: '蓄力回合内打断、减伤或护盾承接，硬吃必死',
    requiredMechanics: ['charge', 'enrage'],
  },
  bulwark: {
    kind: 'bulwark',
    name: '血厚型',
    counterplay: '单次高伤会被无效，靠多段、持续伤害与 5 连穿透磨',
    requiredMechanics: ['damageVoid', 'undying'],
  },
  fortress: {
    kind: 'fortress',
    name: '防高型',
    counterplay: '必须破防或走克制色，控制流直接失效',
    requiredMechanics: ['shield', 'resolve'],
  },
  regen: {
    kind: 'regen',
    name: '回复型',
    counterplay: '吸主色回血，必须备第二输出色并攒出爆发窗口',
    requiredMechanics: ['heal', 'elementAbsorb'],
  },
};

/**
 * 单一机制的关卡占用率上限。
 *
 * 直接针对 golemGuard 占 64/128 关这个具体问题：任何一个敌方技能出现在超过
 * 这个比例的关卡里，就说明机制层在偷懒，四类 archetype 又退化成了换皮。
 */
export const SINGLE_MECHANIC_STAGE_SHARE_CAP = 0.25;

/**
 * ── 横向 vs 纵向的收益比（数值体系的核心不变量）──
 *
 * 这是 v0.7 数值重做要守住的东西，也是「玩家为什么不动脑」的数学根源：
 * 旧版纵向（等级 × 星级）跨度 ×100，横向（羁绊 + 队长 + 特攻）不足 ×1.5，
 * 比值 66:1 —— 任何编队思考的收益都不如多练几级，理性玩家当然选择无脑升级。
 *
 * v0.7 压纵向到 ×45、抬横向到 ~×4，比值降到约 11:1。判据取「超额养成 10 级的收益」
 * 必须小于「针对性配队的收益」，这条一旦破了，无论关卡机制做得多花，
 * 玩家都会退回堆数值的老路。
 */
export const BUILD_VS_GRIND = {
  /** 5★L99 相对 1★L1 的三维跨度目标（petRoles/growth 调参对齐此值） */
  verticalSpanTarget: 45,
  /** 允许的相对偏差 */
  verticalSpanTolerance: 0.15,
  /** 超额养成 10 级带来的伤害增益上限（超过说明纵向仍然过陡） */
  tenLevelEdgeMax: 0.40,
  /** 针对性配队相对通用队的伤害增益下限（须高于 tenLevelEdgeMax） */
  counterPickEdgeMin: 0.60,
} as const;

/**
 * ── ⑤ 通天塔墙（v0.8）──
 *
 * 塔与主线共用 enemyStats，但难度曲线、杂兵池、跨层续战都是独立的；
 * 主线护栏管不到它。结果是主线加压后，1 级队仍能轻松摸到第 28 层。
 *
 * 契约目标：**塔必须比同进度主线更硬**。
 * - Lv1 无灵机撞在 F20 守关之前（玩家反馈的具体漏洞）
 * - 第 N 章入场锚点的中手，连续深度不得超过「本章等效层数 + 余量」
 * - 非守关层血量不得形成软段（旧池按层取模会把两只软怪叠在同一层）
 *
 * 口径一律「单场满血、无灵机」——灵机是塔的成长奖励，护栏测的是底盘够不够硬，
 * 不是把 roguelike 构筑也算进「太简单」。
 */
export const TOWER_WALL = {
  /** Lv1★1 高手连续可通关的最高层（含）；F20 守关必须过不去 */
  lv1HighMaxDepth: 19,
  /** Lv1★1 中手连续可通关的最高层（含） */
  lv1MidMaxDepth: 14,
  /**
   * 第 N 章入场锚点中手深度上限 = N × floorsPerChapter + slack。
   * slack=6：第 3 章锚点最多摸到 F30，真正的挑战仍在直登点之上。
   */
  chapterMidSlack: 6,
  /** 需要对照检查的章节锚点（再往后养成已经拉开，深度探针成本也高） */
  chapterAnchors: [1, 2, 3, 4, 5] as const,
  /** 连续深度探测上限 */
  probeMaxFloor: 40,
  /**
   * 非守关层合计 HP 不得低于前后邻域中位数的这个比例。
   * 旧 F28（蝠群+藤泥）只有邻层的 ~60%，1 级队就是从这里被放过去的。
   */
  softFloorHpRatio: 0.7,
  /** 软段扫描范围 */
  softFloorScanTo: 40,
} as const;
