/**
 * 文件: BattleSystemFactory.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统工厂
 * 描述: 负责创建和初始化战斗系统的各个组件，使用依赖注入容器管理服务实例
 * 版本: 1.0.0
 */

import { container, resetContainer } from '@/core/di/Container'
import {
  IBattleSystem,
  ITurnManager,
  IActionExecutor,
  IAISystem,
  BATTLE_SYSTEM_TOKEN,
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
} from '@/core/battle/interfaces'

export class BattleSystemFactory {
  /**
   * 初始化战斗系统
   * 现在使用统一的容器初始化函数
   * 注意：此方法已废弃，容器初始化应在 main.ts 中完成
   * @deprecated
   */
  public static initialize(): void {
    console.warn('BattleSystemFactory.initialize() 已废弃，容器初始化已在 main.ts 中完成')
  }

  /**
   * 创建战斗系统实例
   * @returns IBattleSystem - 战斗系统实例
   */
  public static createBattleSystem(): IBattleSystem {
    return container.resolve<IBattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  }

  /**
   * 获取回合管理器实例
   * @returns ITurnManager - 回合管理器实例
   */
  public static getTurnManager(): ITurnManager {
    return container.resolve<ITurnManager>(TURN_MANAGER_TOKEN.toString())
  }

  /**
   * 获取动作执行器实例
   * @returns IActionExecutor - 动作执行器实例
   */
  public static getActionExecutor(): IActionExecutor {
    return container.resolve<IActionExecutor>(
      ACTION_EXECUTOR_TOKEN.toString(),
    )
  }

  /**
   * 获取AI系统实例
   * @returns IAISystem - AI系统实例
   */
  public static getAISystem(): IAISystem {
    return container.resolve<IAISystem>(AI_SYSTEM_TOKEN.toString())
  }

  /**
   * 重置战斗系统
   * 用于测试场景
   */
  public static reset(): void {
    resetContainer()
  }
}
