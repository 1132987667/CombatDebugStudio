/**
 * 文件: Container.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 依赖注入容器
 * 描述: 实现简单的依赖注入容器，支持服务注册、工厂方法和单例模式
 * 版本: 1.0.0
 */

interface ServiceDefinition<T> {
  instance: T
  factory?: () => T
  singleton: boolean
}

export class Container {
  private static instance: Container
  private services = new Map<string, ServiceDefinition<any>>()

  private constructor() {}

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container()
    }
    return Container.instance
  }

  public register<T>(
    key: string,
    instance: T,
    singleton: boolean = true,
  ): void {
    this.services.set(key, {
      instance,
      singleton,
    })
  }

  public registerFactory<T>(
    key: string,
    factory: () => T,
    singleton: boolean = true,
  ): void {
    this.services.set(key, {
      instance: undefined as any,
      factory,
      singleton,
    })
  }

  public resolve<T>(key: string): T {
    const service = this.services.get(key)
    if (!service) {
      throw new Error(`Service ${key} not found`)
    }

    if (service.singleton) {
      if (!service.instance && service.factory) {
        service.instance = service.factory()
      }
      return service.instance
    } else {
      if (service.factory) {
        return service.factory()
      }
      throw new Error(`Service ${key} has no factory`)
    }
  }

  public has(key: string): boolean {
    return this.services.has(key)
  }

  public clear(): void {
    this.services.clear()
  }
}

export const container = Container.getInstance()

// 导入所有必要的服务和令牌
import {
  BATTLE_SYSTEM_TOKEN,
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  PARTICIPANT_MANAGER_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
} from '@/core/battle/interfaces'

import { GameBattleSystem } from '@/core/BattleSystem'
import { TurnManager } from '@/core/battle/TurnManager'
import { ActionExecutor } from '@/core/battle/ActionExecutor'
import { ParticipantManager } from '@/core/battle/ParticipantManager'
import { AISystem } from '@/core/battle/AISystem'
import { BattleRecorder } from '@/core/battle/BattleRecorder'
import { BattleRuleManager } from '@/core/battle/BattleRuleManager'
import { BattleManager } from '@/core/battle/BattleManager'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import { AutoBattleManager } from '@/core/battle/auto/AutoBattleManager'
import { InterventionManager } from '@/core/battle/intervention/InterventionManager'
import { BattleReplayManager } from '@/core/battle/replay/BattleReplayManager'
import { DamageCalculator } from '@/core/skill/DamageCalculator'
import { HealCalculator } from '@/core/skill/HealCalculator'
import { RAFTimer } from '@/utils/RAF'
import { SkillManager } from '@/core/skill/SkillManager'
import { BuffSystem } from '@/core/BuffSystem'
import { PassiveSkillManager } from '@/core/skill/PassiveSkillManager'
import { BattleParticipantImpl } from '@/core/battle/BattleParticipantImpl'
import { BuffContext } from '@/core/BuffContext'
import { ModifierStack } from '@/core/ModifierStack'
import { BattleAI } from '@/core/BattleAI'
import { CharacterAI } from '@/core/BattleAI'
import { EnemyAI } from '@/core/BattleAI'
import { TaskExecutor } from '@/core/TaskExecutor'

/**
 * 初始化依赖注入容器
 * 集中管理所有服务注册
 */
export function initializeContainer(): void {
  // 注册核心服务
  container.register(TURN_MANAGER_TOKEN.toString(), new TurnManager())
  container.register(ACTION_EXECUTOR_TOKEN.toString(), new ActionExecutor())
  container.register(PARTICIPANT_MANAGER_TOKEN.toString(), new ParticipantManager())
  container.register(AI_SYSTEM_TOKEN.toString(), new AISystem())
  container.register(BATTLE_RECORDER_TOKEN.toString(), new BattleRecorder())
  container.register(BATTLE_RULE_MANAGER_TOKEN.toString(), new BattleRuleManager())
  
  // 注册计算服务
  container.register('DamageCalculator', new DamageCalculator())
  container.register('HealCalculator', new HealCalculator())
  container.register('RAFTimer', new RAFTimer())
  
  // 注册系统服务
  container.register('SkillManager', SkillManager.getInstance())
  container.register('BuffSystem', BuffSystem.getInstance())
  container.register('PassiveSkillManager', PassiveSkillManager.getInstance())
  container.register('TaskExecutor', TaskExecutor.getInstance())

  // 注册战斗系统（使用工厂方法确保单例）
  container.registerFactory(BATTLE_SYSTEM_TOKEN.toString(), () => {
    // 手动创建GameBattleSystem实例并注入依赖
    const turnManager = container.resolve(TURN_MANAGER_TOKEN.toString())
    const actionExecutor = container.resolve(ACTION_EXECUTOR_TOKEN.toString())
    const participantManager = container.resolve(PARTICIPANT_MANAGER_TOKEN.toString())
    const aiSystem = container.resolve(AI_SYSTEM_TOKEN.toString())
    const battleRecorder = container.resolve(BATTLE_RECORDER_TOKEN.toString())
    const ruleManager = container.resolve(BATTLE_RULE_MANAGER_TOKEN.toString())
    const damageCalculator = container.resolve('DamageCalculator')
    const rafTimer = container.resolve('RAFTimer')
    const skillManager = container.resolve('SkillManager')
    const buffSystem = container.resolve('BuffSystem')
    const passiveSkillManager = container.resolve('PassiveSkillManager')
    
    return GameBattleSystem.getInstance(
      turnManager,
      actionExecutor,
      participantManager,
      aiSystem,
      battleRecorder,
      ruleManager,
      damageCalculator,
      rafTimer,
      skillManager,
      buffSystem,
      passiveSkillManager
    )
  }, true)

  // 注册BattleManager
  container.registerFactory('BattleManager', () => {
    const battleSystem = container.resolve(BATTLE_SYSTEM_TOKEN.toString())
    
    // 创建并注入所有子管理器
    const battleStateManager = new BattleStateManager(battleSystem)
    const autoBattleManager = new AutoBattleManager(battleSystem, battleStateManager)
    const interventionManager = new InterventionManager(battleSystem, battleStateManager)
    const battleReplayManager = new BattleReplayManager()
    
    return new BattleManager(
      battleSystem,
      battleStateManager,
      autoBattleManager,
      interventionManager,
      battleReplayManager
    )
  }, true)
}

/**
 * 重置容器（用于测试）
 */
export function resetContainer(): void {
  container.clear()
  initializeContainer()
}
