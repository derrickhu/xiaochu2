/**
 * 战斗上下文：告诉战斗与结算层「这一场是从哪个玩法进来的」
 *
 * 主线不带上下文；秘境与通天塔带各自的上下文，结算层据此走不同的发奖与后续导航，
 * 战斗内核本身保持无感知。
 */
export interface RealmBattleContext {
  kind: 'realm';
  realmId: string;
  tier: number;
}

export interface TowerBattleContext {
  kind: 'tower';
  floor: number;
}

export type BattleContext = RealmBattleContext | TowerBattleContext;
