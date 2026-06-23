/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 2.0.0 - 集成触发器事件系统
 */

import type { IBattleSystem } from '@/domain/battle/entity/BattleInterfaces'
import type {
  BattleAction,
  BattleData,
  BattleEntity,
  BattleState,
  ParticipantSide,
} from '@/types/battle'
import { BattleActionHelper } from '@/types/battle'
import { createDefaultBattleData, convertToBattleState, checkBattleEndCondition as checkEnd } from '@/domain/battle/aggregate/BattleState'
import { BattleLifecycleManager } from '@/domain/battle/service/BattleLifecycleManager'
import { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import type { SkillConfig } from '@/types/skill'
import type { TriggerPhase, TriggerEventContext } from '@/types/buff'

import type { BattleAI } from '@/domain/battle/BattleAI'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { ActionExecutor } from '@/domain/battle/service/ActionExecutor'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import {
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
  TURN_MANAGER_TOKEN,
} from '@/domain/battle/entity/BattleInterfaces'
import type { Container } from '@/infrastructure/di/Container'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import {
  PassiveSkillManager,
  PassiveSkillTrigger,
} from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { eventBus } from '@/main'
import { TriggerEventBus } from '@/domain/buff/TriggerEventBus'
import { BattleEventCodes } from '@/types/battle-events'
import {
  BATTLE_CONSTANTS,
  BattleStatus,
  PARTICIPANT_SIDE,
  RoundStatus,
} from '@/types/battle'
import {
  newLogSegment,
  LogLevel,
  BATTLE_LOG_CATEGORIES,
} from '@/types/battle-log'
import { EFFECT_TYPES } from '@/types/effect'
import type { ExtendedSkillStep } from '@/types/skill'
import { RAFTimer } from '@/shared/utils/RAF'
import { Counter } from '@/shared/utils/Counter'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { ref, Reactive, reactive } from 'vue'

/**
 * 战斗系统核心管理类
 *
 * @class GameBattleSystem
 * @implements {IBattleSystem}
 *
 * @description
 * 负责战斗的完整生命周期管理，包括创建、回合流转、伤害计算及结算。
 *
 * @architecture
 * 1. 【依赖注入】: 通过 DI 容器注入管理器实例，降低耦合。
 * 2. 【事件驱动】: 使用 Eventbus 驱动 UI 动画和状态同步。
 * 3. 【状态隔离】: 每个战斗实例拥有独立的 BattleData 对象，支持并行运行。
 *
 * @features
 * - 支持多场战斗并行运行。
 * - 集成 AI 决策系统。
 * - 支持战斗录像与回放。
 * - 自动战斗与手动战斗模式切换。
 */

export class BattleSystem implements IBattleSystem {
  /**
   * 战斗ID计数器
   */
  private static battleIdCounter = new Counter(1)

  /**
   * 当前战斗数据
   */
  private battleData: BattleData

  /**
   * 当前活跃的战斗 ID（用于防止跨战斗污染）
   * 在 initialize 时设置，在 resetBattle 时清空
   */
  private activeBattleId: string | null = null

  private readonly lifecycleManager: BattleLifecycleManager
  private readonly animationManager: BattleAnimationManager

  /**
   * 当前战斗速度倍率，默认为1
   */
  private battleSpeed = 1

  /**
   * 自动战斗定时器标识，用于取消自动战斗
   */
  private autoBattleTimerId?: symbol

  /**
   * 自动战斗循环函数引用
   */
  private autoBattleLoop?: () => Promise<void>

  /**
   * 私有构造函数，防止外部直接实例化
   * @param turnManager 回合管理器
   * @param actionExecutor 动作执行器
   * @param aiSystem AI系统
   * @param battleRecorder 战斗录像器
   * @param ruleManager 规则管理器
   * @param damageCalculator 伤害计算器
   * @param rafTimer RAF定时器
   * @param skillManager 技能管理器
   * @param buffSystem Buff系统
   * @param passiveSkillManager 被动技能管理器
   */
  private constructor(
    private readonly turnManager: TurnManager,
    private readonly actionExecutor: ActionExecutor,
    private readonly aiSystem: AISystem,
    private readonly battleRecorder: BattleRecorder,
    private readonly ruleManager: BattleRuleManager,
    private readonly damageCalculator: DamageCalculator,
    private readonly rafTimer: RAFTimer,
    private readonly skillManager: SkillManager,
    private readonly buffSystem: BuffSystem,
    private readonly passiveSkillManager: PassiveSkillManager,
  ) {
    this.battleData = this.getDefBattleData()
    this.lifecycleManager = new BattleLifecycleManager(
      () => this.battleData,
      this.rafTimer,
      this.battleRecorder,
      this.buffSystem,
      () => this.processTurnInternal(),
    )
    this.animationManager = new BattleAnimationManager(
      this.rafTimer,
      () => this.battleData?.participants,
      () => this.lifecycleManager.getBattleSpeed() * 200,
    )
  }

  /**
   * 获取触发器事件总线实例
   * @returns 触发器事件总线实例
   */
  private getTriggerEventBus(): TriggerEventBus {
    return this.buffSystem.getEventBus()
  }

  /**
   * 触发战斗事件
   * @param phase 触发阶段
   * @param context 事件上下文
   */
  private emitTriggerEvent(
    phase: TriggerPhase,
    context: Partial<TriggerEventContext>,
  ): void {
    const eventBus = this.getTriggerEventBus()
    const fullContext: TriggerEventContext = {
      phase,
      sourceId: context.sourceId ?? '',
      targetId: context.targetId,
      value: context.value,
      currentTurn: context.currentTurn ?? this.battleData.currentRound,
      battleData: this.battleData,
      ...context,
    }
    eventBus.emit(phase, fullContext)
  }

  /**
   * 使用容器创建战斗系统实例（推荐方式）
   * 容器会自动解析所有依赖
   */
  public static createInstanceWithContainer(
    container: Container,
  ): BattleSystem {
    const turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )
    const actionExecutor = container.resolve<ActionExecutor>(
      ACTION_EXECUTOR_TOKEN.toString(),
    )

    const aiSystem = container.resolve<AISystem>(AI_SYSTEM_TOKEN.toString())
    const battleRecorder = container.resolve<BattleRecorder>(
      BATTLE_RECORDER_TOKEN.toString(),
    )
    const ruleManager = container.resolve<BattleRuleManager>(
      BATTLE_RULE_MANAGER_TOKEN.toString(),
    )
    const damageCalculator =
      container.resolve<DamageCalculator>('DamageCalculator')
    const rafTimer = container.resolve<RAFTimer>('RAFTimer')
    const skillManager = container.resolve<SkillManager>('SkillManager')
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const passiveSkillManager = container.resolve<PassiveSkillManager>(
      'PassiveSkillManager',
    )

    return new BattleSystem(
      turnManager,
      actionExecutor,
      aiSystem,
      battleRecorder,
      ruleManager,
      damageCalculator,
      rafTimer,
      skillManager,
      buffSystem,
      passiveSkillManager,
    )
  }

  /**
   * 生成战斗唯一标识符
   * @returns 战斗ID字符串，格式为 battle_counter.next
   */
  public generateBattleId(): string {
    return `battle_${BattleSystem.battleIdCounter.next()}`
  }

  /**
   * 获取当前回合数
   * @returns 当前回合数（从1开始）
   */
  public getRound(): number {
    return this.battleData.currentRound
  }

  /**
   * 获取Buff系统实例
   * @returns Buff系统实例
   */
  public getBuffSystem(): BuffSystem {
    return this.buffSystem
  }

  /**
   * 获取默认战斗数据对象
   * @returns 初始化的战斗数据对象
   */
  public getDefBattleData(): BattleData {
    return createDefaultBattleData(this.generateBattleId(), this.skillManager)
  }

  /**
   * 初始化战斗
   * @param {BattleEntity[]} allyParticipants - 我方参与者数组
   * @param {BattleEntity[]} enemyParticipants - 敌方参与者数组
   * @returns {BattleState} 初始化后的战斗状态
   */
  public initialize(
    allyParticipants: BattleEntity[],
    enemyParticipants: BattleEntity[],
  ): BattleState {
    const allParticipants = [...allyParticipants, ...enemyParticipants]
    const participants = new Map<string, BattleEntity>()
    allParticipants.forEach((participant) => {
      participants.set(participant.id, participant)
    })
    const battleData = this.battleData
    
    // 【防止跨战斗污染】设置当前活跃战斗 ID
    this.activeBattleId = battleData.battleId
    
    battleData.participants = participants
    console.log('初始化战斗数据', battleData)
    eventBus.emit(BattleEventCodes.TEAM_DATA_CHANGED)


    battleData.aiInstances = this.aiSystem.createAIInstances(participants)
    battleData.skillManager = this.skillManager

    battleData.turnOrder = this.turnManager.createTurnOrder(
      Array.from(participants.values()),
    )
    battleData.currentTurn = 0
    battleData.currentRound = 1
    battleData.battleState = BattleStatus.PREPARING

    this.actionExecutor.registerBattle(
      this.battleData.battleId,
      this.battleData,
    )
    const battleId = this.battleData.battleId
    this.battleRecorder.startRecording(battleId, {
      participants: allParticipants,
    })

    battleLogManager.addSystemLog(
      `战斗双方人员情况: 我方 ${allyParticipants.length} 人 | 敌方 ${enemyParticipants.length} 人`,
    )

    const initAction: BattleAction = {
      id: `init_${Date.now()}`,
      type: 'attack',
      sourceId: 'system',
      targetId: 'system',
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      turn: 0,
      effects: [
        {
          type: 'status',
          description: `战斗开始！参战角色: ${allyParticipants.length} 人，参战敌人: ${enemyParticipants.length} 人`,
          duration: 0,
        },
      ],
    }

    this.addBattleAction(initAction)

    this.battleRecorder.recordAction(battleId, initAction, 0)

    battleData.battleState = BattleStatus.ACTIVE
    battleData.roundState = RoundStatus.START

    const autoBattleRules = this.ruleManager.getAutoBattleRules()
    battleData.autoBattle = autoBattleRules.enabled
    battleData.battleSpeed = autoBattleRules.defaultSpeed

    this.applyPassiveSkills(participants)

    return convertToBattleState(battleData)
  }

  /**
   * 应用所有角色的被动技能效果
   * 被动技能在战斗开始时自动生效
   * @param participants 参与者映射
   */
  private applyPassiveSkills(participants: Map<string, BattleEntity>): void {
    // 触发战斗开始事件
    participants.forEach((participant) => {
      this.emitTriggerEvent('ON_BATTLE_START', {
        sourceId: participant.id,
      })
    })

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassiveSkillsForAll(
      PassiveSkillTrigger.BATTLE_START,
      participants,
    )
  }

  /**
   * 触发单个角色的被动技能
   * 用于在调试面板中动态添加角色时触发被动技能
   * @param participant 参与者
   */
  public triggerPassiveSkillsForCharacter(participant: BattleEntity): void {
    // 触发战斗开始事件
    this.emitTriggerEvent('ON_BATTLE_START', {
      sourceId: participant.id,
    })

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.BATTLE_START,
      participant,
      {},
    )
  }

  /**
   * 内部方法：处理战斗回合的核心逻辑
   * 实现每回合重新计算出手顺序，并按顺序执行所有角色行动
   */
  private async processTurnInternal(): Promise<void> {
    const battle = this.battleData
    if (
      battle.battleState === BattleStatus.PAUSED ||
      battle.battleState !== BattleStatus.ACTIVE
    ) {
      return
    }

    battle.roundState = RoundStatus.START

    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    if (aliveParticipants.length === 0) {
      battle.roundState = RoundStatus.END
      this.checkBattleEndCondition()
      return
    }

    try {
      // 触发回合开始事件
      aliveParticipants.forEach((participant) => {
        this.emitTriggerEvent('ON_TURN_START', {
          sourceId: participant.id,
          currentTurn: battle.currentRound,
        })
      })

      // 触发回合开始时的被动技能
      this.passiveSkillManager.triggerPassiveSkillsForAll(
        PassiveSkillTrigger.TURN_START,
        battle.participants,
        { round: battle.currentRound },
      )

      // 减少所有角色技能冷却
      battle.participants.forEach((participant) => {
        if (
          participant.isAlive() &&
          'reduceSkillCooldowns' in participant &&
          typeof participant.reduceSkillCooldowns === 'function'
        ) {
          participant.reduceSkillCooldowns()
        }
      })

      // 为所有存活角色增加回合开始能量
      const combatRules = this.ruleManager.getCombatRules()
      aliveParticipants.forEach((participant) => {
        participant.gainEnergy(combatRules.energyGainPerTurn)
      })

      // 【脏标记流控】回合开始前批量预计算所有参与者属性
      aliveParticipants.forEach((participant) => {
        if (
          'recalculateAll' in participant &&
          typeof participant.recalculateAll === 'function'
        ) {
          participant.recalculateAll()
        }
      })

      // 计算出手顺序（必须在属性刷新之后，以使用最新的速度值）
      const currentTurnOrder = this.turnManager.recalculateTurnOrder(battle)
      battle.turnOrder = currentTurnOrder
      battle.currentTurn = 0

      // 发送回合开始事件到 UI 层（此时拥有正确的出手顺序）
      const firstActorId = currentTurnOrder.length > 0 ? currentTurnOrder[0] : null
      eventBus.emit(BattleEventCodes.TURN_START, { actorId: firstActorId })

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, 1, currentTurnOrder[0])

      for (let i = 0; i < currentTurnOrder.length; i++) {
        await this.animationManager.waitForAnimation()
        
        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }
        
        const participantId = currentTurnOrder[i]
        const participant = battle.participants.get(participantId)
        if (!participant || !participant.isAlive()) {
          continue
        }
        battle.currentTurn = i
        
        // 在每个角色行动前，发送当前行动者更新事件到 UI 层
        eventBus.emit(BattleEventCodes.TURN_START, { actorId: participantId })
        
        try {
          await this.executeParticipantAction(battle, participant)
        } catch (error) {
          battleLogManager.addDebugLog('角色行动执行出错:', error)
          await this.executeDefaultAction(battle, participant)
        }

        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }
        
        await this.animationManager.waitForAnimation()

        this.buffSystem.updatePerTurn(participant.id, battle.currentRound || 1)

        this.checkBattleEndCondition()

        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }
      }

      await this.animationManager.waitForAnimation()

      // 【竞态条件防护】检查战斗状态是否仍然有效
      if (battle.battleState !== BattleStatus.ACTIVE) {
        return
      }

      // 发送回合结束事件到 UI 层
      eventBus.emit(BattleEventCodes.TURN_END, {})

      // 触发回合结束事件
      const endParticipants = Array.from(battle.participants.values()).filter(
        (p) => p.isAlive(),
      )
      endParticipants.forEach((participant) => {
        this.emitTriggerEvent('ON_TURN_END', {
          sourceId: participant.id,
          currentTurn: battle.currentRound,
        })
      })

      this.passiveSkillManager.triggerPassiveSkillsForAll(
        PassiveSkillTrigger.TURN_END,
        battle.participants,
        { round: battle.currentRound },
      )

      battle.roundState = RoundStatus.END

      this.battleRecorder.recordTurnEnd(battleId, battle.currentRound || 1)

      battle.currentRound++
    } catch (error) {
      battleLogManager.addDebugLog('处理回合时出错:', LogLevel.ERROR, error)
    } finally {
      this.animationManager.cleanupAnimationState()
    }
  }

  /**
   * 检查参与者是否有控制类Buff
   * @param participant 参与者
   * @returns 是否被控制
   */
  private isParticipantControlled(participant: BattleEntity): boolean {
    // 检查是否有眩晕Buff
    if (participant.hasBuff('buff_stun')) {
      return true
    }
    // 检查是否有沉默Buff
    if (participant.hasBuff('buff_silence')) {
      return true
    }
    // 可以添加其他控制类Buff的检查
    return false
  }

  /**
   * 执行单个参与者的行动
   * @param battle 战斗数据
   * @param participant 当前行动者
   */
  private async executeParticipantAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void> {
    console.log(
      `[DEBUG] ===== executeParticipantAction 开始: ${participant.name} =====`,
    )
    try {
      // 检查是否被控制
      if (this.isParticipantControlled(participant)) {
        console.log(`[DEBUG] ${participant.name} 被控制，无法行动`)
        // 被控制，无法行动
        const action = BattleActionHelper.createStatus({
          sourceId: participant.id,
          targetId: participant.id,
          turn: battle.currentRound || 1,
          effects: [
            {
              type: 'status',
              description: `${participant.name} 被控制，无法行动`,
              duration: 0,
            },
          ],
        })

        // 添加控制行动到战斗记录
        this.recordBattleAction(action)

        // 添加战斗日志
        battleLogManager.addBattleLog(
          battle.currentRound || 1,
          `${participant.name} 被控制，无法行动`,
          [{ text: `${participant.name} 被控制，无法行动` }],
          BATTLE_LOG_CATEGORIES.STATUS,
        )

        battleLogManager.addDebugLog(
          `角色[${participant.name}]被控制，无法行动`,
        )
        console.log(
          `[DEBUG] ===== executeParticipantAction 结束(被控制): ${participant.name} =====`,
        )
        return
      }

      console.log(`[DEBUG] ${participant.name} 未被控制，继续执行...`)

      // 获取所有可用主动技能
      const activeSkillIds = participant.getSkillIds('active')
      console.log(
        `[DEBUG] ${participant.name} 主动技能: ${activeSkillIds.join(',') || '无'}`,
      )

      const availableSkills = activeSkillIds.filter((skillId) => {
        const energyCost = this.getSkillEnergyCost(skillId)
        // 检查能量是否足够
        if (participant.currentEnergy < energyCost) {
          return false
        }
        // 检查技能是否冷却
        if (
          'isSkillAvailable' in participant &&
          typeof participant.isSkillAvailable === 'function'
        ) {
          if (!participant.isSkillAvailable(skillId)) {
            return false
          }
        }
        return true
      })

      console.log(
        `[DEBUG] ${participant.name} 可用技能: ${availableSkills.join(',') || '无'}, 当前能量: ${participant.currentEnergy}`,
      )

      // 检查是否使用 AI 系统进行决策
      const aiInstance = battle.aiInstances?.get(participant.id)
      console.log(
        `[DEBUG] ${participant.name} AI实例: ${aiInstance ? '存在' : '不存在'}`,
      )

      if (aiInstance) {
        console.log(`[DEBUG] ${participant.name} 使用AI决策...`)
        // 使用 AI 系统决策
        const action = aiInstance.makeDecision(
          this.convertToBattleState(battle),
          participant,
        )

        console.log(
          `[DEBUG] AI决策结果: type=${action.type}, skillId=${action.skillId || '无'}, targetId=${action.targetId || '无'}`,
        )

        battleLogManager.addDebugLog(
          `AI 决策 [${participant.name}]: ${action.type === 'skill' ? '使用技能' : '普通攻击'}`,
        )

        if (action.type === 'skill' && action.skillId) {
          const skillId = action.skillId
          const skill = this.skillManager.getSkillConfig(skillId)
          console.log(
            `[DEBUG] 尝试执行技能: ${skillId}, 技能配置: ${skill ? '存在' : '不存在'}`,
          )
          if (skill && activeSkillIds.includes(skillId)) {
            console.log(`[DEBUG] 调用 selectAndExecuteSkill`)
            await this.selectAndExecuteSkill(battle, participant, skill)
          } else {
            console.log(`[DEBUG] 技能不可用，改为普通攻击`)
            await this.selectAndExecuteAttack(battle, participant)
          }
        } else {
          console.log(`[DEBUG] AI选择普通攻击`)
          await this.selectAndExecuteAttack(battle, participant)
        }
      } else if (
        availableSkills.length > 0 &&
        Math.random() < BATTLE_CONSTANTS.SKILL_USE_CHANCE &&
        availableSkills[0]
      ) {
        console.log(`[DEBUG] ${participant.name} 无AI实例，随机选择技能`)
        // 没有 AI 实例时使用原来的随机选择逻辑（也过滤了被动技能）
        const selectedSkillId =
          availableSkills[Math.floor(Math.random() * availableSkills.length)]
        const skill = this.skillManager.getSkillConfig(selectedSkillId)
        if (skill) {
          await this.selectAndExecuteSkill(battle, participant, skill)
        } else {
          await this.selectAndExecuteAttack(battle, participant)
        }
      } else {
        await this.selectAndExecuteAttack(battle, participant)
      }

      participant.afterAction()
    } catch (actionError) {
      battleLogManager.addDebugLog(
        `角色[${participant.name}]行动执行出错:`,
        actionError,
      )
      await this.executeDefaultAction(battle, participant)
    }
  }

  /**
   * 选择并执行技能
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置对象
   * @returns 战斗动作
   */
  private async selectAndExecuteSkill(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): Promise<BattleAction> {
    console.log(
      `[DEBUG] ===== selectAndExecuteSkill 开始: ${source.name} 使用 ${skill.id} =====`,
    )
    if (
      'isSkillAvailable' in source &&
      typeof source.isSkillAvailable === 'function'
    ) {
      if (!source.isSkillAvailable(skill.id)) {
        console.log(`[DEBUG] 技能 ${skill.id} 不可用，改为普通攻击`)
        return this.selectAndExecuteAttack(battle, source)
      }
    }

    const energyCost = skill.energyCost ?? 0
    console.log(
      `[DEBUG] 技能消耗能量: ${energyCost}, 当前能量: ${source.currentEnergy}`,
    )
    source.spendEnergy(energyCost)

    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: '',
      skillId: skill.id,
      skillName: skill.name,
      turn: battle.currentRound || 1,
    })

    console.log(`[DEBUG] 获取技能目标...`)
    const targets = this.getSkillTargets(battle, source, skill)
    console.log(
      `[DEBUG] 技能目标: ${targets.map((t) => t.name).join(',') || '无'}`,
    )

    if (targets.length === 0) {
      battleLogManager.addDebugLog(`技能执行失败: 未找到有效目标 ${skill.id}`)
      console.log(`[DEBUG] 未找到有效目标，改为普通攻击`)
      return this.selectAndExecuteAttack(battle, source)
    }

    action.targetId = targets[0].id

    try {
      console.log(`[DEBUG] 开始执行技能效果...`)
      let totalDamage = 0
      let totalHeal = 0
      const allEffects: any[] = []

      for (const target of targets) {
        if (!target.isAlive()) {
          console.log(`[DEBUG] 目标 ${target.name} 已死亡，跳过`)
          continue
        }

        console.log(`[DEBUG] 对 ${target.name} 执行技能 ${skill.id}`)
        const skillAction = this.skillManager.executeSkill(
          skill.id,
          source,
          target,
          undefined,
          Array.from(battle.participants.values()),
        )
        console.log(
          `[DEBUG] 技能执行结果: damage=${skillAction.damage}, heal=${skillAction.heal}`,
        )

        totalDamage += skillAction.damage
        totalHeal += skillAction.heal
        allEffects.push(...skillAction.effects)
      }

      action.damage = totalDamage
      action.heal = totalHeal
      action.effects = allEffects

      const targetNames = targets.map((t) => t.name).join(', ')
      battleLogManager.addBattleLog(
        battle.currentTurn,
        `技能执行成功: ${skill.id}`,
        [
          {
            text: `${source.name} 对 ${targetNames} 使用 ${skill.name || skill.id}`,
          },
        ],
        BATTLE_LOG_CATEGORIES.ACTION,
      )
      console.log(
        `[DEBUG] 技能执行成功: ${skill.id}, 总伤害=${totalDamage}, 总治疗=${totalHeal}`,
      )
    } catch (error) {
      battleLogManager.addDebugLog(`技能执行失败: ${skill.id}`, error)
      console.log(`[DEBUG] 技能执行失败: ${error}`)
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects = [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        },
      ]
    }

    this.recordBattleAction(action)
    console.log(
      `[DEBUG] ===== selectAndExecuteSkill 结束: ${source.name} =====`,
    )

    return action
  }

  /**
   * 获取技能的所有目标
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置
   * @returns 目标参与者数组
   */
  private getSkillTargets(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): BattleEntity[] {
    const selector = skill.selector || 'single_enemy'
    const participants = Array.from(battle.participants.values())

    if (selector === 'self') {
      return [source]
    }

    // 添加：选择生命值最低的友方
    if (selector === 'lowest_ally') {
      const allies = participants.filter(
        (p) => p.isAlive() && p.team === source.team && p.id !== source.id,
      )
      if (allies.length === 0) {
        return [source]
      }
      const lowest = allies.reduce((min, p) => {
        const hpRatio = p.currentHealth / p.maxHealth
        const minHpRatio = min.currentHealth / min.maxHealth
        return hpRatio < minHpRatio ? p : min
      })
      return [lowest]
    }

    // 添加：选择生命值最低的敌人
    if (selector === 'lowest_enemy') {
      const isEnemy = source.team === PARTICIPANT_SIDE.ALLY
      const enemies = participants.filter(
        (p) =>
          p.isAlive() &&
          p.team === (isEnemy ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY),
      )
      if (enemies.length === 0) {
        return [source]
      }
      const lowest = enemies.reduce((min, p) => {
        const hpRatio = p.currentHealth / p.maxHealth
        const minHpRatio = min.currentHealth / min.maxHealth
        return hpRatio < minHpRatio ? p : min
      })
      return [lowest]
    }

    const isEnemy = source.team === PARTICIPANT_SIDE.ALLY

    if (selector.includes('all_enemies')) {
      return participants.filter(
        (p) =>
          p.isAlive() &&
          p.team === (isEnemy ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY),
      )
    }

    if (selector.includes('all_allies')) {
      return participants.filter((p) => p.isAlive() && p.team === source.team)
    }

    const targetId = this.selectTargetForSkill(battle, source, skill)
    const target = battle.participants.get(targetId)
    return target ? [target] : []
  }

  /**
   * 根据技能配置选择目标
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置
   * @returns 选中的目标 ID
   */
  private selectTargetForSkill(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): string {
    const selector = skill.selector || 'single_enemy'
    const participants = Array.from(battle.participants.values())

    if (selector.includes('self')) {
      return source.id
    }

    const isEnemy = source.team === PARTICIPANT_SIDE.ALLY
    const targets = participants.filter(
      (p) =>
        p.isAlive() &&
        p.team === (isEnemy ? PARTICIPANT_SIDE.ALLY : PARTICIPANT_SIDE.ENEMY),
    )

    if (targets.length === 0) {
      return source.id
    }

    if (
      skill.steps.some((step) => step.type === 'HEAL' || step.type === 'BUFF')
    ) {
      const lowestHpTarget = targets.reduce((min, p) => {
        const hpRatio = p.currentHealth / p.maxHealth
        const minHpRatio = min.currentHealth / min.maxHealth
        return hpRatio < minHpRatio ? p : min
      })
      return lowestHpTarget.id
    } else {
      const randomIndex = Math.floor(Math.random() * targets.length)
      return targets[randomIndex].id
    }
  }

  /**
   * 构造普通攻击的技能步骤配置
   * @param source 攻击者
   * @param targetId 目标 ID
   * @returns 技能步骤配置
   */
  private buildNormalAttackStep(
    source: BattleEntity,
    targetId: string,
  ): ExtendedSkillStep {
    return {
      type: 'DAMAGE',
      id: 'normal_attack',
      targetId,
      calculation: {
        baseValue: 0,
        extraValues: [{ attribute: 'ATK', ratio: 1.0 }],
      },
      attackType: 'physical',
      targetModifiers: { DEF: 1 },
      criticalConfig: {
        rate: (source.getAttribute('critRate') || 10) / 100,
        multiplier: (source.getAttribute('critDamage') || 125) / 100,
      },
    }
  }

  /**
   * 创建战斗动作对象
   * @param sourceId 攻击者ID
   * @param targetId 目标ID
   * @param turnNumber 当前回合数
   * @returns 战斗动作对象
   */
  private createBattleAction(
    sourceId: string,
    targetId: string,
    turnNumber: number,
  ): BattleAction {
    return BattleActionHelper.createAttack({
      sourceId,
      targetId,
      turn: turnNumber,
    })
  }

  /**
   * 生成攻击日志参数
   * @param source 攻击者
   * @param target 目标
   * @param turnNumber 当前回合数
   * @param options 日志选项
   * @returns 日志参数对象
   */
  private generateAttackLogParams(
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
    options: {
      isMiss?: boolean
      damage?: number
      isCritical?: boolean
    },
  ): {
    turn: number
    message: string
    segments: import('@/types/battle-log').LogSegment[]
    category: import('@/types/battle-log').BattleLogCategory
  } {
    const { isMiss = false, damage = 0, isCritical = false } = options

    if (isMiss) {
      return {
        turn: turnNumber,
        message: `${source.name} 对 ${target.name} 发动普通攻击，但是被闪避了！`,
        segments: [
          { text: source.name, classStr: 'log-hostile' },
          { text: ' 对 ' },
          { text: target.name, classStr: 'log-friendly' },
          { text: ' 发动普通攻击，但是被闪避了！' },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
      }
    }

    return {
      turn: turnNumber,
      message: `${source.name} 对 ${target.name} 发动普通攻击，${isCritical ? '暴击！' : ''}造成 ${damage} 点物理伤害`,
      segments: [
        {
          text: source.name,
          classStr:
            source.type === PARTICIPANT_SIDE.ALLY
              ? 'log-friendly'
              : 'log-hostile',
        },
        { text: ' 对 ' },
        {
          text: target.name,
          classStr:
            target.type === PARTICIPANT_SIDE.ALLY
              ? 'log-friendly'
              : 'log-hostile',
        },
        { text: ` 发动普通攻击，${isCritical ? '暴击！' : ''}造成 ` },
        {
          text: damage.toString(),
          classStr: isCritical ? 'log-crit' : 'log-damage',
        },
        { text: ' 点物理伤害' },
      ],
      category: isCritical
        ? BATTLE_LOG_CATEGORIES.CRIT
        : BATTLE_LOG_CATEGORIES.DAMAGE,
    }
  }

  /**
   * 对目标应用伤害并触发相关被动技能
   * @param source 攻击者
   * @param target 目标
   * @param damage 伤害值
   */
  private applyDamageToTarget(
    source: BattleEntity,
    target: BattleEntity,
    damage: number,
  ): void {
    target.takeDamage(damage)

    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.ON_HIT,
      target,
      { sourceId: source.id, damage },
    )

    if (!target.isAlive()) {
      this.passiveSkillManager.triggerPassiveSkills(
        PassiveSkillTrigger.ON_DEATH,
        target,
        { sourceId: source.id, cause: 'damage' },
      )
    }
  }

  /**
   * 处理攻击被闪避的情况
   * @param action 战斗动作
   * @param source 攻击者
   * @param target 目标
   * @param turnNumber 当前回合数
   */
  private async handleMissAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
  ): Promise<void> {
    action.effects.push({
      type: EFFECT_TYPES.MISS,
      value: 0,
      description: `${target.name} 闪避了攻击`,
    })

    await this.animationManager.triggerMissAnimationAndWait({ targetId: target.id })

    const logParams = this.generateAttackLogParams(source, target, turnNumber, {
      isMiss: true,
    })
    battleLogManager.addBattleLog(
      logParams.turn,
      logParams.message,
      logParams.segments,
      logParams.category,
    )

    battleLogManager.addDebugLog(
      `普通攻击: ${source.name} → ${target.name}，被闪避`,
    )
  }

  /**
   * 处理攻击命中的情况
   * @param action 战斗动作
   * @param source 攻击者
   * @param target 目标
   * @param damageResult 伤害计算结果
   * @param turnNumber 当前回合数
   */
  private async handleHitAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    damageResult: { damage: number; isCritical: boolean },
    turnNumber: number,
  ): Promise<void> {
    console.log(
      `[DEBUG] handleHitAttack: ${source.name} -> ${target.name}, damage=${damageResult.damage}, isCritical=${damageResult.isCritical}`,
    )
    const { damage, isCritical } = damageResult
    action.damage = damage

    console.log(
      `[DEBUG] 应用伤害前: ${target.name} HP=${target.currentHealth}/${target.maxHealth}`,
    )
    this.applyDamageToTarget(source, target, damage)
    console.log(
      `[DEBUG] 应用伤害后: ${target.name} HP=${target.currentHealth}/${target.maxHealth}`,
    )

    action.effects.push({
      type: EFFECT_TYPES.DAMAGE,
      value: damage,
      description: `${source.name} 普通攻击 造成 ${damage} 伤害${isCritical ? ' (暴击)' : ''}`,
    })

    console.log(`[DEBUG] 触发伤害动画...`)
    await this.animationManager.triggerDamageAnimationAndWait({
      targetId: target.id,
      damage,
      damageType: 'physical',
      isCritical,
      isHeal: false,
    })
    console.log(`[DEBUG] 伤害动画完成`)

    const logParams = this.generateAttackLogParams(source, target, turnNumber, {
      damage,
      isCritical,
    })
    battleLogManager.addBattleLog(
      logParams.turn,
      logParams.message,
      logParams.segments,
      logParams.category,
    )

    battleLogManager.addDebugLog(
      `普通攻击: ${source.name} → ${target.name}`,
      LogLevel.INFO,
    )
  }

  /**
   * 选择并执行普通攻击
   * @param battle 战斗数据
   * @param source 攻击者
   * @returns 战斗动作
   */
  private async selectAndExecuteAttack(
    battle: BattleData,
    source: BattleEntity,
  ): Promise<BattleAction> {
    const targetId = this.selectTarget(battle, source)
    const target = battle.participants.get(targetId)

    if (!target) {
      battleLogManager.addDebugLog(`攻击失败: 未找到目标 ${targetId}`)
      return this.createBattleAction(
        source.id,
        source.id,
        battle.currentRound || 1,
      )
    }

    const roundNumber = battle.currentRound || 1

    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.BEFORE_ATTACK,
      source,
      { targetId, battle },
    )

    const attackStep = this.buildNormalAttackStep(source, targetId)
    const damageResult = this.damageCalculator.calculateDamage(
      attackStep,
      source,
      target,
    )

    const action = this.createBattleAction(source.id, targetId, roundNumber)

    if (damageResult.isMiss) {
      await this.handleMissAttack(action, source, target, roundNumber)
    } else {
      await this.handleHitAttack(
        action,
        source,
        target,
        damageResult,
        roundNumber,
      )
    }

    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.AFTER_ATTACK,
      source,
      {
        targetId,
        damage: action.damage,
        isCritical: damageResult.isCritical,
      },
    )

    this.recordBattleAction(action)

    return action
  }

  /**
   * 选择攻击目标
   * @param battle 战斗数据
   * @param source 行动者
   * @returns 目标参与者ID
   */
  private selectTarget(battle: BattleData, source: BattleEntity): string {
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.type !== source.type && p.isAlive(),
    )

    if (enemies.length === 0) {
      return source.id
    }

    return enemies[Math.floor(Math.random() * enemies.length)].id
  }

  /**
   * 获取技能能量消耗
   * @param skillId 技能ID
   * @returns 能量消耗
   */
  private getSkillEnergyCost(skillId: string): number {
    const skillConfig = this.skillManager.getSkillConfig(skillId)
    if (skillConfig && skillConfig.energyCost !== undefined) {
      return skillConfig.energyCost
    }
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 150
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50
    }
    return 0
  }

  /**
   * 处理战斗回合
   */
  public async processTurn(): Promise<void> {
    await this.processTurnInternal()
  }

  /**
   * 执行默认行动（当AI决策失败或无效时使用）
   * @param {BattleData} battle - 战斗数据
   * @param {BattleEntity} participant - 当前行动者
   */
  private async executeDefaultAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void> {
    // 获取所有存活的敌人和角色
    const enemies = Array.from(battle.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ENEMY && p.isAlive())
      .map((p) => p.id)

    const characters = Array.from(battle.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ALLY && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    // 根据参与者类型选择目标
    if (participant.type === PARTICIPANT_SIDE.ALLY && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage = Math.floor(Math.random() * 20) + 10 // 10-30伤害
    } else if (
      participant.type === PARTICIPANT_SIDE.ENEMY &&
      characters.length > 0
    ) {
      targetId = characters[Math.floor(Math.random() * characters.length)]
      damage = Math.floor(Math.random() * 15) + 8 // 8-23伤害
    } else {
      return // 没有有效目标
    }

    // 执行默认攻击动作
    await this.executeAction({
      id: `action_${Date.now()}`,
      type: 'attack',
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      turn: battle.currentRound || 1,
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: damage,
          description: `${participant.name} 普通攻击 造成 ${damage} 伤害`,
        },
      ],
    })
  }

  /**
   * 执行战斗动作
   * @param {BattleAction} action - 战斗动作
   * @returns {Promise<BattleAction>} 执行后的战斗动作（包含实际效果）
   */
  public async executeAction(action: BattleAction): Promise<BattleAction> {
    console.log(`[DEBUG] ===== executeAction 开始: type=${action.type} =====`)
    const battle = this.battleData
    if (!battle) {
      throw new Error('No active battle found')
    }

    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    console.log(
      `[DEBUG] 执行动作: ${source?.name || action.sourceId} -> ${target?.name || action.targetId}`,
    )

    if (!source || !target) {
      throw new Error(`Invalid source or target in action`)
    }

    // 处理技能执行
    if (action.type === 'skill' && action.skillId) {
      console.log(`[DEBUG] 执行技能: ${action.skillId}`)
      try {
        // 使用新的技能管理器执行技能
        const skillAction = this.skillManager.executeSkill(
          action.skillId,
          source,
          target,
          undefined,
          Array.from(battle.participants.values()),
        )
        console.log(
          `[DEBUG] 技能执行完成: damage=${skillAction.damage}, heal=${skillAction.heal}`,
        )

        // 合并技能执行结果
        action.damage = skillAction.damage
        action.heal = skillAction.heal
        action.effects = skillAction.effects

        // 检查是否有闪避效果
        const hasMissEffect = skillAction.effects.some(
          (effect) => effect.type === EFFECT_TYPES.MISS,
        )
        if (hasMissEffect) {
          console.log(`[DEBUG] 检测到闪避效果`)
          // 触发闪避动画并等待完成
          await this.triggerMissAnimationAndWait({
            targetId: target.id,
          })
        }

        // 检查是否有buff效果并触发相应事件
        for (const effect of skillAction.effects) {
          if (
            effect.type === EFFECT_TYPES.BUFF ||
            effect.type === EFFECT_TYPES.DEBUFF
          ) {
            console.log(`[DEBUG] 检测到buff效果: ${effect.buffId}`)
            // 确定buff目标 - 通过 targetId 判断作用目标
            let buffTarget = target
            if (effect.targetId === source.id) {
              buffTarget = source
            }

            // 触发buff添加动画并等待完成
            await this.animationManager.triggerBuffEffectAndWait({
              targetId: buffTarget.id,
              buffName: effect.buffId || 'unknown',
              isPositive: effect.type === EFFECT_TYPES.BUFF,
            })
          }
        }

        // 触发技能效果动画
        await this.animationManager.triggerSkillEffectAnimation({
          sourceId: source.id,
          targetId: target.id,
          skillName: action.skillId,
          effectType: action.type,
          damageType: 'skill',
        })

        battleLogManager.addDebugLog(`技能执行成功: ${action.skillId}`, {
          source: source.name,
          target: target.name,
          damage: action.damage,
          heal: action.heal,
          hasMiss: hasMissEffect,
        })
      } catch (error) {
        battleLogManager.addDebugLog(`技能执行失败: ${action.skillId}`, error)
        // 技能执行失败，降级为普通攻击
        action.type = 'attack'
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [
          {
            type: EFFECT_TYPES.DAMAGE,
            value: action.damage,
            description: `${source.name} 普通攻击 (技能执行失败)`,
          },
        ]
      }
    }

    // 应用伤害（如果技能执行失败或使用普通攻击）
    if (action.damage && action.damage > 0) {
      const actualDamage = target.takeDamage(action.damage)
      action.damage = actualDamage

      // 触发受击时的被动技能
      this.passiveSkillManager.triggerPassiveSkills(
        PassiveSkillTrigger.ON_HIT,
        target,
        { sourceId: source.id, damage: actualDamage },
      )

      // 检查目标是否死亡，如果死亡则触发死亡时的被动技能
      if (!target.isAlive()) {
        this.passiveSkillManager.triggerPassiveSkills(
          PassiveSkillTrigger.ON_DEATH,
          target,
          { sourceId: source.id, cause: 'damage' },
        )
      }

      // 记录伤害日志
      battleLogManager.addDebugLog(
        `Damage dealt: ${source.name} → ${target.name}`,
        {
          damage: actualDamage,
          targetHealth: target.currentHealth,
        },
      )

      // 触发伤害动画并等待完成
      await this.animationManager.triggerDamageAnimationAndWait({
        targetId: target.id,
        damage: actualDamage,
        damageType: action.type === 'skill' ? 'skill' : 'physical',
        isCritical: false, // 需要从效果中获取
        isHeal: false,
      })
    }

    // 应用治疗
    if (action.heal && action.heal > 0) {
      const actualHeal = target.heal(action.heal)
      action.heal = actualHeal

      // 记录治疗日志
      battleLogManager.addDebugLog(
        `Heal applied: ${source.name} → ${target.name}`,
        {
          heal: actualHeal,
          targetHealth: target.currentHealth,
        },
      )

      // 触发治疗动画并等待完成
      await this.animationManager.triggerDamageAnimationAndWait({
        targetId: target.id,
        damage: actualHeal,
        damageType: 'heal',
        isCritical: false,
        isHeal: true,
      })
    }

    // 添加动作到战斗记录
    this.recordBattleAction(action)

    // 行动后处理
    source.afterAction()

    return action
  }

  /**
   * 添加战斗动作到记录
   * @param action - 战斗动作
   */
  private addBattleAction(action: BattleAction): void {
    const battle = this.battleData
    if (battle) {
      battle.actions.push(action)

      if (battle.actions.length > 100) {
        battle.actions = battle.actions.slice(-100)
      }
    }
  }

  /**
   * 记录战斗动作
   * @param action 战斗动作
   */
  private recordBattleAction(action: BattleAction): void {
    this.addBattleAction(action)
    const battleId = this.battleData.battleId
    this.battleRecorder.recordAction(
      battleId,
      action,
      this.battleData.currentRound || 1,
    )
  }

  /**
   * 检查战斗结束条件
   */
  private checkBattleEndCondition(): void {
    const battle = this.battleData
    if (!battle) return
    const result = checkEnd(battle.participants, battle.currentRound, battle.maxTurns)
    if (result.shouldEnd && result.winner) {
      this.endBattle(result.winner)
      if (battle.currentRound >= battle.maxTurns) {
        const winnerLabel = result.winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'
        battleLogManager.addBattleLog(
          battle.currentRound,
          `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
          [{ text: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜` }],
          BATTLE_LOG_CATEGORIES.STATUS,
        )
      }
    }
  }

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  public async endBattle(winner: ParticipantSide): Promise<void> {
    return this.lifecycleManager.endBattle(winner)
  }

  public resetBattle(): void {
    this.lifecycleManager.resetBattle()
  }

  public getBattleStatus(): string | undefined {
    return this.battleData?.battleState
  }

  public getRoundState(): RoundStatus | undefined {
    return this.battleData?.roundState
  }

  public isBattleInState(state: string): boolean {
    return this.battleData?.battleState === state
  }

  public isBattleEnded(): boolean {
    return this.isBattleInState(BattleStatus.ENDED)
  }

  public getAutoBattle(): boolean {
    return this.lifecycleManager.getAutoBattle()
  }

  public getIsPaused(): boolean {
    return this.lifecycleManager.getIsPaused()
  }

  public getBattleSpeed(): number {
    return this.lifecycleManager.getBattleSpeed()
  }

  public setSpeed(speed: number): void {
    this.lifecycleManager.setSpeed(speed)
  }

  public togglePause(): void {
    this.lifecycleManager.togglePause()
  }

  public isBattleInProgress(): boolean {
    return this.lifecycleManager.isBattleInProgress()
  }

  public getBattleState(): BattleState | undefined {
    const battle = this.battleData
    if (!battle) return undefined
    return convertToBattleState(battle)
  }

  public startBattle(): void {
    this.lifecycleManager.startBattle()
  }

  public stopAutoBattle(): void {
    this.lifecycleManager.stopAutoBattle()
  }

  /**
   * 获取技能管理器实例
   */
  public getSkillManager(): SkillManager {
    return this.skillManager
  }

  /**
   * 加载技能配置
   */
  public loadSkillConfigs(skillConfigs: any[]): void {
    this.skillManager.loadSkillConfigs(skillConfigs)
  }

  /**
   * 获取伤害计算日志
   */
  public getDamageCalculationLogs(): any[] {
    return this.skillManager.getDamageCalculationLogs()
  }

  /**
   * 获取治疗计算日志
   */
  public getHealCalculationLogs(): any[] {
    return this.skillManager.getHealCalculationLogs()
  }

  /**
   * 清空所有计算日志
   */
  public clearCalculationLogs(): void {
    this.skillManager.clearCalculationLogs()
  }

  // 战斗记录相关方法（从原始版本继承）

  /**
   * 获取战斗记录
   */
  public getBattleRecording(battleId: string) {
    return this.battleRecorder.getRecording(battleId)
  }

  /**
   * 获取所有战斗记录
   */
  public getAllBattleRecordings() {
    return this.battleRecorder.getAllRecordings()
  }

  /**
   * 保存战斗记录
   */
  public saveBattleRecording(battleId: string, name?: string) {
    return this.battleRecorder.saveRecording(battleId, name)
  }

  /**
   * 加载战斗记录
   */
  public loadBattleRecording(saveKey: string) {
    return this.battleRecorder.loadRecording(saveKey)
  }

  /**
   * 获取保存的战斗记录列表
   */
  public getSavedBattleRecordingsList() {
    return this.battleRecorder.getSavedRecordingsList()
  }

  /**
   * 删除战斗记录
   */
  public deleteBattleRecording(saveKey: string) {
    return this.battleRecorder.deleteRecording(saveKey)
  }

  /**
   * 清空所有战斗记录
   */
  public clearAllBattleRecordings() {
    this.battleRecorder.clearRecordings()
  }

  /**
   * 回合执行事件
   */
  public onTurnExecuted(turnNumber: number): void {
    battleLogManager.addDebugLog(`回合 ${turnNumber} 执行完成`)
  }

  /**
   * 获取当前所有参与者信息
   * @returns 参与者数组
   */
  public getCurParticipantsInfo(): BattleEntity[] {
    return Array.from(this.battleData.participants.values())
  }

  /**
   * 获取当前战斗数据
   */
  public getBattleData(): BattleData | undefined {
    return this.battleData
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  public setBattleSpeed(speed: number): void {
    const battle = this.battleData
    if (battle) {
      battle.battleSpeed = speed
    }
  }

}
