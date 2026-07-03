/**
 * GM（Game Master）调试管理器
 *
 * 仅微信/抖音开发者工具（platform === devtools）可用；真机一律禁用。
 * 开发者工具内自动激活；也可在标题页顶栏标题区连点 5 次手动激活。
 */
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';

const GM_STORAGE_KEY = 'xiaochu2_gm';

export interface GMCommand {
  id: string;
  group: string;
  name: string;
  desc: string;
  execute: () => string;
}

class GMManagerClass {
  private _enabled = false;
  private readonly _runtimeAllowed: boolean;
  private _tapCount = 0;
  private _lastTapTime = 0;
  private _commands: GMCommand[] = [];
  private _instantClearHandler: (() => string) | null = null;

  get isRuntimeAllowed(): boolean { return this._runtimeAllowed; }
  get isEnabled(): boolean { return this._runtimeAllowed && this._enabled; }
  get commands(): readonly GMCommand[] { return this._commands; }

  get groups(): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const cmd of this._commands) {
      if (!seen.has(cmd.group)) {
        seen.add(cmd.group);
        ordered.push(cmd.group);
      }
    }
    return ordered;
  }

  getCommandsByGroup(group: string): GMCommand[] {
    return this._commands.filter((c) => c.group === group);
  }

  constructor() {
    this._runtimeAllowed = Platform.isDevtools;
    this._registerCommands();
    this._loadState();
  }

  /** 标题页顶栏标题区连点激活 */
  onTitleTap(): void {
    if (!this._runtimeAllowed) return;
    const now = Date.now();
    if (now - this._lastTapTime > 1500) this._tapCount = 1;
    else this._tapCount++;
    this._lastTapTime = now;
    if (this._tapCount >= 5) {
      this._tapCount = 0;
      this._enabled = true;
      this._saveState();
      console.log('[GM] GM 模式已激活');
      EventBus.emit('gm:activated');
      EventBus.emit('gm:open');
    }
  }

  openPanel(): void {
    if (!this._runtimeAllowed) {
      console.warn('[GM] 真机环境禁用 GM');
      return;
    }
    if (!this._enabled) {
      console.warn('[GM] GM 未激活：标题页顶栏标题连点 5 次');
      return;
    }
    EventBus.emit('gm:open');
  }

  executeCommand(id: string): string {
    if (!this._runtimeAllowed) return '真机环境禁用 GM';
    if (!this._enabled) return 'GM 未激活';
    const cmd = this._commands.find((c) => c.id === id);
    if (!cmd) return `未知指令: ${id}`;
    try {
      const result = cmd.execute();
      console.log(`[GM] ${cmd.name} → ${result}`);
      return result;
    } catch (e) {
      const msg = `执行失败: ${e}`;
      console.error(`[GM] ${cmd.name}:`, e);
      return msg;
    }
  }

  /** 战斗场景注册一键通关回调（onEnter 注册，onExit 注销） */
  registerInstantClearHandler(fn: () => string): void {
    this._instantClearHandler = fn;
  }

  unregisterInstantClearHandler(): void {
    this._instantClearHandler = null;
  }

  private _registerCommands(): void {
    this._commands.push({
      id: 'instant_clear',
      group: '战斗',
      name: '一键通关',
      desc: '立即击杀当前关卡敌人并结算胜利（需在战斗中使用）',
      execute: () => {
        if (!this._instantClearHandler) return '请进入战斗后使用';
        return this._instantClearHandler();
      },
    });
  }

  private _saveState(): void {
    try {
      Platform.setStorageSync(GM_STORAGE_KEY, JSON.stringify({ enabled: this._enabled }));
    } catch (_) { /* */ }
  }

  private _loadState(): void {
    if (!this._runtimeAllowed) {
      this._enabled = false;
      return;
    }
    try {
      const raw = Platform.getStorageSync(GM_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this._enabled = !!data.enabled;
      }
    } catch (_) { /* */ }
    if (!this._enabled) {
      this._enabled = true;
      this._saveState();
      console.log('[GM] 开发者工具环境，自动激活 GM');
    }
  }
}

export const GMManager = new GMManagerClass();
