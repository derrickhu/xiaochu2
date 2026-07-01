/**
 * 真机触摸诊断（vConsole 可见）。GameGlobal.__touchDiag = true 可开启。
 */
import { Platform } from '@/core/PlatformService';
import { Game } from '@/core/Game';

declare const GameGlobal: { __touchDiag?: boolean; canvas?: { __diagId?: string } } | undefined;

const MAX = 40;
const UNLIMITED_PREFIXES = ['board.', 'team.', 'petSwipe', 'delay.'];
let _n = 0;

function enabled(): boolean {
  if (!Platform.isMinigame) return false;
  return GameGlobal?.__touchDiag === true;
}

export function touchDiag(tag: string, msg: string): void {
  if (!enabled()) return;
  const unlimited = UNLIMITED_PREFIXES.some((p) => tag.startsWith(p));
  if (!unlimited && _n >= MAX) return;
  if (!unlimited) _n++;
  try {
    console.log(`[TouchDiag] ${tag} | ${msg}`);
  } catch { /* */ }
}

export function touchDiagOnce(tag: string, msg: string): void {
  if (!enabled()) return;
  try {
    console.log(`[TouchDiag] ${tag} | ${msg}`);
  } catch { /* */ }
}

export function touchDiagCanvas(tag: string): void {
  if (!enabled()) return;
  const gg = GameGlobal?.canvas as { __diagId?: string; addEventListener?: unknown } | undefined;
  const view = Game.app?.view as { __diagId?: string } | undefined;
  touchDiagOnce(tag,
    `gg.canvas=${gg?.__diagId ?? '?'} view=${view?.__diagId ?? '?'}`
    + ` same=${gg === view} screen=${Game.screenWidth}x${Game.screenHeight}`
    + ` logic=${Game.logicWidth}x${Game.logicHeight}`,
  );
}
