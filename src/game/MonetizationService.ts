/**
 * 内购服务（桩）
 *
 * 首发不开付费（`ECONOMY_IAP.enabled = false`），但发货路径先写通：
 * 商品配置 → 发起支付 → 发货 → 埋点。这样开付费当天只需要替换 `_requestPayment` 一处，
 * 不必回来重新设计月卡每日领取与首充判定的存档结构。
 *
 * 月卡按「到期时间 + 上次领取日期」存，不做定时器：小游戏随时被杀进程，
 * 任何依赖常驻 ticker 的每日发放都会漏发。
 */
import { Platform } from '@/core/PlatformService';
import { analytics } from '@/analytics';
import { ECONOMY_IAP, type IapSku } from '@/balance/monetization';
import { PlayerData } from './PlayerData';

export type PurchaseResult = 'ok' | 'disabled' | 'unsupported' | 'cancelled' | 'failed';

class MonetizationServiceClass {
  get enabled(): boolean {
    return ECONOMY_IAP.enabled;
  }

  get skus(): readonly IapSku[] {
    return ECONOMY_IAP.skus;
  }

  skuOf(id: string): IapSku | undefined {
    return ECONOMY_IAP.skus.find((s) => s.id === id);
  }

  /** 商品是否可购买（首充已用、月卡未到期等由此收口） */
  purchasable(id: string): boolean {
    if (!this.enabled) return false;
    return !!this.skuOf(id);
  }

  /**
   * 发起购买。桩阶段一律返回 disabled 且不发货 ——
   * 宁可按钮点不动，也不能在没接支付回调的情况下先发货。
   */
  async purchase(id: string): Promise<PurchaseResult> {
    const sku = this.skuOf(id);
    if (!sku) return 'failed';
    if (!this.enabled) {
      Platform.showToast('内购尚未开放');
      return 'disabled';
    }

    analytics.trackPurchaseInitiate(sku.id, sku.priceFen);
    const ok = await this._requestPayment(sku);
    if (!ok) {
      analytics.trackPurchaseFail(sku.id, 'payment_unavailable');
      return 'unsupported';
    }
    this.deliver(sku);
    analytics.trackPurchaseComplete(sku.id, sku.priceFen);
    return 'ok';
  }

  /** 发货：即时部分立刻到账（月卡的每日部分由 claimDaily 逐日发） */
  deliver(sku: IapSku): void {
    const g = sku.instant;
    if (g.lingyu) PlayerData.addLingyu(g.lingyu);
    if (g.coins) PlayerData.addCoins(g.coins);
    if (g.universal) PlayerData.addUniversalShards(g.universal);
    if (g.stamina) PlayerData.addStamina(g.stamina);
  }

  /** 支付通道：接入平台支付前恒为 false（wx.requestMidasPayment / tt.requestPayment） */
  private async _requestPayment(_sku: IapSku): Promise<boolean> {
    return false;
  }
}

export const MonetizationService = new MonetizationServiceClass();
