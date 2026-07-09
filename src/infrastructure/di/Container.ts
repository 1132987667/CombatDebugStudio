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

  private constructor() { }

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

export const container = reactive(Container.getInstance())

// 导入所有必要的服务和令牌
import {
  BATTLE_SYSTEM_TOKEN,
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
} from '@/domain/battle/entity/BattleInterfaces'

import { BattleSystem } from '@/domain/battle/BattleSystem'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import { ActionExecutor } from '@/domain/battle/service/ActionExecutor'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { BattleManager } from '@/domain/battle/BattleManager'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import { AutoBattleManager } from '@/domain/battle/auto/AutoBattleManager'
import { InterventionManager } from '@/domain/battle/intervention/InterventionManager'
import { BattleReplayManager } from '@/domain/battle/replay/BattleReplayManager'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { RAFTimer } from '@/shared/utils/RAF'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BuffScriptLoader } from '@/domain/buff/BuffScriptLoader'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { BattleService } from '@/application/facade/BattleFacade'
import { battleEventManager } from '@/domain/battle/events/BattleEventManager'
import { setLogger } from '@/domain/port/logging'
import { LoggerAdapter } from '@/infrastructure/adapters/logging/LoggerAdapter'
import { reactive } from 'vue'

/**
 * 初始化依赖注入容器
 * 集中管理所有服务注册
 * 注意：服务注册顺序很重要，需要先注册被依赖的服务
 */
export function initializeContainer(): void {
  // 0. init logger via port (domain does not depend on infra)
  setLogger(new LoggerAdapter())

  container.clear()

  // 1. 注册基础服务（无依赖或只依赖外部）
  container.register('BuffScriptRegistry', new BuffScriptRegistry())

  // 1.5 注册BuffScriptLoader（依赖BuffScriptRegistry）
  const buffScriptRegistry =
    container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  container.register(
    'BuffScriptLoader',
    new BuffScriptLoader(buffScriptRegistry),
  )

  // 2. 注册BuffSystem（依赖BuffScriptRegistry）
  container.register('BuffSystem', new BuffSystem(buffScriptRegistry))

  // 3. 注册SkillManager（依赖BuffSystem）
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  container.register('SkillManager', new SkillManager(buffSystem))

  // 4. 注册PassiveSkillManager（依赖SkillManager和BuffSystem）
  const skillManager = container.resolve<SkillManager>('SkillManager')
  container.register(
    'PassiveSkillManager',
    PassiveSkillManager.create(skillManager, buffSystem),
  )

  // 5. 注册计算服务
  container.register('DamageCalculator', new DamageCalculator())
  container.register('HealCalculator', new HealCalculator())
  container.register('RAFTimer', new RAFTimer())

  // 6. 注册核心战斗组件（依赖上面注册的服务）
  container.register(TURN_MANAGER_TOKEN.toString(), new TurnManager(buffSystem))
  container.register(
    ACTION_EXECUTOR_TOKEN.toString(),
    new ActionExecutor(buffSystem),
  )
  container.register(AI_SYSTEM_TOKEN.toString(), new AISystem(skillManager))
  container.register(BATTLE_RECORDER_TOKEN.toString(), new BattleRecorder())
  container.register(
    BATTLE_RULE_MANAGER_TOKEN.toString(),
    new BattleRuleManager(),
  )

  // 7. 注册战斗系统（使用容器自动解析依赖）
  container.registerFactory(
    BATTLE_SYSTEM_TOKEN.toString(),
    () => {
      return BattleSystem.createInstanceWithContainer(container as Container)
    },
    true,
  )

  // 注册BattleManager
  container.registerFactory(
    'BattleManager',
    () => {
      const battleSystem: BattleSystem = container.resolve(
        BATTLE_SYSTEM_TOKEN.toString(),
      )

      // 创建并注入所有子管理器
      const battleStateManager = new BattleStateManager(battleSystem)
      const autoBattleManager = new AutoBattleManager(
        battleSystem,
        battleStateManager,
      )
      const interventionManager = new InterventionManager(
        battleSystem,
        battleStateManager,
      )
      const battleReplayManager = new BattleReplayManager()

      const battleManager = new BattleManager(
        battleSystem,
        battleStateManager,
        autoBattleManager,
        interventionManager,
        battleReplayManager,
      )

      // 注入战斗系统引用到事件管理器
      battleEventManager.setBattleSystem(battleSystem, battleStateManager)

      return battleManager
    },
    true,
  )

  // 注册BattleService
  container.registerFactory(
    'BattleService',
    () => {
      const battleManager = container.resolve('BattleManager')
      return new BattleService(battleManager as BattleManager)
    },
    true,
  )
}

/**
 * 重置容器（用于测试）
 */
export function resetContainer(): void {
  container.clear()
  initializeContainer()
}


