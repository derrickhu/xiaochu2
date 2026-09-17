/**
 * 通天塔总榜数据源（全平台统一走云端）。
 *
 * 写：本地层数 / 资料变了才上报（脏标记）；打开排行只拉榜。
 * 读：成功结果进缓存，打开先画缓存再后台拉最新。
 */
import { BackendService } from '@/core/BackendService';
import { Platform } from '@/core/PlatformService';
import { scopedStorageKey } from '@/config/gameKeyScope';
import { applyHostProfile, resolveHomeIdentity } from './rankHostProfile';
import { localSelfEntry, type RankEntry } from './rankBoard';

export interface CloudRankResult {
  items: RankEntry[];
  self: RankEntry | null;
}

export interface CloudRankSnapshot {
  floor: number;
  name: string;
  avatarUrl: string;
}

const LIST_CACHE_KEY = scopedStorageKey('rank_list');
const REPORT_SNAP_KEY = scopedStorageKey('rank_snap');

let memList: CloudRankResult | null = null;
let memSnap: CloudRankSnapshot | null = null;

export function cloudRankSnapshotOf(
  floor: number,
  identity = resolveHomeIdentity(),
): CloudRankSnapshot {
  return {
    floor: Math.max(0, Math.floor(Number(floor) || 0)),
    name: identity.name || '',
    avatarUrl: identity.avatarUrl || '',
  };
}

/** 从没上报过且还是 0 层：不用打空包。其余层数 / 昵称 / 头像变了才写。 */
export function isCloudRankDirty(
  current: CloudRankSnapshot,
  last: CloudRankSnapshot | null,
): boolean {
  if (!last) return current.floor > 0;
  return current.floor !== last.floor
    || current.name !== last.name
    || (current.avatarUrl || '') !== (last.avatarUrl || '');
}

export function parseRankListCache(raw: unknown): CloudRankResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { items?: unknown; self?: unknown };
  if (!Array.isArray(rec.items)) return null;
  const items = rec.items.map(toEntry).filter((row): row is RankEntry => !!row);
  const self = rec.self ? toEntry(rec.self) : null;
  return { items, self };
}

export function parseCloudRankSnapshot(raw: unknown): CloudRankSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const floor = Math.floor(Number(rec.floor));
  if (!Number.isFinite(floor) || floor < 0) return null;
  return {
    floor,
    name: String(rec.name || ''),
    avatarUrl: String(rec.avatarUrl || ''),
  };
}

export function readRankListCache(): CloudRankResult | null {
  if (memList) return memList;
  const parsed = parseRankListCache(readJson(LIST_CACHE_KEY));
  if (parsed) memList = parsed;
  return parsed;
}

export function writeRankListCache(result: CloudRankResult): void {
  memList = result;
  writeJson(LIST_CACHE_KEY, {
    items: result.items,
    self: result.self,
  });
}

export function readCloudRankSnapshot(): CloudRankSnapshot | null {
  if (memSnap) return memSnap;
  const parsed = parseCloudRankSnapshot(readJson(REPORT_SNAP_KEY));
  if (parsed) memSnap = parsed;
  return parsed;
}

export function rememberCloudRankSnapshot(snap: CloudRankSnapshot): void {
  memSnap = snap;
  writeJson(REPORT_SNAP_KEY, snap);
}

export function resetRankCloudStateForTest(): void {
  memList = null;
  memSnap = null;
  try {
    Platform.removeStorageSync(LIST_CACHE_KEY);
    Platform.removeStorageSync(REPORT_SNAP_KEY);
  } catch {
    /* 测试环境可能没有宿主存储 */
  }
}

export async function reportCloudTowerRank(bestFloor: number): Promise<boolean> {
  if (!BackendService.available) return false;
  const snap = cloudRankSnapshotOf(bestFloor);
  try {
    await BackendService.ensureToken();
    await BackendService.reportTowerRank({
      floor: snap.floor,
      name: snap.name,
      avatarUrl: snap.avatarUrl,
    });
    rememberCloudRankSnapshot(snap);
    return true;
  } catch (error) {
    console.warn('[Rank] 云榜上报失败', error);
    return false;
  }
}

/** 层数或资料没变就跳过，给破纪录 / 定时巡检用 */
export async function reportCloudTowerRankIfDirty(bestFloor: number): Promise<boolean> {
  const current = cloudRankSnapshotOf(bestFloor);
  if (!isCloudRankDirty(current, readCloudRankSnapshot())) return true;
  return reportCloudTowerRank(bestFloor);
}

/** 手动刷新：强制同步自己，再拉最新名单 */
export async function refreshCloudTowerRank(selfFloor: number): Promise<CloudRankResult> {
  await reportCloudTowerRank(selfFloor);
  return fetchCloudTowerRank(selfFloor);
}

function toEntry(row: {
  rank?: unknown;
  name?: unknown;
  floor?: unknown;
  avatarUrl?: unknown;
  isSelf?: unknown;
}): RankEntry | null {
  const floor = Math.floor(Number(row.floor));
  if (!Number.isFinite(floor) || floor <= 0) return null;
  return {
    rank: Number(row.rank) || 0,
    name: String(row.name || '玩家'),
    floor,
    isSelf: !!row.isSelf,
    avatarUrl: String(row.avatarUrl || '').trim() || undefined,
  };
}

function localFallback(selfFloor: number): CloudRankResult {
  const identity = resolveHomeIdentity();
  const self = applyHostProfile(localSelfEntry(selfFloor), {
    name: identity.name,
    avatarUrl: identity.avatarUrl || '',
  });
  return { items: self ? [self] : [], self };
}

function cachedOrLocal(selfFloor: number): CloudRankResult {
  return readRankListCache() ?? localFallback(selfFloor);
}

export async function fetchCloudTowerRank(selfFloor: number): Promise<CloudRankResult> {
  if (!BackendService.available) return cachedOrLocal(selfFloor);
  try {
    await BackendService.ensureToken();
    const res = await BackendService.listTowerRank(10);
    const rows = Array.isArray(res?.items) ? res.items : [];
    const items = rows.map(toEntry).filter((row): row is RankEntry => !!row);
    const self = (res?.self ? toEntry(res.self) : null)
      ?? items.find((row) => row.isSelf)
      ?? null;
    const result = { items, self };
    writeRankListCache(result);
    return result;
  } catch (error) {
    console.warn('[Rank] 云榜拉取失败', error);
    return cachedOrLocal(selfFloor);
  }
}

function readJson(key: string): unknown {
  try {
    const raw = Platform.getStorageSync(key);
    if (!raw) return null;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    Platform.setStorageSync(key, JSON.stringify(value));
  } catch {
    /* 存储满了不影响玩 */
  }
}
