/**
 * @deprecated 星级配置已迁入 passiveEffects.ts（ROLE_STAR_EFFECTS）
 */
export {
  ROLE_STAR_EFFECTS as ROLE_STAR_TRAITS,
  isStarEffectUnlocked as isStarTraitUnlocked,
  unlockedStarEffects as unlockedStarTraits,
  type StarEffectLayer as StarTraitLayer,
} from './passiveEffects';

import type { PetRole } from './petRoles';
import { ROLE_STAR_EFFECTS, isStarEffectUnlocked, type StarEffectLayer } from './passiveEffects';

export interface StarTraitState {
  layer: StarEffectLayer;
  unlocked: boolean;
}

export function resolveStarTraitStates(role: PetRole, star: number): StarTraitState[] {
  const ladder = ROLE_STAR_EFFECTS[role] ?? ROLE_STAR_EFFECTS.attacker;
  return ladder.map((layer) => ({
    layer,
    unlocked: isStarEffectUnlocked(layer, star),
  }));
}
