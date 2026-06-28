import { getRarity } from '@/balance/rarity';
import { ELEMENT_NAME } from '@/balance/ui';
import type { Element } from '@/balance/combat';
import { hexColor, fmtPct } from '../lib/format';

export function elementBadge(el: Element): string {
  const name = ELEMENT_NAME[el] ?? el;
  return `<span class="badge" style="border-color:#888">${name}</span>`;
}

export function rarityBadge(tier: number): string {
  const r = getRarity(tier as 1 | 2 | 3 | 4);
  const color = hexColor(r.color);
  return `<span class="badge" style="color:${color};border-color:${color}">${r.code}</span>`;
}

export function winBadge(win: boolean, stars?: number): string {
  if (win) return `<span class="pill-ok">胜 ${stars ?? '?'}★</span>`;
  return `<span class="pill-bad">败</span>`;
}

export function fmtGachaRate(rate: number): string {
  return fmtPct(rate, 1);
}
