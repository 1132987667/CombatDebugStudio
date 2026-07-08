/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 2.0.0 - 集成触发器事件系统
 */

import type { IBattleSystem } from '@/domain/battle/entity/BattleInterfaces'
import { BattleActionHelper } from '@/domain/battle/types'
import type {
  BattleAction,
  BattleData,
  BattleEntity,
  BattleState,
  ParticipantSide,
} from '@/domain/battle/types'
import type { BattleCommand } from '@/shared/types/battle-commands'
import { createDefaultBattleData, convertToBattleState } from '@/domain/battle/aggregate/BattleState'
import { BattleLifecycleManager } from '@/domain/battle/service/BattleLifecycleManager'
import { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import type { TriggerEventContext } from '@/domain/buff/types'
import { BattleTriggerPhase } from '@/domain/battle/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { BUFF_ID as STUN_BUFF_ID } from '@/domain/buff/scripts/combat/StunDebuff'
import { ActionExecutor } from '@/domain/battle/service/ActionExecutor'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import {
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
  TURN_MANAGER_TOKEN,
} from '@/domain/battle/entity/BattleInterfaces'
import type { Container } from '@/infrastructure/di/Container'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { eventBus } from '@/main'
import { TriggerEventBus } from '@/infrastructure/adapters/event/TriggerEventBus'
import { BattleEventCodes } from '@/shared/types/battle-events'
import {
  BattleStatus,
  PARTICIPANT_SIDE,
  RoundStatus,
} from '@/domain/battle/types'
import {
  ATTRIBUTE_CODE,
} from '@/domain/attribute/types'
import {
  LogLevel,
  BATTLE_LOG_CATEGORIES,
} from '@/shared/types/battle-log'
import { RAFTimer } from '@/shared/utils/RAF'
import { Counter } from '@/shared/utils/Counter'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { debugGate } from '@/domain/battle/debug/DebugGate'
import type { SkillConfig } from '@/domain/skill/types'

/**
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

/** 动作日志保留上限 */
const MAX_ACTION_HISTORY = 100

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

  /** 战斗执行器 */
  private readonly executor: BattleExecutor

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
    this.executor = new BattleExecutor(
      this.skillManager,
      this.damageCalculator,
      this.passiveSkillManager,
      this.battleRecorder,
      this.animationManager,
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
    phase: BattleTriggerPhase,
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
      // 为 BattleParticipantImpl 实例设置修饰符提供者，打通 ModifierStack → AttributeValue 同步
      if (participant instanceof BattleParticipantImpl) {
        participant.setModifierProvider(this.buffSystem)
        participant.setBuffQuery(this.buffSystem)
      }
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

    battleLogManager.addSystemLog({
      message: `战斗双方人员情况: 我方 ${allyParticipants.length} 人 | 敌方 ${enemyParticipants.length} 人`,
    }
      
    )
    battleData.roundState = RoundStatus.START

    const autoBattleRules = this.ruleManager.getAutoBattleRules()
    battleData.autoBattle = autoBattleRules.enabled
    battleData.battleSpeed = autoBattleRules.defaultSpeed
    battleData.maxTurns = this.ruleManager.getTurnSystemRules().maxTurns

    this.applyPassiveSkills(participants)

    // 注册属性变化回调，Buff 修改 ModifierStack 后自动同步到参与者
    this.buffSystem.setAttributeChangeCallback((characterId: string) => {
      const participant = battleData.participants.get(characterId)
      if (participant instanceof BattleParticipantImpl) {
        participant.recalculateAll()
      }
    })

    // 注册伤害/治疗回调，Buff 触发器可直接对目标造成伤害或治疗
    this.buffSystem.setDamageCallback((targetId: string, damage: number, damagePercent?: number) => {
      const target = battleData.participants.get(targetId)
      if (target?.isAlive()) {
        let actualDamage = damage
        if (damagePercent && damagePercent > 0) {
          actualDamage = Math.max(1, Math.floor(target.currentHealth * damagePercent))
        }
        target.takeDamage(actualDamage)
        this.emitTriggerEvent(BattleTriggerPhase.DAMAGE_TAKEN, {
          sourceId: '',
          targetId,
          value: actualDamage,
        })
      }
    })
    this.buffSystem.setHealCallback((targetId: string, amount: number) => {
      const target = battleData.participants.get(targetId)
      if (target?.isAlive()) {
        target.heal(amount)
        this.emitTriggerEvent(BattleTriggerPhase.HEAL_RECEIVED, {
          sourceId: '',
          targetId,
          value: amount,
        })
      }
    })

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
      this.emitTriggerEvent(BattleTriggerPhase.BATTLE_START, {
        sourceId: participant.id,
      })
    })

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassiveSkillsForAll(
      BattleTriggerPhase.BATTLE_START,
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
    this.emitTriggerEvent(BattleTriggerPhase.BATTLE_START, {
      sourceId: participant.id,
    })

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.BATTLE_START,
      participant,
      undefined,
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

    // ponytail: 调试模式 — 首回合开始前暂停，让开发者查看初始状态
    if (battle.currentRound === 1) {
      await debugGate.waitIfNeeded('BATTLE_START')
    }

    battle.roundState = RoundStatus.START

    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    if (aliveParticipants.length === 0) {
      battle.roundState = RoundStatus.END
      this.runEndConditionCheck()
      return
    }

    try {
      // 触发回合开始事件
      aliveParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_START, {
          sourceId: participant.id,
          currentTurn: battle.currentRound,
        })
      })

      // 触发回合开始时的被动技能
      this.passiveSkillManager.triggerPassiveSkillsForAll(
        BattleTriggerPhase.TURN_START,
        battle.participants,
        undefined,
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

      // 重置所有存活角色的受击能量计数器（每回合开始）
      aliveParticipants.forEach((participant) => {
        participant.resetEnergyHitCount()
      })

      // 为所有存活角色增加回合开始能量
      const combatRules = this.ruleManager.getCombatRules()
      aliveParticipants.forEach((participant) => {
        participant.gainEnergy(combatRules.energyGainPerTurn)
      })
      battleLogManager.addDebugLog('角色能量增加: ' + combatRules.energyGainPerTurn)

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

      // ponytail: 调试模式 — 回合开始事件已派发后暂停
      await debugGate.waitIfNeeded('TURN_START')

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, 1, currentTurnOrder[0])

      for (let i = 0; i < currentTurnOrder.length; i++) {
        console.log('当前回合 顺序', i, currentTurnOrder)
        await this.animationManager.waitForAnimation()
        
        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }
        
        const participantId = currentTurnOrder[i]
        const participant = battle.participants.get(participantId)
        console.error('当前角色的能量', participant.getAttribute(ATTRIBUTE_CODE.currentEnergy))
        if (!participant || !participant.isAlive()) {
          continue
        }
        battle.currentTurn = i
        
        // 在每个角色行动前，发送当前行动者更新事件到 UI 层
        eventBus.emit(BattleEventCodes.CURRENT_ACTOR_CHANGED, { actorId: participantId })
        
        try {
          await this.executor.executeParticipantAction(battle, participant)
        } catch (error) {
          battleLogManager.addDebugLog('角色行动执行出错:', error)
          await this.executor.executeDefaultAction(battle, participant)
        }

        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }
        
        await this.animationManager.waitForAnimation()

        // ponytail: 角色行动间保留固定间隔，让 CSS 动画有足够时间淡出完成
        await this.animationManager.wait(400)

        this.buffSystem.updatePerTurn(participant.id)

        this.runEndConditionCheck()

        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        // 打印当前所有参战角色气血
        battle.participants.forEach((participant) => {
          console.log(`角色 ${participant.name} 当前气血: ${participant.getAttribute(ATTRIBUTE_CODE.currentHealth)}/${participant.getAttribute(ATTRIBUTE_CODE.maxHealth)}`)
        })
      }

      await this.animationManager.waitForAnimation()

      // 【竞态条件防护】检查战斗状态是否仍然有效
      if (battle.battleState !== BattleStatus.ACTIVE) {
        return
      }

      // 发送回合结束事件到 UI 层
      eventBus.emit(BattleEventCodes.TURN_END, {})

      // ponytail: 调试模式 — 回合结束事件已派发后暂停
      await debugGate.waitIfNeeded('TURN_END')

      // 触发回合结束事件
      const endParticipants = Array.from(battle.participants.values()).filter(
        (p) => p.isAlive(),
      )
      endParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_END, {
          sourceId: participant.id,
          currentTurn: battle.currentRound,
        })
      })

      this.passiveSkillManager.triggerPassiveSkillsForAll(
        BattleTriggerPhase.TURN_END,
        battle.participants,
        undefined,
        { round: battle.currentRound },
      )

      battle.roundState = RoundStatus.END

      this.battleRecorder.recordTurnEnd(battleId, battle.currentRound || 1)

      battle.currentRound++
    } catch (error) {
      battleLogManager.addDebugLog('处理回合时出错:', LogLevel.ERROR, error)
      console.error('处理回合时出错:', error)
    } finally {
      this.animationManager.cleanupAnimationState()
    }
  }

  /**
   * 检查参与者是否有控制类Buff
   * @param participant 参与者
   * @returns 是否被控制
   */
  /**
   * 处理战斗回合
   */
  /**

  /**
   * 选择并执行技能
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置对象
   * @returns 战斗动作
   */
  /**
   * 处理战斗回合
   */

  /**
   * 获取技能的所有目标
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置
   * @returns 目标参与者数组
   */
  /**
   * 处理战斗回合
   */
  public async processTurn(): Promise<void> {
    await this.processTurnInternal()
  }


  /**
   * 添加战斗动作到记录
   * @param action - 战斗动作
   */
  private addBattleAction(action: BattleAction): void {
    const battle = this.battleData
    if (battle) {
      battle.actions.push(action)

      if (battle.actions.length > MAX_ACTION_HISTORY) {
        battle.actions = battle.actions.slice(-MAX_ACTION_HISTORY)
      }
    }
  }

  /**
   * 检测战斗结束条件并处理
   * 委托给 ruleManager 进行规则判定，只负责后续副作用（结束战斗、日志）
   */
  private runEndConditionCheck(): void {
    const battle = this.battleData
    if (!battle) return
    const result = this.ruleManager.checkBattleEndCondition(battle.participants, battle.currentRound)
    if (result.shouldEnd && result.winner) {
      this.endBattle(result.winner)
      if (battle.currentRound >= battle.maxTurns) {
        const winnerLabel = result.winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'
        battleLogManager.addBattleLog({
          turn: battle.currentRound,
          message: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
          segments: [{ text: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜` }],
          category: BATTLE_LOG_CATEGORIES.STATUS,
        })
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

  public isBattleEnded(): boolean {
    return this.battleData?.battleState === BattleStatus.ENDED
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
  public loadSkillConfigs(skillConfigs: SkillConfig[]): void {
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

  // ===================== 命令生成器（第三阶段） =====================

  /**
   * 推进到下一回合（递增回合计数器）
   * ponytail: 从 generateCommandsForTurn 中抽取，消除命令生成器的副作用
   */
  public advanceRound(): void {
    if (this.battleData) {
      this.battleData.currentRound++
    }
  }

  /**
   * 从当前战斗状态生成命令序列
   * 这是第三阶段核心方法：将 BattleSystem 从"状态修改器"转变为"命令生成器"
   * 调用方须在调用前先调用 advanceRound() 推进回合
   * @returns BattleCommand[] 命令序列，由调用方（Store）负责执行
   */
  public generateCommandsForTurn(): BattleCommand[] {
    const battle = this.battleData
    if (
      !battle ||
      battle.battleState === BattleStatus.PAUSED ||
      battle.battleState !== BattleStatus.ACTIVE
    ) {
      return []
    }

    const commands: BattleCommand[] = []
    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    if (aliveParticipants.length === 0) {
      const result = this.ruleManager.checkBattleEndCondition(battle.participants, battle.currentRound)
      if (result.winner) {
        commands.push({
          type: 'SET_WINNER',
          payload: { winner: result.winner === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy' },
        })
      }
      return commands
    }

    // ponytail: 回合递增已由调用方通过 advanceRound() 提前完成
    const turnOrder = this.turnManager.recalculateTurnOrder(battle)

    commands.push({
      type: 'NEXT_TURN',
      payload: {
        actorId: turnOrder[0] || '',
        round: battle.currentRound,
        turnOrder,
      },
    })

    // 重置所有存活角色的受击能量计数器
    for (const p of aliveParticipants) {
      commands.push({
        type: 'RESET_ENERGY_HIT_COUNT',
        payload: { targetId: p.id },
      })
    }

    // 为存活角色生成能量增加命令
    const combatRules = this.ruleManager.getCombatRules()
    for (const p of aliveParticipants) {
      commands.push({
        type: 'GAIN_ENERGY',
        payload: { targetId: p.id, amount: combatRules.energyGainPerTurn },
      })
    }

    // 为每个参与者生成行动命令
    for (const participantId of turnOrder) {
      const participant = battle.participants.get(participantId)
      if (!participant || !participant.isAlive()) continue

      // 检查是否被控制
      if (participant.hasBuff(STUN_BUFF_ID)) continue

      // AI 决策或默认攻击
      const aiInstance = battle.aiInstances?.get(participantId)
      const targetId = this.selectCommandTarget(battle, participant)
      if (targetId) {
        const damage = Math.floor(Math.random() * 20) + 10
        commands.push({
          type: 'APPLY_DAMAGE',
          payload: {
            targetId,
            amount: damage,
            sourceId: participantId,
          },
        })
        // ponytail: 简化版 — 仅生成基础伤害命令，技能/Buff命令后续扩展
      }
    }

    return commands
  }

  /**
   * 选择一个攻击目标
   */
  private selectCommandTarget(
    battle: BattleData,
    source: BattleEntity,
  ): string | null {
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.team !== source.team && p.isAlive(),
    )
    if (enemies.length === 0) return null
    return enemies[Math.floor(Math.random() * enemies.length)].id
  }

}
