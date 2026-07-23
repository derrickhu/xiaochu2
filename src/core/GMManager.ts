/**
 * GM（Game Master）调试管理器
 *
 * 仅微信/抖音开发者工具（platform === devtools）可用；真机一律禁用。
 * 开发者工具内自动激活；也可在标题页顶栏标题区连点 5 次手动激活。
 */
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { ChapterMapLayoutStore } from '@/game/chapterMapLayoutStore';
import { PlayerData } from '@/game/PlayerData';
import { MAX_PET_STAR } from '@/balance/growth';
import { PET_AWAKEN_STAR } from '@/config/Assets';
import { PET_MAP } from '@/balance/pets';

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

    // ── 养成调试：经验 / 碎片 / 快速升星（测觉醒头像等）──
    this._commands.push({
      id: 'exp_plus_10k',
      group: '养成',
      name: '经验 +1万',
      desc: '全局宠物经验池 +10000，详情页可连续升级',
      execute: () => {
        PlayerData.load();
        PlayerData.addExp(10_000);
        return `经验 = ${PlayerData.exp}`;
      },
    });
    this._commands.push({
      id: 'exp_plus_100k',
      group: '养成',
      name: '经验 +10万',
      desc: '全局宠物经验池 +100000',
      execute: () => {
        PlayerData.load();
        PlayerData.addExp(100_000);
        return `经验 = ${PlayerData.exp}`;
      },
    });
    this._commands.push({
      id: 'shards_owned_plus_50',
      group: '养成',
      name: '已拥有碎片 +50',
      desc: '每只已拥有灵宠 +50 碎片（够测小幅升星）',
      execute: () => this._addShardsToOwned(50),
    });
    this._commands.push({
      id: 'shards_owned_plus_200',
      group: '养成',
      name: '已拥有碎片 +200',
      desc: '每只已拥有灵宠 +200 碎片（覆盖 2★→3★ 等成本）',
      execute: () => this._addShardsToOwned(200),
    });
    this._commands.push({
      id: 'shards_team_next_star',
      group: '养成',
      name: '编队补齐下一星碎片',
      desc: '当前编队每只宠刚好补足升一星所需碎片（不自动升）',
      execute: () => this._fillTeamNextStarShards(),
    });
    this._commands.push({
      id: 'team_star_awaken',
      group: '养成',
      name: `编队升到 ${PET_AWAKEN_STAR}★（觉醒脸）`,
      desc: `编队自动补碎片并升到 ${PET_AWAKEN_STAR}★，用于测觉醒头像`,
      execute: () => this._starUpTeamTo(PET_AWAKEN_STAR),
    });
    this._commands.push({
      id: 'team_star_max',
      group: '养成',
      name: `编队升到 ${MAX_PET_STAR}★`,
      desc: '编队补碎片并升到满星',
      execute: () => this._starUpTeamTo(MAX_PET_STAR),
    });
  }

  private _addShardsToOwned(amount: number): string {
    PlayerData.load();
    const ids = PlayerData.ownedPets;
    if (ids.length === 0) return '暂无已拥有灵宠';
    for (const id of ids) PlayerData.addShards(id, amount);
    const sample = ids.slice(0, 3).map((id) => {
      const name = PET_MAP.get(id)?.name ?? id;
      return `${name}${PlayerData.petShards(id)}`;
    });
    return `已给 ${ids.length} 只 +${amount} 碎片；例：${sample.join(' / ')}`;
  }

  private _fillTeamNextStarShards(): string {
    PlayerData.load();
    const parts: string[] = [];
    for (const id of PlayerData.team) {
      if (!PlayerData.isOwned(id)) continue;
      const cost = PlayerData.starUpCost(id);
      const name = PET_MAP.get(id)?.name ?? id;
      if (cost === null) {
        parts.push(`${name}=满星`);
        continue;
      }
      const have = PlayerData.petShards(id);
      const need = Math.max(0, cost - have);
      if (need > 0) PlayerData.addShards(id, need);
      parts.push(`${name}+${need}→${PlayerData.petShards(id)}/${cost}`);
    }
    return parts.length ? parts.join('；') : '编队为空';
  }

  /** 编队补碎片并连续升星到 target（含） */
  private _starUpTeamTo(target: number): string {
    PlayerData.load();
    const goal = Math.max(1, Math.min(MAX_PET_STAR, target));
    const parts: string[] = [];
    for (const id of PlayerData.team) {
      if (!PlayerData.isOwned(id)) continue;
      const name = PET_MAP.get(id)?.name ?? id;
      let guard = MAX_PET_STAR + 2;
      while (PlayerData.petStar(id) < goal && guard-- > 0) {
        const cost = PlayerData.starUpCost(id);
        if (cost === null) break;
        const need = Math.max(0, cost - PlayerData.petShards(id));
        if (need > 0) PlayerData.addShards(id, need);
        if (!PlayerData.starUp(id)) break;
      }
      parts.push(`${name}${PlayerData.petStar(id)}★`);
    }
    return parts.length ? `编队 → ${parts.join(' / ')}` : '编队为空';
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
