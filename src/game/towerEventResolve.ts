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
  PlayerData.towerAdvance(floor, hpPct, PlayerData.tower.runCds);
  reportQuest('towerFloor');
}

export interface TowerEventOutcome {
  /** 展示用结果行 */
  lines: string[];
  /** 结算后的续战血量比例 */
  hpPct: number;
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
  const lines: string[] = [];
  const fx = event.effect;

  switch (fx.kind) {
    case 'heal': {
      const before = PlayerData.tower.runHpPct;
      const after = PlayerData.adjustTowerRunHp(fx.pct);
      lines.push(`生命回复至 ${Math.round(after * 100)}%（+${Math.round((after - before) * 100)}%）`);
      break;
    }
    case 'trade': {
      PlayerData.adjustTowerRunHp(-fx.hpCost);
      const got = PlayerData.grantRandomTowerBlesses(fx.count, rng);
      lines.push(`折损 ${Math.round(fx.hpCost * 100)}% 生命`);
      lines.push(got.length > 0 ? `获得机缘：${got.map((g) => g.name).join('、')}` : '机缘已尽，无所得');
      break;
    }
    case 'gamble': {
      if (rng() < fx.winChance) {
        const got = PlayerData.grantRandomTowerBlesses(1, rng, { guardFloor: true });
        lines.push(got.length > 0 ? `试炼得手 · ${got[0].name}` : '试炼得手，但机缘已尽');
      } else {
        PlayerData.adjustTowerRunHp(-fx.hpCost);
        lines.push(`试炼失手 · 折损 ${Math.round(fx.hpCost * 100)}% 生命`);
      }
      break;
    }
    case 'coins': {
      const got = PlayerData.addTowerCoins(fx.amount);
      lines.push(`登塔印记 +${got}`);
      break;
    }
    case 'reforge': {
      const dropped = PlayerData.dropRandomTowerBless(rng);
      const got = PlayerData.grantRandomTowerBlesses(fx.count, rng);
      lines.push(dropped ? `舍去 ${dropped.name}` : '身无机缘可舍，炉火自燃');
      lines.push(got.length > 0 ? `重铸得：${got.map((g) => g.name).join('、')}` : '重铸无果');
      break;
    }
    default:
      break;
  }

  const hpPct = PlayerData.tower.runHpPct;
  advanceAfterNonCombat(floor, hpPct);
  analytics.track('tower_event_resolve', { floor, event_id: event.id });
  return { lines, hpPct };
}

/** 休整层结算：回血并推进层数 */
export function resolveTowerRest(floor: number): TowerEventOutcome {
  const before = PlayerData.tower.runHpPct;
  const after = PlayerData.adjustTowerRunHp(TOWER_REST_HEAL_PCT);
  advanceAfterNonCombat(floor, after);
  analytics.track('tower_rest', { floor });
  return {
    lines: [`静室调息 · 生命回复至 ${Math.round(after * 100)}%（+${Math.round((after - before) * 100)}%）`],
    hpPct: after,
  };
}
