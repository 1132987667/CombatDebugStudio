import { BattleManager } from '@/core/battle/BattleManager';

/**
 * 战斗服务
 * 全局单例，负责管理BattleManager实例
 */
export class BattleService {
  private static instance: BattleService;
  private battleManager: BattleManager;

  private constructor() {
    // 初始化BattleManager实例
    this.battleManager = new BattleManager();
  }

  /**
   * 获取战斗服务单例
   */
  public static getInstance(): BattleService {
    if (!BattleService.instance) {
      BattleService.instance = new BattleService();
    }
    return BattleService.instance;
  }

  /**
   * 获取BattleManager实例
   */
  public getBattleManager(): BattleManager {
    return this.battleManager;
  }

  /**
   * 重置战斗服务
   */
  public reset(): void {
    this.battleManager = new BattleManager();
  }
}

/**
 * 战斗服务单例
 */
export const battleService = BattleService.getInstance();
