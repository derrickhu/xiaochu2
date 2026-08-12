/**
 * 音频资源路径（相对 minigame 根目录，位于 pkg-audio 分包）
 *
 * 分两个目录是刻意的，因为两类音频的加载策略相反：
 * - `audio/` 短音效留包内（CdnConfig.bundledDirs），要「按下即响」；
 * - `bgm/`   长背景乐走 CDN（CdnConfig.cdnDirs），省 2.1MB 包体，晚几百毫秒无感。
 * 改动这里的目录名要同步 CdnConfig，否则 SFX 会被 cdn:strip 删掉导致整局静音。
 */
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

const A = `${SUBPACKAGE_ROOT.audio}/audio`;
const BGM = `${SUBPACKAGE_ROOT.audio}/bgm`;

export const AUDIO = {
  mainBgm: `${BGM}/bgm.mp3`,
  /** 常规战斗（非 Boss / 守关波） */
  battleBgm: `${BGM}/battle_bgm.mp3`,
  bossBgm: `${BGM}/boss_bgm.mp3`,

  eliminate: `${A}/eliminate.mp3`,
  combo: `${A}/combo.mp3`,
  /**
   * 连击声阶预烘焙采样（scripts/bake_combo_ladder.py）。
   *
   * 两条约束决定了必须预烘焙而不是运行时变调：
   * 1) 抖音小游戏 InnerAudioContext 无可靠 playbackRate，运行时变调会整段发平；
   * 2) playbackRate 即便可用也封顶 2.0，第 8 连之后就再也升不上去。
   * 烘焙不受这两条限制，故一路排到 12 档（×1.30 → ×3.28）。
   * 源采样是 8kHz，升调后必须输出到 44.1kHz——回采到 8kHz 会把移上去的高频截掉，
   * 结果就是「烘了 8 档但听着都一样闷」。
   */
  comboC1: `${A}/combo_c1.mp3`,
  comboC2: `${A}/combo_c2.mp3`,
  comboC3: `${A}/combo_c3.mp3`,
  comboC4: `${A}/combo_c4.mp3`,
  comboC5: `${A}/combo_c5.mp3`,
  comboC6: `${A}/combo_c6.mp3`,
  comboC7: `${A}/combo_c7.mp3`,
  comboC8: `${A}/combo_c8.mp3`,
  comboC9: `${A}/combo_c9.mp3`,
  comboC10: `${A}/combo_c10.mp3`,
  comboC11: `${A}/combo_c11.mp3`,
  comboC12: `${A}/combo_c12.mp3`,
  /** 「破」和弦预烘焙：Sol / Si / Do' */
  levelupSol: `${A}/levelup_sol.mp3`,
  comboSi: `${A}/combo_si.mp3`,
  eliminateDo: `${A}/eliminate_do.mp3`,
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

  // ── UI 交互 ──
  uiClick: `${A}/ui_click.mp3`,
  uiBack: `${A}/ui_back.mp3`,
  uiTab: `${A}/ui_tab.mp3`,
  errorDenied: `${A}/error_denied.mp3`,
  sceneTransition: `${A}/scene_transition.mp3`,

  // ── 养成与奖励 ──
  petLevelup: `${A}/pet_levelup.mp3`,
  petStarup: `${A}/pet_starup.mp3`,
  gachaDraw: `${A}/gacha_draw.mp3`,
  gachaRevealRare: `${A}/gacha_reveal_rare.mp3`,
  rewardGet: `${A}/reward_get.mp3`,
  chestOpen: `${A}/chest_open.mp3`,
  shopPurchase: `${A}/shop_purchase.mp3`,

  // ── 战斗信息 ──
  enemyCharge: `${A}/enemy_charge.mp3`,
  gateActivate: `${A}/gate_activate.mp3`,
  gateBroken: `${A}/gate_broken.mp3`,
  phaseShift: `${A}/phase_shift.mp3`,
  shieldGain: `${A}/shield_gain.mp3`,
  dotTick: `${A}/dot_tick.mp3`,
  orbSeal: `${A}/orb_seal.mp3`,
} as const;
