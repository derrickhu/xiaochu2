/**
 * 事件层结算：把 balance/towerPath.ts 里的事件效果落到存档上。
 *
 * 事件层不打架，但也不白给 —— 每个事件都在「生命 / 机缘 / 印记」三者之间做交换。
 * 结算完直接推进层数，因此这里同时负责调用 towerAdvance。
 */
import { TOWER_REST_HEAL_PCT, type TowerEventDef } from '@/balance/towerPath';
import { PlayerData } from './PlayerData';
import { reportQuest } from './dailyQuestTracker';
import { analytics } from '@/analytics';

/**
 * 非战斗层的共同收尾：结印记、推层、记日常。
 *
 * 日常任务同样计数 —— 玩家确实爬上去了一层，而路径是随机给的，
 * 无法靠「一直选事件层」来刷进度。
 */
function advanceAfterNonCombat(floor: number, hpPct: number): void {
  PlayerData.towerSettleCoins(floor);
  PlayerData.towerAdvance(floor, hpPct, PlayerData.tower.runCharges);
  reportQuest('towerFloor');
}

export type TowerDeltaTone = 'loss' | 'gain' | 'neutral';

export interface TowerEventDelta {
  tone: TowerDeltaTone;
  label: string;
}

export interface TowerEventOutcome {
  /** 旁白：只讲故事，不重复数值 */
  flavor: string;
  /** 得失条目（UI 按 tone 上色） */
  deltas: TowerEventDelta[];
  /** 兼容旧调用：与 deltas.label 同步 */
  lines: string[];
  /** 结算后的续战血量比例 */
  hpPct: number;
  /** 本层未交手，下一层强制开战 */
  nextMustFight: boolean;
}

function addDelta(out: { deltas: TowerEventDelta[]; lines: string[] }, tone: TowerDeltaTone, label: string): void {
  out.deltas.push({ tone, label });
  out.lines.push(label);
}

/**
 * 结算一次事件并推进到下一层。
 *
 * @param floor 当前层
 */
export function resolveTowerEvent(
  event: TowerEventDef,
  floor: number,
  rng: () => number = Math.random,
): TowerEventOutcome {
  const bag: { deltas: TowerEventDelta[]; lines: string[] } = { deltas: [], lines: [] };
  const fx = event.effect;

  switch (fx.kind) {
    case 'heal': {
      const before = PlayerData.tower.runHpPct;
      const after = PlayerData.adjustTowerRunHp(fx.pct);
      addDelta(bag, 'gain', `生命 +${Math.round((after - before) * 100)}% · 现为 ${Math.round(after * 100)}%`);
      break;
    }
    case 'trade': {
      PlayerData.adjustTowerRunHp(-fx.hpCost);
      const got = PlayerData.grantRandomTowerBlesses(fx.count, rng);
      addDelta(bag, 'loss', `生命 −${Math.round(fx.hpCost * 100)}%`);
      if (got.length === 0) addDelta(bag, 'neutral', '机缘已尽，无所得');
      else for (const g of got) addDelta(bag, 'gain', `机缘 · ${g.name}`);
      break;
    }
    case 'gamble': {
      if (rng() < fx.winChance) {
        const got = PlayerData.grantRandomTowerBlesses(1, rng);
        if (got.length > 0) addDelta(bag, 'gain', `试炼得手 · ${got[0].name}`);
        else addDelta(bag, 'neutral', '试炼得手，但机缘已尽');
      } else {
        PlayerData.adjustTowerRunHp(-fx.hpCost);
        addDelta(bag, 'loss', `试炼失手 · 生命 −${Math.round(fx.hpCost * 100)}%`);
      }
      break;
    }
    case 'hurt': {
      PlayerData.adjustTowerRunHp(-fx.pct);
      addDelta(bag, 'loss', `生命 −${Math.round(fx.pct * 100)}%`);
      if (fx.coins && fx.coins > 0) {
        const got = PlayerData.addTowerCoins(fx.coins);
        addDelta(bag, 'gain', `登塔印记 +${got}`);
      }
      break;
    }
    case 'coins': {
      const got = PlayerData.addTowerCoins(fx.amount);
      addDelta(bag, 'gain', `登塔印记 +${got}`);
      break;
    }
    case 'reforge': {
      const dropped = PlayerData.dropRandomTowerBless(rng);
      if (!dropped) {
        addDelta(bag, 'neutral', '身无机缘可淬，炉火自熄');
        const got = PlayerData.addTowerCoins(6);
        if (got > 0) addDelta(bag, 'gain', `登塔印记 +${got}`);
        break;
      }
      const got = PlayerData.grantRandomTowerBlesses(fx.count, rng);
      addDelta(bag, 'loss', `舍去 ${dropped.name}`);
      if (got.length === 0) addDelta(bag, 'neutral', '重铸无果');
      else for (const g of got) addDelta(bag, 'gain', `重铸 · ${g.name}`);
      break;
    }
    default:
      break;
  }

  const hpPct = PlayerData.tower.runHpPct;
  advanceAfterNonCombat(floor, hpPct);
  analytics.track('tower_event_resolve', { floor, event_id: event.id });
  return { flavor: event.text, ...bag, hpPct, nextMustFight: true };
}

/** 休整层结算：回血并推进层数 */
export function resolveTowerRest(floor: number): TowerEventOutcome {
  const before = PlayerData.tower.runHpPct;
  const after = PlayerData.adjustTowerRunHp(TOWER_REST_HEAL_PCT);
  advanceAfterNonCombat(floor, after);
  analytics.track('tower_rest', { floor });
  const gain = `生命 +${Math.round((after - before) * 100)}% · 现为 ${Math.round(after * 100)}%`;
  return {
    flavor: '静室调息，养伤片刻。',
    deltas: [{ tone: 'gain', label: gain }],
    lines: [gain],
    hpPct: after,
    nextMustFight: true,
  };
}
