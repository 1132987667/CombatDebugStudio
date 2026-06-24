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

// 瀵煎叆鎵€鏈夊繀瑕佺殑鏈嶅姟鍜屼护鐗?
import {
  BATTLE_SYSTEM_TOKEN,
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  PARTICIPANT_MANAGER_TOKEN,
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
import type { IBattleSystem } from '@/domain/battle/entity/BattleInterfaces'
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
import { TaskExecutor } from '@/infrastructure/task/TaskExecutor'
import { BattleService } from '@/application/facade/BattleFacade'
import { battleEventManager } from '@/domain/battle/events/BattleEventManager'
import { setLogger } from '@/domain/port/logging'
import { LoggerAdapter } from '@/infrastructure/adapters/logging/LoggerAdapter'
import { reactive } from 'vue'

/**
 * 鍒濆鍖栦緷璧栨敞鍏ュ鍣?
 * 闆嗕腑绠＄悊鎵€鏈夋湇鍔℃敞鍐?
 * 娉ㄦ剰锛氭湇鍔℃敞鍐岄『搴忓緢閲嶈锛岄渶瑕佸厛娉ㄥ唽琚緷璧栫殑鏈嶅姟
 */
export function initializeContainer(): void {
  // 0. init logger via port (domain does not depend on infra)
  setLogger(new LoggerAdapter())

  container.clear()

  // 1. 娉ㄥ唽鍩虹鏈嶅姟锛堟棤渚濊禆鎴栧彧渚濊禆澶栭儴锛?
  container.register('BuffScriptRegistry', new BuffScriptRegistry())

  // 1.5 娉ㄥ唽BuffScriptLoader锛堜緷璧朆uffScriptRegistry锛?
  const buffScriptRegistry =
    container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  container.register(
    'BuffScriptLoader',
    new BuffScriptLoader(buffScriptRegistry),
  )

  // 2. 娉ㄥ唽BuffSystem锛堜緷璧朆uffScriptRegistry锛?
  container.register('BuffSystem', new BuffSystem(buffScriptRegistry))

  // 3. 娉ㄥ唽SkillManager锛堜緷璧朆uffSystem锛?
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  container.register('SkillManager', new SkillManager(buffSystem))

  // 4. 娉ㄥ唽PassiveSkillManager锛堜緷璧朣killManager鍜孊uffSystem锛?
  const skillManager = container.resolve<SkillManager>('SkillManager')
  container.register(
    'PassiveSkillManager',
    PassiveSkillManager.create(skillManager, buffSystem),
  )

  // 5. 娉ㄥ唽璁＄畻鏈嶅姟
  container.register('DamageCalculator', new DamageCalculator())
  container.register('HealCalculator', new HealCalculator())
  container.register('RAFTimer', new RAFTimer())

  // 6. 娉ㄥ唽鏍稿績鎴樻枟缁勪欢锛堜緷璧栦笂闈㈡敞鍐岀殑鏈嶅姟锛?
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

  // 7. 娉ㄥ唽鎴樻枟绯荤粺锛堜娇鐢ㄥ鍣ㄨ嚜鍔ㄨВ鏋愪緷璧栵級
  container.registerFactory(
    BATTLE_SYSTEM_TOKEN.toString(),
    () => {
      return BattleSystem.createInstanceWithContainer(container as Container)
    },
    true,
  )

  // 8. 娉ㄥ唽TaskExecutor锛堜緷璧朑ameBattleSystem锛?
  const battleSystem = container.resolve<any>(BATTLE_SYSTEM_TOKEN.toString())
  container.register('TaskExecutor', new TaskExecutor(battleSystem))

  // 娉ㄥ唽BattleManager
  container.registerFactory(
    'BattleManager',
    () => {
      const battleSystem: IBattleSystem = container.resolve(
        BATTLE_SYSTEM_TOKEN.toString(),
      )

      // 鍒涘缓骞舵敞鍏ユ墍鏈夊瓙绠＄悊鍣?
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

      // 娉ㄥ叆鎴樻枟绯荤粺寮曠敤鍒颁簨浠剁鐞嗗櫒
      battleEventManager.setBattleSystem(battleSystem, battleStateManager)

      return battleManager
    },
    true,
  )

  // 娉ㄥ唽BattleService
  container.registerFactory(
    'BattleService',
    () => {
      const battleManager = container.resolve('BattleManager')
      return new BattleService(battleManager)
    },
    true,
  )
}

/**
 * 閲嶇疆瀹瑰櫒锛堢敤浜庢祴璇曪級
 */
export function resetContainer(): void {
  container.clear()
  initializeContainer()
}


