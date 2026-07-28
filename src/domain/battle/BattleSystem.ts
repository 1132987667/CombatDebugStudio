/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 2.0.0 - 集成触发器事件系统
 */

import {
  convertToBattleState,
  createDefaultBattleData,
} from '@/domain/battle/aggregate/BattleState'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import { createEmptyRecord } from '@/domain/battle/combat-record'
import {
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
  TURN_MANAGER_TOKEN,
} from '@/domain/battle/entity/BattleInterfaces'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { BuffTraceLogger } from '@/domain/battle/logs/BuffTraceLogger'
import { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { BattleLifecycleManager } from '@/domain/battle/service/BattleLifecycleManager'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import {
  BattleAction,
  BattleData,
  BattleEntity,
  BattleState,
  BattleStatus,
  BattleTriggerPhase,
  createPassiveContext,
  ParticipantSide,
  ParticipantSideName,
  RoundStatus,
} from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BUFF_ID as STUN_BUFF_ID } from '@/domain/buff/scripts/StunDebuff'
import type { TriggerEventContext } from '@/domain/buff/types'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import type { Container } from '@/infrastructure/di/Container'
import { eventBus } from '@/main'
import type { BattleCommand } from '@/shared/types/battle-commands'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { debugGate } from '@/domain/battle/debug/DebugGate'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { DamageCategory, type SkillConfig } from '@/domain/skill/types'
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log'
import { Counter } from '@/shared/utils/Counter'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { RAFTimer } from '@/shared/utils/RAF'

/**
 * 战斗系统核心管理类
 *
 * @class GameBattleSystem
 * 战斗系统核心实现
 *
 * @description
 * 负责战斗的完整气血周期管理，包括创建、回合流转、伤害计算及结算。
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

export class BattleSystem {
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
    this.animationManager = new BattleAnimationManager(
      this.rafTimer,
      () => this.battleData?.participants,
      () => this.battleData?.battleSpeed ?? 1,
      () => this.battleData?.quickMode ?? false,
      () => this.battleData?.headless ?? false,
    )
    this.lifecycleManager = new BattleLifecycleManager(
      () => this.battleData,
      this.rafTimer,
      this.battleRecorder,
      this.buffSystem,
      () => this.processTurnInternal(),
      this.animationManager,
    )
    this.executor = new BattleExecutor(
      this.skillManager,
      this.damageCalculator,
      this.passiveSkillManager,
      this.battleRecorder,
      this.animationManager,
      this.buffSystem,
    )

    this.passiveSkillManager.setAnimationEnabledGetter(
      () => !this.shouldSuppressAnimationEvents(),
    )

    // 树状调试日志收集器
    this.traceCollector = new TraceLogCollector()
    this.executor.setTraceCollector(this.traceCollector)
    this.passiveSkillManager.setTraceCollector(this.traceCollector)
    BuffTraceLogger.setCollector(this.traceCollector)
  }

  readonly traceCollector: TraceLogCollector

  /**
   * 获取触发器事件总线实例
   * @returns 触发器事件总线实例
   */
  private getTriggerEventBus(): IDomainEventBus {
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
      sourceId: context.sourceId ?? '',
      targetId: context.targetId,
      value: context.value,
      currentTurn: context.currentTurn ?? this.battleData.currentTurn,
      battleData: this.battleData,
      ...context,
      phase,
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
    return this.battleData.currentTurn
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

    battleData.aiInstances = this.aiSystem.createAIInstances(participants)
    battleData.skillManager = this.skillManager

    battleData.currentTurn = 0
    battleData.currentTurn = 1
    battleData.battleState = BattleStatus.PREPARING

    const battleId = this.battleData.battleId
    this.battleRecorder.startRecording(battleId, {
      participants: allParticipants,
    })

    LoggerProvider.logger.addBattleLog({
      turn: 0,
      message: `战斗开始  ·  我方 ${allyParticipants.length} vs 敌方 ${enemyParticipants.length}`,
      segments: [
        {
          text: `战斗开始  ·  我方 ${allyParticipants.length} vs 敌方 ${enemyParticipants.length}`,
          classStr: 'log-system',
        },
      ],
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      meta: { role: 'battle' },
    })
    battleData.roundState = RoundStatus.START

    const autoBattleRules = this.ruleManager.getAutoBattleRules()
    battleData.autoBattle = autoBattleRules.enabled
    battleData.battleSpeed = autoBattleRules.defaultSpeed
    battleData.maxTurns = this.ruleManager.getTurnSystemRules().maxTurns

    // 注册属性变化回调，Buff 修改 ModifierStack 后发射事件通知 UI 层
    this.buffSystem.setAttributeChangeCallback((characterId: string) => {
      eventBus.emit(BattleEventCodes.PARTICIPANT_ATTRIBUTE_CHANGED, {
        characterId,
      })
    })

    // ponytail: 注册 buff 添加回调，被动触发路径通过 eventBus 告知 UI 播放动画
    this.buffSystem.setBuffAppliedCallback(
      (characterId: string, buffId: string) => {
        if (this.shouldSuppressAnimationEvents()) return  // ★ 无头/快速模式：抑制
        eventBus.emit(BattleEventCodes.BUFF_EFFECT, {
          targetId: characterId,
          buffName: buffId,
          isPositive: true,
        })
      },
    )

    // ponytail: 防止触发器脚本（如 reflectDamage）循环递归
    // 在 DAMAGE_TAKEN 发射中再次调用 requestDamage → setDamageCallback → ... 无限递归
    let _inDamageCallback = false

    // 注册伤害/治疗回调，Buff 触发器可直接对目标造成伤害或治疗
    this.buffSystem.setDamageCallback(
      (targetId: string, damage: number, rawDamage?: number, damagePercent?: number) => {
        // ponytail: 递归守卫 — 若已在回调中则跳过，避免反弹/分摊类触发器循环
        if (_inDamageCallback) return
        _inDamageCallback = true
        try {
          const target = battleData.participants.get(targetId)
          if (target?.isAlive()) {
            let actualDamage = damage
            let isHeal = false
            if (damagePercent && damagePercent > 0) {
              // 正百分比 = 扣当前气血百分比
              actualDamage = Math.max(
                1,
                Math.floor(target.currentHealth * damagePercent),
              )
              target.takeDamage(actualDamage)
            } else if (damagePercent && damagePercent < 0) {
              // 负百分比 = 按最大气血百分比治疗
              actualDamage = Math.floor(
                target.maxHealth * Math.abs(damagePercent),
              )
              target.heal(actualDamage)
              isHeal = true
            } else if (damage > 0) {
              // 固定值伤害
              // NOTE: 在扣血前捕获 气血，用于 DOT 叙事日志
              const hpBefore = target.currentHealth
              target.takeDamage(actualDamage)
              const hpAfter = target.currentHealth
              // 记录 DOT CombatRecord
              if (actualDamage > 0) {
                const dotRecord = createEmptyRecord(
                  battleData.battleId,
                  'system',
                  '系统',
                  'attack' as any,
                  targetId,
                  target.name,
                  battleData.currentTurn ?? 1,
                )
                dotRecord.damage = actualDamage
                dotRecord.damageSource = 'dot'
                dotRecord.message = `${target.name} 受到 ${actualDamage} 点持续伤害`
                this.battleRecorder.recordCombatRecord(
                  battleData.battleId,
                  dotRecord,
                )
                // NOTE: DOT 叙事日志
                LoggerProvider.logger.addBattleLog({
                  turn: battleData.currentTurn ?? 1,
                  message: `${target.name} 受到 ${actualDamage} 点持续伤害`,
                  segments: [
                    { text: `${target.name} `, classStr: 'log-hostile' },
                    { text: `${actualDamage}`, classStr: 'log-damage' },
                    { text: ' 点持续伤害', classStr: 'log-text' },
                  ],
                  category: BATTLE_LOG_CATEGORIES.DAMAGE,
                  meta: {
                    role: 'settlement',
                    entityId: targetId,
                    hpAfter,
                    damage: actualDamage,
                  },
                })
              }
            }
            // ★ 统一管道：触发器伤害/治疗动画
            if (actualDamage > 0 && !this.shouldSuppressAnimationEvents()) {
              eventBus.emit(BattleEventCodes.DAMAGE_ANIMATION, {
                targetId,
                damage: actualDamage,
                damageCategory: DamageCategory.PHYSICAL,
                isCritical: false,
                isHeal,
              })
            }
            this.emitTriggerEvent(BattleTriggerPhase.DAMAGE_TAKEN, {
              sourceId: '',
              targetId,
              value: actualDamage,
              extra: { damage: actualDamage, rawDamage: rawDamage ?? actualDamage },
            })
            // ponytail: 触发队友伤害事件 — 供 buff_triggers 中的 ally_damage_taken / ally_fatal_damage 使用
            const isDead = !target.isAlive()
            battleData.participants.forEach((p) => {
              if (p.id !== targetId && p.team === target.team && p.isAlive()) {
                this.emitTriggerEvent(
                  isDead
                    ? BattleTriggerPhase.ALLY_FATAL_DAMAGE
                    : BattleTriggerPhase.ALLY_DAMAGE_TAKEN,
                  {
                    sourceId: '',
                    targetId: p.id,
                    value: actualDamage,
                    extra: { allyId: targetId, damage: actualDamage },
                  },
                )
              }
            })
            // ponytail: 补充被动触发 — buff 伤害（毒伤等）也需要触发受击方被动
            this.passiveSkillManager.triggerPassives(
              target,
              createPassiveContext(
                BattleTriggerPhase.DAMAGE_TAKEN,
                battleData,
                {
                  damage: actualDamage,
                },
              ),
            )
          }
        } finally {
          _inDamageCallback = false
        }
      },
    )
    this.buffSystem.setHealCallback((targetId: string, amount: number) => {
      const target = battleData.participants.get(targetId)
      if (target?.isAlive()) {
        const actualHeal = target.heal(amount)
        // ★ 统一管道：触发器治疗动画
        if (actualHeal > 0 && !this.shouldSuppressAnimationEvents()) {
          eventBus.emit(BattleEventCodes.DAMAGE_ANIMATION, {
            targetId,
            damage: actualHeal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }
        this.emitTriggerEvent(BattleTriggerPhase.HEAL_RECEIVED, {
          sourceId: '',
          targetId,
          value: amount,
        })
        // ponytail: 补充被动触发 — buff 治疗也需要触发 HEAL_RECEIVED 被动
        this.passiveSkillManager.triggerPassives(
          target,
          createPassiveContext(BattleTriggerPhase.HEAL_RECEIVED, battleData, {
            heal: amount,
          }),
        )
      }
    })

    // ★ 每次 initialize 确保技能配置已加载（幂等，批量生成器独立运行时兜底）
    if (this.skillManager.getSkillConfigs().size === 0) {
      this.loadSkillConfigs(GameDataProcessor.getSkillsData())
    }

    // ★ 每次 initialize 重新注册被动和免疫，消除对外部调用顺序的依赖
    this.passiveSkillManager.clearAll()
    for (const participant of participants.values()) {
      GameDataProcessor.registerParticipantPassives(participant, this.passiveSkillManager)
      const immunities = participant.getImmunities()
      if (immunities.length > 0) {
        this.buffSystem.registerCharacterImmunities(participant.id, immunities)
      }
    }
    // ponytail: 统一管道 — 所有被动通过 PassiveSkillManager 在 BATTLE_START 阶段触发
    this.applyPassiveSkills(participants)

    // ponytail: 被动加成已生效，此时创建回合顺序确保速度加成正确
    battleData.turnOrder = this.turnManager.createTurnOrder(
      Array.from(participants.values()),
    )

    // ponytail: 光环在 applyPassiveSkills 中已通过 addBuff 添加到源参与者，
    // 此处扫描所有参与者上的光环 buff 并分发修饰符到同队/异队成员
    this.distributeAuras(participants)

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
      participants,
      createPassiveContext(BattleTriggerPhase.BATTLE_START, this.battleData),
    )
  }

  /**
   * 分发所有参与者身上光环 buff 的 allies/enemies 修饰符
   * 在 applyPassiveSkills 之后调用，确保所有 BATTLE_START 被动已添加 buff
   */
  private distributeAuras(participants: Map<string, BattleEntity>): void {
    for (const [id, entity] of participants) {
      if (!(entity instanceof BattleParticipantImpl)) continue
      const buffInstanceIds = entity.getBuffInstanceIds()
      for (const instanceId of buffInstanceIds) {
        const buffConfig = this.buffSystem.getBuffConfigByInstanceId(instanceId)
        if (!buffConfig) continue
        // ponytail: 查找 BuffJsonEntry 中的 immunities 字段，但此处需要 aura 配置
        // 使用 BuffSystem.getBuffAuraConfig 获取 aura 元数据
        const aura = this.buffSystem.getBuffAuraConfig(buffConfig.id)
        if (!aura || !aura.modifiers?.length || !aura.targetSelector) continue
        const isAllies = aura.targetSelector === 'allies'
        const sourceKey = `passive:${buffConfig.id}`
        for (const [targetId, target] of participants) {
          if (targetId === id) continue
          if (!(target instanceof BattleParticipantImpl)) continue
          const sameTeam = target.team === entity.team
          if ((isAllies && sameTeam) || (!isAllies && !sameTeam)) {
            GameDataProcessor.applyAuraModifiersToParticipant(
              target,
              sourceKey,
              aura.modifiers,
            )
          }
        }
      }
    }
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

    const participants = this.battleData?.participants
    if (!participants) return

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassives(
      participant,
      createPassiveContext(BattleTriggerPhase.BATTLE_START, this.battleData),
    )

    // ponytail: 增量分发光环 — 新角色受已有光环影响 + 新角色的光环施加给已有角色
    this.distributeAuras(participants)
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
    if (battle.currentTurn === 1) {
      await debugGate.waitIfNeeded('BATTLE_START')
    }

    battle.roundState = RoundStatus.START

    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    try {
      // 触发回合开始事件
      aliveParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_START, {
          sourceId: participant.id,
          currentTurn: battle.currentTurn,
        })
      })

      // 触发回合开始时的被动技能
      this.passiveSkillManager.triggerPassiveSkillsForAll(
        battle.participants,
        createPassiveContext(BattleTriggerPhase.TURN_START, this.battleData),
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
      LoggerProvider.logger.addDebugLog(
        '角色能量增加: ' + combatRules.energyGainPerTurn,
      )

      // 【脏标记流控】回合开始前批量预计算所有参与者属性
      aliveParticipants.forEach((participant) => {
        if (
          'recalcAll' in participant &&
          typeof participant.recalcAll === 'function'
        ) {
          participant.recalcAll()
        }
      })

      // 计算出手顺序（必须在属性刷新之后，以使用最新的速度值）
      const currentTurnOrder = this.turnManager.recalculateTurnOrder(battle)
      battle.turnOrder = currentTurnOrder

      // 发送回合开始事件到 UI 层（此时拥有正确的出手顺序）
      const firstActorId =
        currentTurnOrder.length > 0 ? currentTurnOrder[0] : null
      eventBus.emit(BattleEventCodes.TURN_START, { actorId: firstActorId })

      // ponytail: 调试模式 — 回合开始事件已派发后暂停
      await debugGate.waitIfNeeded('TURN_START')

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, 1, currentTurnOrder[0]!)

      for (let i = 0; i < currentTurnOrder.length; i++) {
        console.log('当前回合 顺序', i, currentTurnOrder)
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

        // 在每个角色行动前，发送当前行动者更新事件到 UI 层
        eventBus.emit(BattleEventCodes.CURRENT_ACTOR_CHANGED, {
          actorId: participantId,
        })

        try {
          await this.executor.executeParticipantAction(battle, participant)
        } catch (error) {
          LoggerProvider.logger.addDebugLog('角色行动执行出错:', {
            error: error as Error,
          })
          await this.executor.executeDefaultAction(battle, participant)
        }

        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        await this.animationManager.waitForAnimation()

        // ⭐ 补充守卫：如果在等待间隔期间战斗已结束，跳过后续操作
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        this.buffSystem.updatePerTurn(participant.id)

        await this.runEndConditionCheck()

        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        // 打印当前所有参战角色气血
        battle.participants.forEach((participant) => {
          console.log(
            `角色 ${participant.name} 当前气血: ${participant.getAttribute(ATTRIBUTE_CODE.currentHealth)}/${participant.getAttribute(ATTRIBUTE_CODE.maxHealth)}`,
          )
        })
      }

      await this.animationManager.waitForAnimation()

      // 【竞态条件防护】检查战斗状态是否仍然有效
      if (battle.battleState !== BattleStatus.ACTIVE) {
        return
      }

      // 发送回合结束事件到 UI 层
      eventBus.emit(BattleEventCodes.TURN_END)

      // ponytail: 调试模式 — 回合结束事件已派发后暂停
      await debugGate.waitIfNeeded('TURN_END')

      // 触发回合结束事件
      const endParticipants = Array.from(battle.participants.values()).filter(
        (p) => p.isAlive(),
      )
      endParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_END, {
          sourceId: participant.id,
          currentTurn: battle.currentTurn,
        })
      })

      this.passiveSkillManager.triggerPassiveSkillsForAll(
        battle.participants,
        createPassiveContext(BattleTriggerPhase.TURN_END, this.battleData),
      )

      // ponytail: 消费 extra_action（时之沙）— 在 TURN_END 触发后、回合递增前执行额外行动
      const extraEntityIds = this.skillManager.getExecutor().drainExtraActions()
      // ponytail: 限制每回合最多 3 次额外行动，防止被动再触发导致无限循环
      const MAX_EXTRA_ACTIONS = 3
      let extraCount = 0
      while (extraEntityIds.length > 0 && extraCount < MAX_EXTRA_ACTIONS) {
        const entityId = extraEntityIds.shift()!
        const entity = battle.participants.get(entityId)
        if (entity?.isAlive() && this.executor) {
          LoggerProvider.logger.addDebugLog(`额外行动: ${entity.name}`, {
            level: LogLevel.INFO,
          })
          await this.executor.executeParticipantAction(battle, entity)
        }
        extraCount++
        // 消费本轮执行中可能新产生的 extra_action 请求
        const newExtras = this.skillManager.getExecutor().drainExtraActions()
        extraEntityIds.push(...newExtras)
      }
      if (extraEntityIds.length > 0) {
        LoggerProvider.logger.addDebugLog(
          `额外行动已达上限(${MAX_EXTRA_ACTIONS})，丢弃 ${extraEntityIds.length} 个请求`,
          { level: LogLevel.WARN },
        )
      }

      // ★ 回合态势快照
      const allySnapshot: string[] = []
      const enemySnapshot: string[] = []
      battle.participants.forEach((p) => {
        if (!p.isAlive()) return
        const hp = p.getAttribute(ATTRIBUTE_CODE.currentHealth)
        const maxHp = p.getAttribute(ATTRIBUTE_CODE.maxHealth)
        const entry = `${p.name} ${Math.floor(hp)}/${Math.floor(maxHp)}`
        if (p.team === ParticipantSide.ALLY) allySnapshot.push(entry)
        else enemySnapshot.push(entry)
      })

      if (allySnapshot.length > 0) {
        LoggerProvider.logger.addBattleLog({
          turn: battle.currentTurn,
          message: `我方  ${allySnapshot.join(' · ')}`,
          segments: [
            { text: '我方  ', classStr: 'log-friendly' },
            { text: allySnapshot.join(' · ') },
          ],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'snapshot' },
        })
      }
      if (enemySnapshot.length > 0) {
        LoggerProvider.logger.addBattleLog({
          turn: battle.currentTurn,
          message: `敌方  ${enemySnapshot.join(' · ')}`,
          segments: [
            { text: '敌方  ', classStr: 'log-hostile' },
            { text: enemySnapshot.join(' · ') },
          ],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'snapshot' },
        })
      }

      battle.roundState = RoundStatus.END

      this.battleRecorder.recordTurnEnd(battleId, battle.currentTurn || 1)

      battle.currentTurn++
    } catch (error) {
      LoggerProvider.logger.addDebugLog('处理回合时出错:', {
        level: LogLevel.ERROR,
        error: error as Error,
      })
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
  private async runEndConditionCheck(): Promise<void> {
    const battle = this.battleData
    if (!battle) return
    const result = this.ruleManager.checkBattleEndCondition(
      battle.participants,
      battle.currentTurn,
    )
    if (result.shouldEnd && result.winner) {
      await this.endBattle(result.winner)
      if (battle.currentTurn >= battle.maxTurns) {
        const winnerLabel = ParticipantSideName[result.winner!]
        LoggerProvider.logger.addBattleLog({
          turn: battle.currentTurn,
          message: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
          segments: [
            {
              text: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
            },
          ],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'battle' },
        })
      }
    }
  }

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  public async endBattle(winner: ParticipantSide): Promise<void> {
    // 战斗结束前将树状调试日志写入 BattleRecorder
    if (this.battleData) {
      this.battleRecorder.recordTraceLogs(
        this.battleData.battleId,
        this.traceCollector.exportAll(),
      )
    }
    // ★ 补偿可能缺失的回合末态势快照（战斗在回合中途结束时）
    this.ensureFinalSnapshot()
    return this.lifecycleManager.endBattle(winner)
  }

  /** 补偿战斗中途结束时缺失的回合末态势快照 */
  private ensureFinalSnapshot(): void {
    const battle = this.battleData
    if (!battle) return
    // ★ 如果 roundState 已经是 END，说明正常流程已产出快照，无需补偿
    if (battle.roundState === RoundStatus.END) return
    const allySnapshot: string[] = []
    const enemySnapshot: string[] = []
    battle.participants.forEach((p) => {
      if (!p.isAlive()) return
      const hp = p.getAttribute(ATTRIBUTE_CODE.currentHealth)
      const maxHp = p.getAttribute(ATTRIBUTE_CODE.maxHealth)
      const entry = `${p.name} ${Math.floor(hp)}/${Math.floor(maxHp)}`
      if (p.team === ParticipantSide.ALLY) allySnapshot.push(entry)
      else enemySnapshot.push(entry)
    })
    if (allySnapshot.length > 0) {
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn,
        message: `我方  ${allySnapshot.join(' · ')}`,
        segments: [
          { text: '我方  ', classStr: 'log-friendly' },
          { text: allySnapshot.join(' · ') },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'snapshot' },
      })
    }
    if (enemySnapshot.length > 0) {
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn,
        message: `敌方  ${enemySnapshot.join(' · ')}`,
        segments: [
          { text: '敌方  ', classStr: 'log-hostile' },
          { text: enemySnapshot.join(' · ') },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'snapshot' },
      })
    }
  }

  public resetBattle(): void {
    // ponytail: 清除上一场战斗的被动注册、连击状态和待处理额外行动，防止跨战斗污染
    this.passiveSkillManager.clearAll()
    this.skillManager.getExecutor().clearAllComboStates()
    this.skillManager.getExecutor().drainExtraActions()
    this.lifecycleManager.resetBattle()
  }

  public getBattleStatus(): string | undefined {
    return this.battleData?.battleState
  }

  public setBattleState(status: BattleStatus): void {
    if (this.battleData) {
      this.battleData.battleState = status
    }
  }

  public getRoundState(): RoundStatus | undefined {
    return this.battleData?.roundState
  }

  public isBattleEnded(): boolean {
    return this.battleData?.battleState === BattleStatus.ENDED
  }

  public getAutoBattle(): boolean {
    return this.battleData?.autoBattle ?? false
  }

  public getIsPaused(): boolean {
    return this.battleData?.battleState === BattleStatus.PAUSED
  }

  public getBattleSpeed(): number {
    return this.battleData?.battleSpeed ?? 1
  }

  public setSpeed(speed: number): void {
    if (this.battleData) this.battleData.battleSpeed = speed
  }

  /** ★ 设置快速战斗模式（跳过动画和等待） */
  public setQuickMode(enabled: boolean): void {
    if (this.battleData) {
      this.battleData.quickMode = enabled
    }
  }

  /** ★ 获取快速战斗模式状态 */
  public getQuickMode(): boolean {
    return this.battleData?.quickMode ?? false
  }

  /** ★ 设置无头模式（批量生成用，抑制所有 UI 动画事件） */
  public setHeadless(enabled: boolean): void {
    if (this.battleData) {
      this.battleData.headless = enabled
    }
  }

  /** ★ 获取无头模式状态 */
  public getHeadless(): boolean {
    return this.battleData?.headless ?? false
  }

  /** ★ 是否抑制 UI 动画事件发射（快速战斗 || 无头模式） */
  private shouldSuppressAnimationEvents(): boolean {
    return !!(this.battleData?.quickMode || this.battleData?.headless)
  }

  /** ★ 重新生成战斗ID（用于批量生成场景中每场战斗拥有独立ID） */
  public regenerateBattleId(): void {
    const id = this.generateBattleId()
    if (this.battleData) {
      this.battleData.battleId = id
    }
  }

  public togglePause(): void {
    this.lifecycleManager.togglePause()
  }

  public isBattleInProgress(): boolean {
    return this.battleData?.battleState === BattleStatus.ACTIVE
  }

  public getBattleState(): BattleState | undefined {
    const battle = this.battleData
    if (!battle) return undefined
    return convertToBattleState(battle)
  }

  public async startAutoBattleLoop(): Promise<void> {
    this.lifecycleManager.startAutoBattleLoop()
  }

  public getEnabledAllyTeam(): BattleEntity[] {
    return Array.from(this.battleData.participants.values()).filter(
      (p) => p.enabled && p.team === 'ally',
    )
  }

  public getEnabledEnemyTeam(): BattleEntity[] {
    return Array.from(this.battleData.participants.values()).filter(
      (p) => p.enabled && p.team === 'enemy',
    )
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
  public getDamageCalculationLogs() {
    return this.skillManager.getDamageCalculationLogs()
  }

  public getHealCalculationLogs() {
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
    LoggerProvider.logger.addDebugLog(`回合 ${turnNumber} 执行完成`)
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

  /** @internal 接口兼容，委托给 setSpeed */
  public setBattleSpeed(speed: number): void {
    this.setSpeed(speed)
  }

  // ===================== 命令生成器（第三阶段） =====================

  /**
   * 推进到下一回合（递增回合计数器）
   * ponytail: 从 generateCommandsForTurn 中抽取，消除命令生成器的副作用
   */
  public advanceRound(): void {
    if (this.battleData) {
      this.battleData.currentTurn++
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
      // 战斗已在 runEndConditionCheck 中结束，此处不再重复触发
      // 仅当 battleState 仍为 ACTIVE 时才生成 SET_WINNER（兜底保护）
      if (battle.battleState === BattleStatus.ACTIVE) {
        const result = this.ruleManager.checkBattleEndCondition(
          battle.participants,
          battle.currentTurn,
        )
        if (result.winner) {
          commands.push({
            type: 'SET_WINNER',
            payload: {
              winner:
                result.winner,
            },
          })
        }
      }
      return commands
    }

    // ponytail: 回合递增已由调用方通过 advanceRound() 提前完成
    const turnOrder = this.turnManager.recalculateTurnOrder(battle)

    commands.push({
      type: 'NEXT_TURN',
      payload: {
        actorId: turnOrder[0] || '',
        round: battle.currentTurn,
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
