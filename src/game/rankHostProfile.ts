/**
 * 排行榜上的「自己」：宿主平台头像 / 昵称。
 * 拿到之后随层数一起上报云榜，别人才能在榜上看到真名真头像。
 */
import { Platform } from '@/core/PlatformService';
import type { RankEntry } from './rankBoard';

const CACHE_KEY = 'xc2.rank.hostProfile';

export interface HostProfile {
  name: string;
  avatarUrl: string;
}

/** 未拿到平台资料时的首页占位 */
export const HOME_GUEST_NAME = '仙灵小萌新';

export function resolveHomeIdentity(
  profile: HostProfile | null = readCachedHostProfile(),
): { name: string; avatarUrl: string | null } {
  const name = profile?.name?.trim();
  const avatarUrl = profile?.avatarUrl?.trim();
  return {
    name: name || HOME_GUEST_NAME,
    avatarUrl: avatarUrl || null,
  };
}

export function parseHostProfile(raw: unknown): HostProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const name = String(rec.name ?? rec.nickName ?? '').trim();
  const avatarUrl = String(rec.avatarUrl ?? '').trim();
  if (!name && !avatarUrl) return null;
  return { name, avatarUrl };
}

export function readCachedHostProfile(): HostProfile | null {
  const raw = Platform.getStorageSync(CACHE_KEY);
  if (!raw) return null;
  try {
    return parseHostProfile(JSON.parse(String(raw)));
  } catch {
    return parseHostProfile(raw);
  }
}

export function rememberHostProfile(profile: HostProfile): void {
  Platform.setStorageSync(CACHE_KEY, JSON.stringify({
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  }));
}

export function applyHostProfile(
  entry: RankEntry | null,
  profile: HostProfile | null,
): RankEntry | null {
  if (!entry || !profile) return entry;
  return {
    ...entry,
    name: profile.name || entry.name,
    avatarUrl: profile.avatarUrl || entry.avatarUrl,
  };
}

export async function ensureHostProfile(): Promise<HostProfile | null> {
  const cached = readCachedHostProfile();
  if (!Platform.isDouyin) return cached;
  const loggedIn = await Platform.ensureLogin();
  if (!loggedIn) return cached;
  const live = await Platform.getUserProfile();
  if (!live) return cached;
  const profile: HostProfile = {
    name: live.nickName || cached?.name || '',
    avatarUrl: live.avatarUrl || cached?.avatarUrl || '',
  };
  if (!profile.name && !profile.avatarUrl) return cached;
  rememberHostProfile(profile);
  return profile;
}
