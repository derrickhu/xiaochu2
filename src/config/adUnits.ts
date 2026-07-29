/**
 * 平台广告位 ID（物理 adUnitId）
 *
 * ── 两层模型 ──
 * 1. 逻辑位（balance/monetization.ts 的 AdPlacementId）
 *    管玩法：日限、文案、埋点 scene、发什么奖。跨平台共用同一套 id。
 * 2. 物理位（本文件）
 *    管宿主后台申请的 adUnitId。抖音 / 微信各自一套，按平台分流。
 *
 * ── 首发策略（抖音 / 微信一致）──
 * - 只接「激励视频」：对应 8 个逻辑位全部走同一个 rewarded 物理位。
 *   库存与 eCPM 按流量整体优化；位点差异靠埋点 scene 区分，不必拆 8 个后台位。
 * - Banner / 插屏：结构预留，首发不接（强制曝光伤留存；本游戏 IAA 全是可选激励）。
 *
 * ── 抖音后台创建清单（类型一律选「激励视频广告」）──
 * | 后台名称（建议照抄）        | 填到字段           | 用途                         |
 * |-----------------------------|--------------------|------------------------------|
 * | 灵宠消消塔-激励视频         | douyin.rewarded    | 全部激励逻辑位共用（必建）   |
 * | 灵宠消消塔-Banner（可选）   | douyin.banner      | 首发空着，以后再说           |
 * | 灵宠消消塔-插屏（可选）     | douyin.interstitial| 首发空着，以后再说           |
 *
 * 微信上线时同样建「激励视频」一个，填 wechat.rewarded；逻辑位不用改。
 *
 * 空串 = 未配置 → Platform.showRewardedVideo 走开发桩（直接成功），方便本地联调。
 */
import { detectMinigamePlatform } from '@/core/PlatformService';

export interface PlatformAdUnits {
  /** 激励视频（必填才能在真机播广告） */
  rewarded: string;
  /** Banner：首发不接 */
  banner: string;
  /** 插屏：首发不接 */
  interstitial: string;
}

/**
 * 各平台物理广告位。拿到后台 adUnitId 后只改这里，不要改业务代码。
 */
export const AD_UNITS: Readonly<Record<'wechat' | 'douyin', PlatformAdUnits>> = {
  douyin: {
    rewarded: '36c73jd3mll124aei6',
    banner: '',
    interstitial: '',
  },
  wechat: {
    rewarded: '',       // ← 微信激励视频 adUnitId，上微信时再填
    banner: '',
    interstitial: '',
  },
};

function currentUnits(): PlatformAdUnits {
  const platform = detectMinigamePlatform();
  if (platform === 'wechat' || platform === 'douyin') return AD_UNITS[platform];
  return AD_UNITS.douyin;
}

/** 当前平台激励视频 adUnitId（adGate / Platform 播放入口） */
export const REWARDED_AD_UNIT: string = currentUnits().rewarded;

/** 当前平台 Banner（预留，未接 UI） */
export const BANNER_AD_UNIT: string = currentUnits().banner;

/** 当前平台插屏（预留，未接 UI） */
export const INTERSTITIAL_AD_UNIT: string = currentUnits().interstitial;
