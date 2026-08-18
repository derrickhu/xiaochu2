/**
 * 自定义字体解析：已预热用专用体，否则回退系统字体。
 *
 * Tap Android 没有苹方/黑体/雅黑/Avenir。font-family 栈里如果把不存在的名字放第一个，
 * 宿主 2D canvas 常常不会 fallback，字就变成空白或方块乱码。
 */
import { getBodyFontFamily, getCalligraphyFamily } from '@/core/FontService';
import { Platform } from '@/core/PlatformService';
import {
  FONT_FAMILY,
  FONT_FAMILY_DISPLAY,
} from './theme';

export function resolveSystemFontFamily(): string {
  if (Platform.isTaptap) return 'sans-serif';
  return FONT_FAMILY;
}

/** 战斗数字 / 飘字：微信可走紧缩西文，Tap 只用已加载正文字体或系统体 */
export function resolveLatinHudFontFamily(): string {
  const sys = resolveSystemFontFamily();
  const body = getBodyFontFamily();
  if (Platform.isTaptap) return body ? `${body}, ${sys}` : sys;
  return `"Avenir Next Condensed","Arial Black",${sys}`;
}

export function resolveCalligraphyFontFamily(): string {
  const loaded = getCalligraphyFamily();
  const fallback = Platform.isTaptap ? resolveSystemFontFamily() : FONT_FAMILY_DISPLAY;
  if (loaded) return `${loaded}, ${fallback}`;
  return fallback;
}

export function resolveBodyFontFamily(): string {
  const loaded = getBodyFontFamily();
  const fallback = resolveSystemFontFamily();
  if (loaded) return `${loaded}, ${fallback}`;
  return fallback;
}
