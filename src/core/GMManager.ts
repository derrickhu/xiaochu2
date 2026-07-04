/**
 * GM（Game Master）调试管理器
 *
 * 仅微信/抖音开发者工具（platform === devtools）可用；真机一律禁用。
 * 开发者工具内自动激活；也可在标题页顶栏标题区连点 5 次手动激活。
 */
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { ChapterMapLayoutStore } from '@/game/chapterMapLayoutStore';

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
      id: 'toggle_map_edit',
      group: '主界面',
      name: '编辑关卡位置',
      desc: '切换主界面关卡节点拖拽编辑（左右切换章节均可编辑）',
      execute: () => {
        EventBus.emit('gm:mapEditToggle');
        EventBus.emit('gm:close');
        return '已进入关卡位置编辑（再点一次可退出）';
      },
    });
    this._commands.push({
      id: 'export_map_layout',
      group: '主界面',
      name: '导出关卡布局',
      desc: '控制台一条日志输出 JSON + bundled TS',
      execute: () => {
        const counts = ChapterMapLayoutStore.listSavedCounts();
        if (!counts.length) {
          Platform.showModal('导出关卡布局', '暂无已保存布局。\n请先进入编辑模式，拖好节点后点「保存布局」。');
          Platform.showToast('暂无已保存布局', 'none');
          return '暂无已保存布局，请先保存后再导出';
        }
        const report = ChapterMapLayoutStore.exportReport();
        console.warn('[GM] 关卡地图布局导出\n', report);
        Platform.showModal(
          '导出成功',
          `已保存 ${counts.join(' / ')} 关布局。\n控制台已输出一条合并日志，复制 TS 段落到 chapterMapBundledLayouts.ts。`,
        );
        Platform.showToast(`已导出 ${counts.length} 套布局`, 'success');
        return `已导出 ${counts.join('/')} 关布局，见控制台一条合并日志`;
      },
    });
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
