/**
 * 文件: AIStrategyManager.ts
 * 功能: AI策略管理器
 * 描述: 支持运行时动态切换AI策略，提供策略注册、切换、状态查询等功能
 */

import type { BattleAI } from '@/core/BattleAI'
import type {
  IBattleDecisionStrategy,
  ITargetSelectionStrategy,
  ISkillSelectionStrategy,
  IThreatCalculationStrategy,
} from './StrategyInterfaces'
import {
  DefaultBattleDecisionStrategy,
  StrategyFactory,
} from './DefaultStrategies'

/**
 * 策略注册信息
 */
interface StrategyRegistration {
  name: string
  strategy: IBattleDecisionStrategy
  description?: string
}

/**
 * AI策略管理器
 * 支持运行时动态切换AI决策策略
 */
export class AIStrategyManager {
  private strategies: Map<string, StrategyRegistration> = new Map()
  private currentStrategyName: string = 'default'
  private aiInstance: BattleAI | null = null

  constructor() {
    this.registerDefaultStrategies()
  }

  /**
   * 注册默认策略
   */
  private registerDefaultStrategies(): void {
    this.registerStrategy('default', new DefaultBattleDecisionStrategy(), '默认策略')
    this.registerStrategy('aggressive', StrategyFactory.createBattleDecisionStrategy('aggressive', 'default'), '攻击性策略')
    this.registerStrategy('defensive', StrategyFactory.createBattleDecisionStrategy('defensive', 'default'), '防御性策略')
  }

  /**
   * 注册策略
   */
  public registerStrategy(
    name: string,
    strategy: IBattleDecisionStrategy,
    description?: string,
  ): void {
    this.strategies.set(name, {
      name,
      strategy,
      description,
    })
  }

  /**
   * 注销策略
   */
  public unregisterStrategy(name: string): boolean {
    if (name === 'default') {
      return false
    }
    return this.strategies.delete(name)
  }

  /**
   * 切换策略
   */
  public switchStrategy(name: string): boolean {
    const registration = this.strategies.get(name)
    if (!registration) {
      console.warn(`Strategy '${name}' not found`)
      return false
    }

    this.currentStrategyName = name

    if (this.aiInstance && 'setBattleDecisionStrategy' in this.aiInstance) {
      (this.aiInstance as any).setBattleDecisionStrategy(registration.strategy)
    }

    return true
  }

  /**
   * 获取当前策略名称
   */
  public getCurrentStrategyName(): string {
    return this.currentStrategyName
  }

  /**
   * 获取当前策略
   */
  public getCurrentStrategy(): IBattleDecisionStrategy | undefined {
    const registration = this.strategies.get(this.currentStrategyName)
    return registration?.strategy
  }

  /**
   * 获取所有已注册策略名称
   */
  public getRegisteredStrategyNames(): string[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * 获取策略描述
   */
  public getStrategyDescription(name: string): string | undefined {
    const registration = this.strategies.get(name)
    return registration?.description
  }

  /**
   * 绑定AI实例
   */
  public bindAI(ai: BattleAI): void {
    this.aiInstance = ai
    const currentStrategy = this.getCurrentStrategy()
    if (currentStrategy && 'setBattleDecisionStrategy' in ai) {
      (ai as any).setBattleDecisionStrategy(currentStrategy)
    }
  }

  /**
   * 解绑AI实例
   */
  public unbindAI(): void {
    this.aiInstance = null
  }

  /**
   * 检查策略是否存在
   */
  public hasStrategy(name: string): boolean {
    return this.strategies.has(name)
  }
}

/**
 * 全局策略管理器单例
 */
let strategyManagerInstance: AIStrategyManager | null = null

/**
 * 获取全局策略管理器实例
 */
export function getStrategyManager(): AIStrategyManager {
  if (!strategyManagerInstance) {
    strategyManagerInstance = new AIStrategyManager()
  }
  return strategyManagerInstance
}

/**
 * 策略切换辅助函数
 */
export function switchAIStrategy(strategyName: string): boolean {
  const manager = getStrategyManager()
  return manager.switchStrategy(strategyName)
}

/**
 * 获取当前策略名称
 */
export function getCurrentStrategyName(): string {
  const manager = getStrategyManager()
  return manager.getCurrentStrategyName()
}

/**
 * 注册自定义策略
 */
export function registerCustomStrategy(
  name: string,
  strategy: IBattleDecisionStrategy,
  description?: string,
): void {
  const manager = getStrategyManager()
  manager.registerStrategy(name, strategy, description)
}
