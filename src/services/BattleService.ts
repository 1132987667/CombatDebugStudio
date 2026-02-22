import { BattleManager } from '@/core/battle/BattleManager';

/**
 * 战斗服务
 * 负责管理BattleManager实例
 * 推荐通过容器注入使用
 */
export class BattleService {
  private battleManager: BattleManager;

  /**
   * 构造函数
   * @param battleManager BattleManager实例（通过构造函数注入）
   */
  constructor(battleManager: BattleManager) {
    this.battleManager = battleManager;
  }

  /**
   * 获取BattleManager实例
   */
  public getBattleManager(): BattleManager {
    return this.battleManager;
  }

  /**
   * 重置战斗服务
   * @param battleManager 新的BattleManager实例（可选）
   */
  public reset(battleManager?: BattleManager): void {
    this.battleManager = battleManager || new BattleManager();
  }
}
