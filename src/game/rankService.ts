/**
 * 通天塔排行榜（业务层）
 *
 * 方案见 docs/07-抖音排行榜.md。这里只做一件事：把 `tower.bestFloor` 推出去。
 * 云榜（全平台，榜单展示的唯一数据源）在层数 / 资料变化时写；抖音官方 IM 榜只是顺手留一份，
 * 界面不读它，为的是将来还能用抖音原生榜入口。
 *
 * 不进 PlayerData：那边改 bestFloor 的地方有三处，循环依赖犯不着；
 * 调用方在成绩落地之后 `queueTowerRankSync()` 即可。
 * 云榜只在层数 / 资料变化时写；打开排行只拉缓存 + 名单，刷新按钮才强制同步自己。
 */
import { Platform } from '@/core/PlatformService';
import { PlayerData } from './PlayerData';
import { analytics } from '@/analytics';
import { reportCloudTowerRankIfDirty } from './rankCloud';

export const TOWER_RANK = {
  title: '通天塔最高层',
  suffix: '层',
  dataType: 0,
  rankType: 'all' as const,
  relationType: 'default' as const,
};

const SYNC_PREFIX = 'xc2.rank.towerBest.';

/** 开发者工具走 test，避免把调试分写进线上 default */
export function resolveRankZoneId(isDevtools: boolean): 'test' | 'default' {
  return isDevtools ? 'test' : 'default';
}

export function shouldWriteTowerBest(bestFloor: number, lastSynced: number): boolean {
  return bestFloor > 0 && bestFloor !== lastSynced;
}

/** 上榜用的层数：历史最高，其次本轮已结算层（避免只进过塔但 best 还是 0） */
export function towerRankFloor(
  tower: { bestFloor: number; runReachedFloor: number } = PlayerData.tower,
): number {
  return Math.max(0, tower.bestFloor, tower.runReachedFloor);
}

function zoneId(): 'test' | 'default' {
  return resolveRankZoneId(Platform.isDevtools);
}

function syncKey(): string {
  return SYNC_PREFIX + zoneId();
}

export function lastSyncedTowerBest(): number {
  const raw = Platform.getStorageSync(syncKey());
  if (raw == null || raw === '') return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function markTowerBestSynced(bestFloor: number): void {
  Platform.setStorageSync(syncKey(), String(bestFloor));
}

/** 测试 / GM：忘掉上次写入，下次 sync 会再打一次 */
export function clearTowerRankSync(): void {
  Platform.removeStorageSync(syncKey());
}

const ENTRY_SEEN_KEY = 'xc2.rank.entrySeen';

export function hasSeenRankEntry(): boolean {
  return Platform.getStorageSync(ENTRY_SEEN_KEY) === '1';
}

export function markRankEntrySeen(): void {
  Platform.setStorageSync(ENTRY_SEEN_KEY, '1');
}

let _pending = false;
let _running = false;

/**
 * 成绩落地后调用。自己合并并发：写榜期间又破纪录，写完会再推一次当前值。
 * 失败静默，不挡爬塔。
 */
export function queueTowerRankSync(): void {
  _pending = true;
  void pumpRankSync();
}

async function pumpRankSync(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    while (_pending) {
      _pending = false;
      await syncTowerBest(towerRankFloor());
    }
  } finally {
    _running = false;
    if (_pending) void pumpRankSync();
  }
}

/** 后台巡检间隔：自己层数 / 资料变了才上报，不轮询拉榜 */
export const CLOUD_RANK_WATCH_MS = 60_000;

let _watchTimer: ReturnType<typeof setInterval> | null = null;

export function startCloudRankWatch(): void {
  if (_watchTimer != null) return;
  void reportCloudTowerRankIfDirty(towerRankFloor());
  _watchTimer = setInterval(() => {
    void reportCloudTowerRankIfDirty(towerRankFloor());
  }, CLOUD_RANK_WATCH_MS);
}

export function stopCloudRankWatchForTest(): void {
  if (_watchTimer == null) return;
  clearInterval(_watchTimer);
  _watchTimer = null;
}

export async function syncTowerBest(bestFloor: number): Promise<boolean> {
  try {
    await reportCloudTowerRankIfDirty(bestFloor);
  } catch (e) {
    console.warn('[Rank] 云榜上报失败', e);
  }
  // 官方榜写不进去不影响展示，榜单只读云榜
  if (!Platform.isDouyin || Platform.isHarmony) return false;
  if (bestFloor <= 0) return false;
  if (!shouldWriteTowerBest(bestFloor, lastSyncedTowerBest())) return false;
  const loggedIn = await Platform.ensureLogin();
  if (!loggedIn) return false;
  const ok = await Platform.setImRankData({
    dataType: TOWER_RANK.dataType,
    value: String(bestFloor),
    priority: 0,
    extra: `floor=${bestFloor}`,
    zoneId: zoneId(),
  });
  if (ok) {
    markTowerBestSynced(bestFloor);
    analytics.track('rank_tower_write', { floor: bestFloor, zone: zoneId() });
  }
  return ok;
}

/**
 * 拉起抖音官方原生榜。非抖音只提示。
 * 打开前先补写，避免「刚破纪录点开却还是旧分」。
 */
export async function openOfficialTowerRank(
  relationType: 'default' | 'friend' | 'all' = TOWER_RANK.relationType,
): Promise<void> {
  if (!Platform.isDouyin) {
    Platform.showToast('当前渠道暂不支持排行榜');
    return;
  }
  await syncTowerBest(towerRankFloor());
  const loggedIn = await Platform.ensureLogin();
  if (!loggedIn) {
    Platform.showToast('登录后才能看排行榜');
    return;
  }
  analytics.track('rank_tower_open', {
    floor: towerRankFloor(),
    zone: zoneId(),
    relation: relationType,
  });
  const ok = await Platform.getImRankList({
    relationType,
    dataType: TOWER_RANK.dataType,
    rankType: TOWER_RANK.rankType,
    suffix: TOWER_RANK.suffix,
    rankTitle: TOWER_RANK.title,
    zoneId: zoneId(),
  });
  if (!ok) Platform.showToast('暂时打不开排行榜');
}

export async function openTowerRank(): Promise<void> {
  return openOfficialTowerRank();
}
