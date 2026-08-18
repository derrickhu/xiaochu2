/**
 * 平台广告位 ID（物理 adUnitId）
 *
 * ── 两层模型 ──
 * 1. 逻辑位（balance/monetization.ts 的 AdPlacementId）
 *    管玩法：日限、文案、埋点 scene、发什么奖。跨平台共用同一套 id。
 * 2. 物理位（本文件）
 *    管宿主后台申请的 adUnitId。抖音 / 微信 / Tap 各自一套，按平台分流。
 *
 * ── 抖音商业化 ──
 * - 激励视频：8 个逻辑位共用一个 rewarded 物理位（必填）。
 * - 插屏：后台建「插屏广告」填 interstitial；战斗结束点返回时软曝光（见 game/interstitialAd.ts）。
 * - Banner：仍预留，不做强制贴片。
 *
 * ── 抖音后台创建清单 ──
 * | 后台名称（建议照抄）        | 类型       | 填到字段              |
 * |-----------------------------|------------|-----------------------|
 * | 灵宠消消塔-激励视频         | 激励视频   | douyin.rewarded       |
 * | 灵宠消消塔-插屏             | 插屏广告   | douyin.interstitial   |
 * | 灵宠消消塔-Banner（可选）   | Banner     | douyin.banner         |
 *
 * 空串 = 未配置：抖音/微信激励走开发桩；Tap 直接失败（不发奖）；插屏静默跳过。
 *
 * Tap 广告位在 Dirichlet 建「小游戏」媒体后填 adUnitId，不要接原生聚合 AAR。
 */
import { detectMinigamePlatform } from '@/core/PlatformService';

export interface PlatformAdUnits {
  /** 激励视频（必填才能在真机播广告） */
  rewarded: string;
  /** Banner：预留 */
  banner: string;
  /** 插屏（抖音广告能力检测建议接入；填后台插屏位 ID） */
  interstitial: string;
}

/**
 * 各平台物理广告位。拿到后台 adUnitId 后只改这里，不要改业务代码。
 */
export const AD_UNITS: Readonly<Record<'wechat' | 'douyin' | 'taptap', PlatformAdUnits>> = {
  douyin: {
    rewarded: '36c73jd3mll124aei6',
    banner: '',
    interstitial: '1efbornvxlm12dj416',
  },
  wechat: {
    rewarded: '',       // ← 微信激励视频 adUnitId，上微信时再填
    banner: '',
    interstitial: '',
  },
  taptap: {
    rewarded: '1062120', // Dirichlet 测试激励视频（竖屏）
    banner: '',
    interstitial: '',
  },
};

function currentUnits(): PlatformAdUnits {
  const platform = detectMinigamePlatform();
  if (platform === 'wechat' || platform === 'douyin' || platform === 'taptap') return AD_UNITS[platform];
  return { rewarded: '', banner: '', interstitial: '' };
}

/** 当前平台激励视频 adUnitId（adGate / Platform 播放入口） */
export const REWARDED_AD_UNIT: string = currentUnits().rewarded;

/** 当前平台 Banner（预留） */
export const BANNER_AD_UNIT: string = currentUnits().banner;

/** 当前平台插屏（battle 结算返回时软播） */
export const INTERSTITIAL_AD_UNIT: string = currentUnits().interstitial;
