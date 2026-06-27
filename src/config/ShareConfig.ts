/** 微信分享文案与图片（须为包内静态路径，体验版/正式版不支持 wxfile:// 临时图） */
export const SHARE_IMAGES = {
  default: 'images/share/share_default.jpg',
} as const;

export const SHARE_TITLES = {
  appMessage: '灵宠消消塔2 — 转珠消消+灵宠养成，来挑战！',
  timeline: '灵宠消消塔2，越玩越上头',
} as const;

export function buildShareQuery(source: string): string {
  return `from=share&source=${encodeURIComponent(source)}`;
}

export interface SharePayload {
  title: string;
  imageUrl: string;
  query: string;
}

export function buildSharePayload(source: string, mode: 'friend' | 'timeline' = 'friend'): SharePayload {
  return {
    title: mode === 'timeline' ? SHARE_TITLES.timeline : SHARE_TITLES.appMessage,
    imageUrl: SHARE_IMAGES.default,
    query: buildShareQuery(source),
  };
}
