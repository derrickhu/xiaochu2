/**
 * 音频资源路径（相对 minigame 根目录，位于 pkg-audio 分包）
 */
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

const A = `${SUBPACKAGE_ROOT.audio}/audio`;

export const AUDIO = {
  mainBgm: `${A}/bgm.mp3`,
  bossBgm: `${A}/boss_bgm.mp3`,

  eliminate: `${A}/eliminate.mp3`,
  combo: `${A}/combo.mp3`,
  rolling: `${A}/rolling.mp3`,
  levelup: `${A}/levelup.mp3`,
  attack: `${A}/attack.mp3`,
  enemyAttack: `${A}/enemy_attack.mp3`,
  heroHurt: `${A}/hero_hurt.mp3`,
  block: `${A}/block.mp3`,
  petSkill: `${A}/pet_skill.mp3`,
  skill: `${A}/skill.mp3`,
  boss: `${A}/boss.mp3`,
  victory: `${A}/victory.mp3`,
  reward: `${A}/reward.mp3`,
  gameover: `${A}/gameover.mp3`,
  enemySkill: `${A}/enemy_skill.mp3`,
  update3: `${A}/update3.mp3`,
} as const;
