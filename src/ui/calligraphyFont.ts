/**
 * 自定义字体解析：已预热用专用体，否则回退系统字体。
 */
import { getBodyFontFamily, getCalligraphyFamily } from '@/core/FontService';
import {
  FONT_FAMILY,
  FONT_FAMILY_BODY,
  FONT_FAMILY_CALLIGRAPHY,
  FONT_FAMILY_DISPLAY,
} from './theme';

export function resolveCalligraphyFontFamily(): string {
  const loaded = getCalligraphyFamily();
  if (loaded) return loaded;
  return `${FONT_FAMILY_CALLIGRAPHY}, ${FONT_FAMILY_DISPLAY}`;
}

export function resolveBodyFontFamily(): string {
  const loaded = getBodyFontFamily();
  if (loaded) return loaded;
  return `${FONT_FAMILY_BODY}, ${FONT_FAMILY}`;
}
