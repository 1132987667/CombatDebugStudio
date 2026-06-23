import { BattleManager } from '@/core/battle/BattleManager';

/**
 * 鎴樻枟鍙搁潰
 * 璐熻矗绠＄悊BattleManager瀹炰緥
 * 鎺ㄨ崘閫氳繃瀹瑰櫒娉ㄥ叆浣跨敤
 */
export class BattleFacade {
  private battleManager: BattleManager;

  /**
   * 鏋勯€犲嚱鏁?
   * @param battleManager BattleManager瀹炰緥锛堥€氳繃鏋勯€犲嚱鏁版敞鍏ワ級
   */
  constructor(battleManager: BattleManager) {
    this.battleManager = battleManager;
  }

  /**
   * 鑾峰彇BattleManager瀹炰緥
   */
  public getBattleManager(): BattleManager {
    return this.battleManager;
  }

  /**
   * 閲嶇疆鎴樻枟鍙搁潰
   * @param battleManager 鏂扮殑BattleManager瀹炰緥锛堝彲閫夛級
   */
  public reset(battleManager?: BattleManager): void {
    this.battleManager = battleManager || new BattleManager();
  }
}


export { BattleFacade as BattleService };
