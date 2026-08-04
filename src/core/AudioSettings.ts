/**
 * 音频偏好：BGM / 音效音量，本地持久化。
 *
 * 不进云存档——音量是设备偏好，不是进度；跨端同步反而容易把手机调好的量
 * 盖成平板上的旧值。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { BgmManager } from '@/core/BgmManager';
import { SfxManager } from '@/core/SfxManager';
import { Platform } from '@/core/PlatformService';

export const AUDIO_SETTINGS_KEY = scopedStorageKey('audio_settings');

/** BGM 默认必须低于 SFX：背景常驻，音效是瞬时反馈，反过来就会「只有音乐没有声音」 */
export const DEFAULT_BGM_VOLUME = 0.28;
export const DEFAULT_SFX_VOLUME = 1.0;

export interface AudioSettingsState {
  bgmVolume: number;
  sfxVolume: number;
}

let _state: AudioSettingsState = {
  bgmVolume: DEFAULT_BGM_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
};
let _loaded = false;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function readStored(): AudioSettingsState | null {
  const raw = Platform.getStorageSync(AUDIO_SETTINGS_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<AudioSettingsState>;
    return {
      bgmVolume: clamp01(d.bgmVolume ?? DEFAULT_BGM_VOLUME),
      sfxVolume: clamp01(d.sfxVolume ?? DEFAULT_SFX_VOLUME),
    };
  } catch {
    return null;
  }
}

function persist(): void {
  Platform.setStorageAsync(AUDIO_SETTINGS_KEY, JSON.stringify(_state));
}

function applyToManagers(): void {
  BgmManager.setVolume(_state.bgmVolume);
  SfxManager.setMasterVolume(_state.sfxVolume);
  SfxManager.setEnabled(_state.sfxVolume > 0.001);
  // 只在开关态真的变化时调 setEnabled：它会 stop/playMain。
  // 启动阶段若每次 load 都 playMain，会赶在分包就绪前抢播。
  const wantBgm = _state.bgmVolume > 0.001;
  if (wantBgm !== BgmManager.enabled) BgmManager.setEnabled(wantBgm);
}

/** 启动时调用一次：读本地 → 落到 Bgm/Sfx。须在 playMain 之前。 */
export function loadAudioSettings(): AudioSettingsState {
  if (!_loaded) {
    _state = readStored() ?? {
      bgmVolume: DEFAULT_BGM_VOLUME,
      sfxVolume: DEFAULT_SFX_VOLUME,
    };
    _loaded = true;
  }
  applyToManagers();
  return { ..._state };
}

export function getAudioSettings(): AudioSettingsState {
  if (!_loaded) loadAudioSettings();
  return { ..._state };
}

export function setBgmVolume(volume: number): void {
  if (!_loaded) loadAudioSettings();
  _state.bgmVolume = clamp01(volume);
  applyToManagers();
  persist();
}

export function setSfxVolume(volume: number): void {
  if (!_loaded) loadAudioSettings();
  _state.sfxVolume = clamp01(volume);
  applyToManagers();
  persist();
}
