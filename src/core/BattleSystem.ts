/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 1.0.0
 */

import type {
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleData,
  ParticipantSide,
  RoundStatus,
} from '@/types/battle'
import type { IBattleSystem } from '@/core/battle/interfaces.ts'

import type { ExtendedSkillStep } from '@/types/skill'
import type { EffectType } from '@/types/effect'
import {
  BATTLE_STATUS,
  ROUND_STATUS,
  PARTICIPANT_SIDE,
  AUTO_BATTLE_CONFIG,
  BATTLE_CONSTANTS,
  SKILL_CONSTANTS,
  BattleSystemEvent,
} from '@/types/battle'
import { battleLogManager } from '@/utils/logging'
import { eventBus } from '@/main'
import type { BattleAI } from '@/core/BattleAI'
import { TurnManager } from '@/core/battle/TurnManager'
import { ActionExecutor } from '@/core/battle/ActionExecutor'
import { ParticipantManager } from '@/core/battle/ParticipantManager'
import { AISystem } from '@/core/battle/AISystem'
import { BattleRecorder } from '@/core/battle/BattleRecorder'
import { BattleRuleManager } from '@/core/battle/BattleRuleManager'
import { SkillManager } from '@/core/skill/SkillManager'
import {
  PassiveSkillManager,
  PassiveSkillTrigger,
} from '@/core/skill/PassiveSkillManager'
import { DamageCalculator } from '@/core/skill/DamageCalculator'
import { RAFTimer } from '@/utils/RAF'
import { BuffSystem } from '@/core/BuffSystem'
import type { BattleLogEntry } from '@/types/battle-log'
import type { BattleLogCategory } from '@/types/battle-log'
import {
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  PARTICIPANT_MANAGER_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
} from '@/core/battle/interfaces'
import type { Container } from '@/core/di/Container'

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

/**
 * 效果类型常量
 */
const EFFECT_TYPE: Record<string, EffectType> = {
  DAMAGE: 'damage',
  HEAL: 'heal',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  MISS: 'miss',
  SPECIAL: 'special',
} as const

/**
 * 战斗日志类别常量
 */
const BATTLE_LOG_CATEGORY: Record<string, BattleLogCategory> = {
  SYSTEM: 'system',
  ACTION: 'action',
  DAMAGE: 'damage',
  HEAL: 'heal',
  CRIT: 'crit',
  STATUS: 'status',
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const

export class GameBattleSystem implements IBattleSystem {
  private battleData: BattleData

  private readonly battleLogger = battleLogManager

  private isProcessingTurn = false

  private animationQueue: Array<{
    type: string
    data: any
    resolve: () => void
  }> = []

  private isAnimationPlaying = false

  private autoBattleTimerId?: symbol
  /**
   * 等待指定时间（使用 RAFTimer）
   * @param ms 等待毫秒数
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.rafTimer.setTimeout(resolve, ms)
    })
  }

  // 私有构造函数，防止外部直接实例化
  private constructor(
    private readonly turnManager: TurnManager,
    private readonly actionExecutor: ActionExecutor,
    private readonly participantManager: ParticipantManager,
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
  }

  /**
   * 使用容器创建战斗系统实例（推荐方式）
   * 容器会自动解析所有依赖
   */
  public static createInstanceWithContainer(
    container: Container,
  ): GameBattleSystem {
    const turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )
    const actionExecutor = container.resolve<ActionExecutor>(
      ACTION_EXECUTOR_TOKEN.toString(),
    )
    const participantManager = container.resolve<ParticipantManager>(
      PARTICIPANT_MANAGER_TOKEN.toString(),
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

    return new GameBattleSystem(
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
      passiveSkillManager,
    )
  }

  public generateBattleId(): string {
    return `battle_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  public getDefBattleData(): BattleData {
    return {
      battleId: this.generateBattleId(),
      participants: new Map<string, BattleParticipant>(),
      actions: [],
      turnOrder: [],
      currentTurn: 0,
      currentRound: 1,
      maxTurns: 999,
      startTime: Date.now(),
      winner: undefined,
      aiInstances: new Map<string, BattleAI>(),
      autoPlaying: true,
      battleSpeed: 1,
      battleState: BATTLE_STATUS.CREATED,
      roundState: ROUND_STATUS.NONE,
      isActive: false,
      skillManager: this.skillManager,
    }
  }

  /**
   * 初始化规则管理器
   */
  private async initializeRuleManager(): Promise<void> {
    try {
      await this.ruleManager.loadConfig()
      this.battleLogger.info('战斗规则管理器初始化完成')

      // 配置伤害计算器
      this.configureDamageCalculator()
    } catch (error) {
      this.battleLogger.error('战斗规则管理器初始化失败', error)
    }
  }

  /**
   * 配置伤害计算器
   */
  private configureDamageCalculator(): void {
    const damageRules = this.ruleManager.getDamageRules()

    this.skillManager.getDamageCalculator().setConfig({
      criticalEnabled: damageRules.critical.enabled,
      defaultCriticalRate: damageRules.critical.defaultRate,
      defaultCriticalMultiplier: damageRules.critical.defaultMultiplier,
      defenseEnabled: damageRules.defense.enabled,
      minDamageThreshold: damageRules.thresholds.minDamage,
      maxDamageThreshold: damageRules.thresholds.maxDamage,
    })

    // 初始化内置修饰器
    this.skillManager.getDamageCalculator().initializeBuiltinModifiers()
  }

  /**
   * 初始化战斗
   * @param {BattleParticipant[]} participantsInfo - 参与者数组
   * @returns {BattleState} 初始化后的战斗状态
   */
  public initialize(participantsInfo: BattleParticipant[]): BattleState {
    console.log('participantsInfo', participantsInfo)

    const participants =
      this.participantManager.createParticipants(participantsInfo)
    const battleData = this.battleData
    battleData.participants = participants
    battleData.aiInstances = this.aiSystem.createAIInstances(participants)
    battleData.skillManager = this.skillManager

    this.turnManager.initializeBattle(
      battleData,
      this.turnManager.createTurnOrder(Array.from(participants.values())),
    )

    battleData.battleState = BATTLE_STATUS.PREPARING

    this.actionExecutor.registerBattle(
      this.battleData.battleId,
      this.battleData,
    )
    const battleId = this.battleData.battleId
    this.battleRecorder.startRecording(battleId, {
      participants: participantsInfo,
    })

    this.battleLogger.info(`Battle initialized: ${battleId}`, {
      participantCount: participantsInfo.length,
      characterCount: participantsInfo.filter(
        (p) => p.type === PARTICIPANT_SIDE.ALLY,
      ).length,
      enemyCount: participantsInfo.filter(
        (p) => p.type === PARTICIPANT_SIDE.ENEMY,
      ).length,
      currentBattleState: battleData.battleState,
    })

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
          description: `战斗开始！参战角色: ${participantsInfo.filter((p) => p.type === PARTICIPANT_SIDE.ALLY).length} 人，参战敌人: ${participantsInfo.filter((p) => p.type === PARTICIPANT_SIDE.ENEMY).length} 人`,
          duration: 0,
        },
      ],
    }

    this.addBattleAction(initAction)

    this.battleRecorder.recordAction(battleId, initAction, 0)

    battleData.battleState = BATTLE_STATUS.ACTIVE
    battleData.roundState = ROUND_STATUS.START
    battleData.isActive = true

    this.applyPassiveSkills(participants)

    return this.convertToBattleState(battleData)
  }

  /**
   * 应用所有角色的被动技能效果
   * 被动技能在战斗开始时自动生效
   * @param participants 参与者映射
   */
  private applyPassiveSkills(
    participants: Map<string, BattleParticipant>,
  ): void {
    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassiveSkillsForAll(
      PassiveSkillTrigger.BATTLE_START,
      participants,
    )
  }

  /**
   * 内部方法：处理战斗回合的核心逻辑
   * 实现每回合重新计算出手顺序，并按顺序执行所有角色行动
   */
  private async processTurnInternal(): Promise<void> {
    const battle = this.battleData
    if (!battle || !battle.isActive) {
      return
    }

    try {
      battle.roundState = ROUND_STATUS.START

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
      const aliveParticipants = Array.from(battle.participants.values()).filter(
        (p) => p.isAlive(),
      )
      const combatRules = this.ruleManager.getCombatRules()
      this.participantManager.gainEnergyToAliveParticipants(
        aliveParticipants,
        combatRules.energyGainPerTurn,
      )

      if (aliveParticipants.length === 0) {
        battle.roundState = ROUND_STATUS.END
        this.checkBattleEndCondition()
        return
      }

      let currentTurnOrder = this.turnManager.recalculateTurnOrder(battle)
      battle.turnOrder = currentTurnOrder
      battle.currentTurn = 0

      this.battleLogger.info('回合开始，重新计算出手顺序', {
        turnOrder: currentTurnOrder.map((id) => {
          const participant = battle.participants.get(id)
          const effectiveSpeed = this.turnManager.calculateEffectiveSpeed(
            participant!,
          )
          return {
            id,
            name: participant?.name,
            effectiveSpeed,
          }
        }),
      })

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, 1, currentTurnOrder[0])

      this.syncBattleStateUpdate()

      for (let i = 0; i < currentTurnOrder.length; i++) {
        while (this.isAnimating()) {
          await this.wait(100)
        }

        const participantId = currentTurnOrder[i]
        const participant = battle.participants.get(participantId)

        if (!participant || !participant.isAlive()) {
          continue
        }

        battle.currentTurn = i

        this.syncBattleStateUpdate()

        try {
          await this.executeParticipantAction(battle, participant)
        } catch (error) {
          this.battleLogger.error('角色行动执行出错:', error)
          await this.executeDefaultAction(battle, participant)
        }

        while (this.isAnimating()) {
          await this.wait(100)
        }

        this.buffSystem.updatePerTurn(participant.id, battle.currentRound || 1)

        this.syncBattleStateUpdate()

        this.checkBattleEndCondition()

        if (!battle.isActive) {
          return
        }
      }

      while (this.isAnimating()) {
        await this.wait(100)
      }

      this.passiveSkillManager.triggerPassiveSkillsForAll(
        PassiveSkillTrigger.TURN_END,
        battle.participants,
        { round: battle.currentRound },
      )

      battle.roundState = ROUND_STATUS.END

      this.battleRecorder.recordTurnEnd(
        battleId,
        this.turnManager.getTurnNumber(battle),
      )

      battle.currentRound++

      battle.roundState = ROUND_STATUS.START
    } catch (error) {
      this.battleLogger.error('处理回合时出错:', error)
    } finally {
      this.syncBattleStateUpdate()
      this.cleanupAnimationState()
    }
  }

  /**
   * 检查参与者是否有控制类Buff
   * @param participant 参与者
   * @returns 是否被控制
   */
  private isParticipantControlled(participant: BattleParticipant): boolean {
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
    participant: BattleParticipant,
  ): Promise<void> {
    try {
      // 检查是否被控制
      if (this.isParticipantControlled(participant)) {
        // 被控制，无法行动
        const action: BattleAction = {
          id: `control_${Date.now()}`,
          type: 'status',
          sourceId: participant.id,
          targetId: participant.id,
          damage: 0,
          heal: 0,
          success: true,
          timestamp: Date.now(),
          turn: this.turnManager.getTurnNumber(battle),
          effects: [
            {
              type: 'status',
              description: `${participant.name} 被控制，无法行动`,
              duration: 0,
            },
          ],
        }

        // 添加控制行动到战斗记录
        this.recordBattleAction(action)

        // 添加战斗日志
        const logEntry: BattleLogEntry = {
          turn: `回合${this.turnManager.getTurnNumber(battle)}`,
          source: participant.name,
          action: '被',
          target: '控制',
          result: `${participant.name} 被控制，无法行动`,
          level: 'info',
          category: 'status',
        }
        this.syncBattleLog(logEntry)

        this.battleLogger.info(`角色[${participant.name}]被控制，无法行动`)
        return
      }

      // 获取所有可用技能并过滤掉被动技能
      const allSkillIds = participant.getSkills()
      console.log('allSkillIds', participant, participant.skills, allSkillIds)
      const allAvailableSkills = allSkillIds.filter((skillId) => {
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

      // 过滤掉被动技能（通过技能ID判断）
      const availableSkills = allAvailableSkills.filter((skillId) => {
        return !skillId.includes('passive')
      })

      // 检查是否使用AI系统进行决策
      const aiInstance = battle.aiInstances?.get(participant.id)
      if (aiInstance) {
        // 使用AI系统决策
        const action = aiInstance.makeDecision(
          {
            participants: battle.participants,
            turnOrder: battle.turnOrder,
            currentTurn: battle.currentTurn,
          },
          participant,
        )

        this.battleLogger.debug(
          `AI决策[${participant.name}]: ${action.type === 'skill' ? '使用技能' : '普通攻击'}`,
        )

        if (action.type === 'skill' && action.skillId) {
          const skillId = action.skillId
          if (allSkillIds.includes(skillId)) {
            await this.selectAndExecuteSkill(battle, participant, {
              id: skillId,
            })
          } else {
            await this.selectAndExecuteAttack(battle, participant)
          }
        } else {
          await this.selectAndExecuteAttack(battle, participant)
        }
      } else if (
        availableSkills.length > 0 &&
        Math.random() < BATTLE_CONSTANTS.SKILL_USE_CHANCE &&
        availableSkills[0]
      ) {
        // 没有AI实例时使用原来的随机选择逻辑（也过滤了被动技能）
        const selectedSkillId =
          availableSkills[Math.floor(Math.random() * availableSkills.length)]
        await this.selectAndExecuteSkill(battle, participant, {
          id: selectedSkillId,
        })
      } else {
        await this.selectAndExecuteAttack(battle, participant)
      }

      participant.afterAction()
    } catch (actionError) {
      this.battleLogger.error(
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
   * @param skill 技能对象
   * @returns 战斗动作
   */
  private async selectAndExecuteSkill(
    battle: BattleData,
    source: BattleParticipant,
    skill: any,
  ): Promise<BattleAction> {
    // 检查技能是否可用
    if (
      'isSkillAvailable' in source &&
      typeof source.isSkillAvailable === 'function'
    ) {
      if (!source.isSkillAvailable(skill.id)) {
        // 技能冷却中，执行普通攻击
        return this.selectAndExecuteAttack(battle, source)
      }
    }

    const energyCost = this.getSkillEnergyCost(skill.id)
    source.spendEnergy(energyCost)

    const targetId = this.selectTarget(battle, source)

    const action: BattleAction = {
      id: `skill_${skill.id}_${Date.now()}`,
      type: 'skill',
      skillId: skill.id,
      sourceId: source.id,
      targetId: targetId,
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      turn: this.turnManager.getTurnNumber(battle),
      effects: [],
    }

    try {
      const skillAction = this.skillManager.executeSkill(
        skill.id,
        source,
        battle.participants.get(targetId)!,
      )

      action.damage = skillAction.damage
      action.heal = skillAction.heal
      action.effects = skillAction.effects

      this.battleLogger.info(`技能执行成功: ${skill.id}`, {
        source: source.name,
        target: targetId,
        damage: action.damage,
        heal: action.heal,
      })
    } catch (error) {
      this.battleLogger.error(`技能执行失败: ${skill.id}`, error)
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects = [
        {
          type: EFFECT_TYPE.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        },
      ]
    }

    this.recordBattleAction(action)

    this.syncBattleStateUpdate()

    return action
  }

  /**
   * 选择并执行普通攻击
   * @param battle 战斗数据
   * @param source 攻击者
   * @returns 战斗动作
   */
  private async selectAndExecuteAttack(
    battle: BattleData,
    source: BattleParticipant,
  ): Promise<BattleAction> {
    const target = this.selectTarget(battle, source)

    const targetParticipant = battle.participants.get(target)

    // 触发攻击前的被动技能
    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.BEFORE_ATTACK,
      source,
      { targetId: target },
    )

    // 构造普通攻击的技能步骤配置
    const attackStep: ExtendedSkillStep = {
      type: 'DAMAGE',
      id: 'normal_attack',
      targetId: target,
      calculation: {
        baseValue: 0,
        extraValues: [{ attribute: 'ATK', ratio: 1.0 }],
      },
      attackType: 'physical',
      targetModifiers: {
        DEF: 1,
      },
      criticalConfig: {
        rate: (source.getAttribute('critRate') || 10) / 100,
        multiplier: (source.getAttribute('critDamage') || 125) / 100,
      },
    }

    // 使用DamageCalculator统一计算伤害
    const damageResult = this.damageCalculator.calculateDamage(
      attackStep,
      source,
      targetParticipant!,
    )

    const action: BattleAction = {
      id: `attack_${Date.now()}`,
      type: 'attack',
      sourceId: source.id,
      targetId: target,
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      turn: this.turnManager.getTurnNumber(battle),
      effects: [],
    }

    if (damageResult.isMiss) {
      // 处理闪避情况
      action.effects.push({
        type: EFFECT_TYPE.MISS,
        value: 0,
        description: `${targetParticipant!.name} 闪避了攻击`,
      })

      this.triggerMissAnimation({
        targetId: target,
      })

      const logEntry: BattleLogEntry = {
        turn: `回合${this.turnManager.getTurnNumber(battle)}`,
        source: source.name,
        action: '对',
        target: targetParticipant!.name,
        result: `${source.name} 对 ${targetParticipant!.name} 发动普通攻击，但是被闪避了！`,
        level: 'info',
        category: 'status',
      }
      this.syncBattleLog(logEntry)

      this.battleLogger.info(
        `普通攻击: ${source.name} → ${targetParticipant!.name}，被闪避`,
      )
    } else {
      // 应用伤害
      const damage = damageResult.damage
      action.damage = damage

      targetParticipant!.takeDamage(damage)

      action.effects.push({
        type: EFFECT_TYPE.DAMAGE,
        value: damage,
        description: `${source.name} 普通攻击 造成 ${damage} 伤害${damageResult.isCritical ? ' (暴击)' : ''}`,
      })

      this.triggerDamageAnimation({
        targetId: target,
        damage,
        damageType: 'physical',
        isCritical: damageResult.isCritical,
        isHeal: false,
      })

      const logEntry: BattleLogEntry = {
        turn: `回合${this.turnManager.getTurnNumber(battle)}`,
        source: source.name,
        action: '对',
        target: targetParticipant!.name,
        result: `${source.name} 对 ${targetParticipant!.name} 发动普通攻击，${damageResult.isCritical ? '暴击！' : ''}造成 ${damage} 点物理伤害。`,
        level: 'info',
        category: damageResult.isCritical
          ? BATTLE_LOG_CATEGORY.CRIT
          : BATTLE_LOG_CATEGORY.DAMAGE,
      }
      this.syncBattleLog(logEntry)

      this.battleLogger.info(
        `普通攻击: ${source.name} → ${targetParticipant!.name}`,
        {
          damage,
          isCritical: damageResult.isCritical,
          targetHealth: targetParticipant!.currentHealth,
        },
      )
    }

    // 触发攻击后的被动技能
    this.passiveSkillManager.triggerPassiveSkills(
      PassiveSkillTrigger.AFTER_ATTACK,
      source,
      {
        targetId: target,
        damage: action.damage,
        isCritical: action.effects.some((e) => e.description?.includes('暴击')),
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
  private selectTarget(battle: BattleData, source: BattleParticipant): string {
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
    if (skillConfig && skillConfig.mpCost !== undefined) {
      return skillConfig.mpCost
    }
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return SKILL_CONSTANTS.ULTIMATE_ENERGY_COST
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return SKILL_CONSTANTS.SKILL_ENERGY_COST
    }
    return SKILL_CONSTANTS.PASSIVE_ENERGY_COST
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
   * @param {BattleParticipant} participant - 当前行动者
   */
  private async executeDefaultAction(
    battle: BattleData,
    participant: BattleParticipant,
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
      turn: this.turnManager.getTurnNumber(battle),
      effects: [
        {
          type: EFFECT_TYPE.DAMAGE,
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
    const battle = this.battleData
    if (!battle) {
      throw new Error('No active battle found')
    }

    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      throw new Error(`Invalid source or target in action`)
    }

    // 处理技能执行
    if (action.type === 'skill' && action.skillId) {
      try {
        // 使用新的技能管理器执行技能
        const skillAction = this.skillManager.executeSkill(
          action.skillId,
          source,
          target,
        )

        // 合并技能执行结果
        action.damage = skillAction.damage
        action.heal = skillAction.heal
        action.effects = skillAction.effects

        // 检查是否有闪避效果
        const hasMissEffect = skillAction.effects.some(
          (effect) => effect.type === EFFECT_TYPE.MISS,
        )
        if (hasMissEffect) {
          // 触发闪避动画并等待完成
          await this.triggerMissAnimationAndWait({
            targetId: target.id,
          })
        }

        // 检查是否有buff效果并触发相应事件
        for (const effect of skillAction.effects) {
          if (
            effect.type === EFFECT_TYPE.BUFF ||
            effect.type === EFFECT_TYPE.DEBUFF
          ) {
            // 确定buff目标
            let buffTarget = target
            if (effect.target === 'self') {
              buffTarget = source
            }

            // 触发buff添加动画并等待完成
            await this.triggerBuffEffectAndWait({
              targetId: buffTarget.id,
              buffName: effect.buffId || 'unknown',
              isPositive: effect.type === EFFECT_TYPE.BUFF,
            })
          }
        }

        // 触发技能效果动画
        await this.triggerSkillEffectAnimation({
          sourceId: source.id,
          targetId: target.id,
          skillName: action.skillId,
          effectType: action.type,
          damageType: 'skill',
        })

        this.battleLogger.info(`技能执行成功: ${action.skillId}`, {
          source: source.name,
          target: target.name,
          damage: action.damage,
          heal: action.heal,
          hasMiss: hasMissEffect,
        })
      } catch (error) {
        this.battleLogger.error(`技能执行失败: ${action.skillId}`, error)
        // 技能执行失败，降级为普通攻击
        action.type = 'attack'
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [
          {
            type: EFFECT_TYPE.DAMAGE,
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
      this.battleLogger.info(`Damage dealt: ${source.name} → ${target.name}`, {
        damage: actualDamage,
        targetHealth: target.currentHealth,
      })

      // 触发伤害动画并等待完成
      await this.triggerDamageAnimationAndWait({
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
      this.battleLogger.info(`Heal applied: ${source.name} → ${target.name}`, {
        heal: actualHeal,
        targetHealth: target.currentHealth,
      })

      // 触发治疗动画并等待完成
      await this.triggerDamageAnimationAndWait({
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
   * 获取技能能量消耗
   * @param {string} skillId - 技能ID
   * @returns {number} 能量消耗
   */
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
      this.turnManager.getTurnNumber(this.battleData),
    )
  }

  /**
   * 根据参与者ID查找战斗
   * @param {string} participantId - 参与者ID
   * @returns {BattleData | undefined} 战斗数据
   */
  /**
   * 检查战斗结束条件
   */
  private checkBattleEndCondition(): void {
    const battle = this.battleData
    if (!battle) return

    const aliveCharacters = Array.from(battle.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ALLY && p.isAlive(),
    )
    const aliveEnemies = Array.from(battle.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ENEMY && p.isAlive(),
    )

    if (aliveCharacters.length === 0) {
      this.endBattle(PARTICIPANT_SIDE.ENEMY)
    } else if (aliveEnemies.length === 0) {
      this.endBattle(PARTICIPANT_SIDE.ALLY)
    } else if (battle.currentRound >= battle.maxTurns) {
      this.handleMaxTurnsReached(aliveCharacters, aliveEnemies)
    }
  }

  /**
   * 处理回合数达到上限的情况
   * @param aliveCharacters 存活的角色
   * @param aliveEnemies 存活的敌人
   */
  private handleMaxTurnsReached(
    aliveCharacters: BattleParticipant[],
    aliveEnemies: BattleParticipant[],
  ): void {
    const battle = this.battleData
    if (!battle) return

    const charactersTotalHealthPercent = aliveCharacters.reduce((sum, p) => {
      return sum + p.getAttribute('HP') / p.getAttribute('MAX_HP')
    }, 0)

    const enemiesTotalHealthPercent = aliveEnemies.reduce((sum, p) => {
      return sum + p.getAttribute('HP') / p.getAttribute('MAX_HP')
    }, 0)

    // 血量百分比高的一方获胜
    let winner: PARTICIPANT_SIDE
    if (charactersTotalHealthPercent > enemiesTotalHealthPercent) {
      winner = PARTICIPANT_SIDE.ALLY
    } else if (enemiesTotalHealthPercent > charactersTotalHealthPercent) {
      winner = PARTICIPANT_SIDE.ENEMY
    } else {
      // 血量相同，判定为平局，默认角色方胜利
      winner = PARTICIPANT_SIDE.ALLY
    }

    this.endBattle(winner)

    // 添加回合上限到达的日志
    const logEntry: BattleLogEntry = {
      turn: `回合${battle.currentRound}`,
      source: '系统',
      action: '战斗结束',
      target: '系统',
      result: `回合数达到上限(${battle.maxTurns})，${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}以血量优势获胜`,
      level: 'warn',
      category: 'status',
    }
    this.syncBattleLog(logEntry)
  }

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  public async endBattle(winner: ParticipantSide): Promise<void> {
    const battle = this.battleData
    if (!battle) {
      this.battleLogger.warn(`战斗不存在`)
      return
    }

    this.stopAutoBattle()

    this.cleanupBattleTimers()

    battle.participants.forEach((participant) => {
      this.buffSystem.clearAllBuffs(participant.id)
      participant.buffs = []
    })

    battle.battleState = BATTLE_STATUS.SETTLEMENT
    battle.roundState = ROUND_STATUS.NONE

    battle.isActive = false
    battle.winner = winner
    battle.endTime = Date.now()

    const battleId = battle.battleId
    this.battleLogger.info(`Battle ended: ${battleId}`, {
      winner,
      duration: battle.endTime - battle.startTime,
      currentBattleState: battle.battleState,
    })

    const endAction: BattleAction = {
      id: `end_${Date.now()}`,
      type: 'skill',
      sourceId: 'system',
      targetId: 'system',
      success: true,
      timestamp: Date.now(),
      turn: this.turnManager.getTurnNumber(battle),
      effects: [
        {
          type: 'status',
          description: `战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}`,
          duration: 0,
        },
      ],
    }

    this.addBattleAction(endAction)

    this.battleRecorder.recordAction(
      battleId,
      endAction,
      this.turnManager.getTurnNumber(battle),
    )

    this.battleRecorder.endRecording(battleId, winner)
    this.battleRecorder.saveRecording(battleId)

    battle.battleState = BATTLE_STATUS.ENDED

    this.emit(BattleSystemEvent.BATTLE_END, {
      battleId,
      winner,
    })
  }

  /**
   * 清理战斗相关的所有定时器
   */
  private cleanupBattleTimers(): void {
    if (this.autoBattleTimerId) {
      this.rafTimer.clearTimeout(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }

    this.battleLogger.info(`战斗定时器已清理`)
  }

  /**
   * 重置战斗
   */
  public resetBattle(): void {
    const battle = this.battleData
    if (!battle) {
      this.battleLogger.warn(`战斗不存在`)
      return
    }

    this.stopAutoBattle()

    this.cleanupBattleTimers()

    battle.winner = undefined
    battle.endTime = undefined
    battle.turnOrder = []
    battle.currentTurn = 0
    battle.battleState = BATTLE_STATUS.CREATED
    battle.roundState = ROUND_STATUS.NONE

    battle.actions = []

    battle.participants.forEach((participant) => {
      participant.currentHealth = participant.maxHealth
      participant.currentEnergy = 0
      this.buffSystem.clearAllBuffs(participant.id)
      participant.buffs = []
    })

    const battleId = battle.battleId
    this.battleRecorder.clearRecording(battleId)

    this.emit(BattleSystemEvent.BATTLE_RESET, {
      battleId,
    })

    this.battleLogger.info(`战斗已重置: ${battleId}`)
  }

  /**
   * 获取战斗当前状态
   * @returns 当前战斗状态
   */
  public getBattleStatus(): string | undefined {
    return this.battleData?.battleState
  }

  /**
   * 获取回合当前状态
   * @returns 当前回合状态
   */
  public getRoundState(): RoundStatus | undefined {
    return this.battleData?.roundState
  }

  /**
   * 检查战斗是否处于指定状态
   * @param state - 要检查的状态
   * @returns 是否处于指定状态
   */
  public isBattleInState(state: string): boolean {
    return this.battleData?.battleState === state
  }

  /**
   * 检查战斗是否已结束
   * @returns 是否已结束
   */
  public isBattleEnded(): boolean {
    return this.isBattleInState(BATTLE_STATUS.ENDED)
  }

  /**
   * 检查战斗是否正在进行中
   * @returns 是否正在进行中
   */
  public isBattleInProgress(): boolean {
    const battle = this.battleData
    if (!battle) return false
    return battle.battleState === BATTLE_STATUS.ACTIVE
  }

  /**
   * 将战斗数据转换为战斗状态
   * @param {BattleData} battleData - 战斗数据
   * @returns {BattleState} 战斗状态
   */
  private convertToBattleState(battleData: BattleData): BattleState {
    return {
      battleId: battleData.battleId,
      participants: new Map(battleData.participants), // 保持为Map类型
      actions: [...battleData.actions],
      turnOrder: [...battleData.turnOrder],
      currentTurn: battleData.currentTurn,
      isActive: battleData.isActive,
      startTime: battleData.startTime,
      endTime: battleData.endTime,
      winner: battleData.winner,
    }
  }

  /**
   * 获取战斗状态
   * @returns {BattleState | undefined} 战斗状态
   */
  public getBattleState(): BattleState | undefined {
    const battle = this.battleData
    if (!battle) return undefined

    return this.convertToBattleState(battle)
  }

  /**
   * 开始自动战斗
   */
  public startAutoBattle(): void {
    const battle = this.battleData
    if (!battle) {
      this.battleLogger.warn(`战斗不存在`)
      return
    }
    battle.autoPlaying = true

    const autoBattleLoop = async () => {
      const curBattle = this.battleData
      if (!curBattle?.autoPlaying || !curBattle.isActive) {
        return
      }
      try {
        await this.processTurnInternal()

        if (
          curBattle.battleState === BATTLE_STATUS.ENDED ||
          curBattle.battleState === BATTLE_STATUS.PAUSED ||
          !curBattle.isActive
        ) {
          this.stopAutoBattle()
          return
        }

        const delay = this.getBattleDelay()
        const timerId = this.rafTimer.setTimeout(autoBattleLoop, delay)
        this.autoBattleTimerId = timerId
      } catch (error) {
        this.battleLogger.error('自动战斗出错:', error)
        this.stopAutoBattle()
      }
    }

    const delay = this.getBattleDelay()
    const timerId = this.rafTimer.setTimeout(autoBattleLoop, delay)
    this.autoBattleTimerId = timerId
    this.battleLogger.info(`自动战斗开始: ${battle.battleId}`)
  }

  private getBattleDelay(): number {
    const battle = this.battleData
    if (!battle) {
      return AUTO_BATTLE_CONFIG.DEFAULT_DELAY
    }
    return (
      AUTO_BATTLE_CONFIG.DELAYS[battle.battleSpeed] ??
      AUTO_BATTLE_CONFIG.DEFAULT_DELAY
    )
  }

  /**
   * 停止自动战斗
   */
  public stopAutoBattle(): void {
    const battle = this.battleData
    if (!battle) {
      this.battleLogger.warn(`战斗不存在`)
      return
    }

    battle.autoPlaying = false

    if (this.autoBattleTimerId) {
      this.rafTimer.clearTimeout(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }

    this.battleLogger.info(`自动战斗停止: ${battle.battleId}`)
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
    this.battleLogger.info(`回合 ${turnNumber} 执行完成`)
  }

  /**
   * 是否激活自动战斗
   */
  public isAutoBattleActive(): boolean {
    return this.battleData?.autoPlaying || false
  }

  /**
   * 获取参与者管理器实例
   */
  public getParticipantManager(): ParticipantManager {
    return this.participantManager
  }

  public getCurParticipantsInfo(): BattleParticipant[] {
    return Array.from(this.battleData.participants.values())
  }

  /**
   * 获取当前战斗数据
   */
  public getBattleData(): BattleData | undefined {
    return this.battleData
  }

  public setBattleSpeed(speed: number): void {
    const battle = this.battleData
    if (battle) {
      battle.battleSpeed = speed
    }
  }

  /**
   * 事件系统方法
   */
  private emit(event: string, data: any): void {
    this.battleLogger.debug(`发射事件: ${event}`, {
      data: JSON.stringify(data, null, 2).substring(0, 1000), // 限制日志长度
    })
    eventBus.emit(event, data)
  }

  /**
   * 同步战斗日志到外部系统
   */
  private syncBattleLog(logEntry: BattleLogEntry): void {
    const battleId = this.battleData?.battleId
    this.battleLogger.info('syncBattleLog called', { battleId, logEntry })
    this.emit(BattleSystemEvent.BATTLE_LOG, { battleId, log: logEntry })
  }

  /**
   * 同步战斗状态更新
   */
  private syncBattleStateUpdate(): void {
    const battle = this.battleData
    if (!battle) return

    this.emit(BattleSystemEvent.BATTLE_STATE_UPDATE, {
      battleId: battle.battleId,
      participants: Array.from(battle.participants.values()).map((p) => {
        const activeBuffIds = this.buffSystem
          .getBuffInstances(p.id)
          .map((buff) => buff.id)
        p.buffs = activeBuffIds

        return {
          id: p.id,
          name: p.name,
          currentHp: p.getAttribute('HP'),
          maxHp: p.getAttribute('MAX_HP'),
          currentEnergy: p.currentEnergy,
          buffs: activeBuffIds,
        }
      }),
      turnOrder: battle.turnOrder,
      currentTurn: battle.currentTurn,
      currentRound: battle.currentRound,
    })
  }

  /**
   * 触发伤害数字动画
   */
  private triggerDamageAnimation(data: {
    targetId: string
    damage: number
    damageType: string
    isCritical: boolean
    isHeal: boolean
  }): void {
    this.emit(BattleSystemEvent.DAMAGE_ANIMATION, data)
  }

  /**
   * 触发闪避动画
   */
  private triggerMissAnimation(data: { targetId: string }): void {
    this.emit(BattleSystemEvent.MISS_ANIMATION, data)
  }

  /**
   * 触发Buff效果
   */
  private triggerBuffEffect(data: {
    targetId: string
    buffName: string
    isPositive: boolean
  }): void {
    this.emit(BattleSystemEvent.BUFF_EFFECT, data)
  }

  /**
   * 触发动画并等待完成
   * @param animationType 动画类型
   * @param data 动画数据
   * @param duration 动画持续时间（毫秒）
   */
  private async triggerAnimationAndWait(
    animationType: string,
    data: any,
    duration: number = 1000,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.animationQueue.push({
        type: animationType,
        data,
        resolve,
      })

      if (!this.isAnimationPlaying) {
        this.processAnimationQueue()
      }
    })
  }

  /**
   * 处理动画队列
   */
  private async processAnimationQueue(): Promise<void> {
    if (this.animationQueue.length === 0) {
      this.isAnimationPlaying = false
      return
    }

    this.isAnimationPlaying = true

    const animation = this.animationQueue.shift()
    if (!animation) {
      this.isAnimationPlaying = false
      return
    }

    this.emit(animation.type, animation.data)

    this.rafTimer.setTimeout(() => {
      animation.resolve()
      this.processAnimationQueue()
    }, 1000)
  }

  /**
   * 检查是否有动画正在播放
   * @returns 是否有动画正在播放
   */
  private isAnimating(): boolean {
    return this.isAnimationPlaying
  }

  /**
   * 清理动画状态
   */
  private cleanupAnimationState(): void {
    this.animationQueue = []
    this.isAnimationPlaying = false
  }

  /**
   * 触发技能效果动画
   */
  private async triggerSkillEffectAnimation(data: {
    sourceId: string
    targetId: string
    skillName: string
    effectType: string
    damageType: string
  }): Promise<void> {
    if (this.battleData) {
      await this.triggerAnimationAndWait('skill-effect', data, 1500)
    }
  }

  /**
   * 触发伤害数字动画并等待完成
   */
  private async triggerDamageAnimationAndWait(data: {
    targetId: string
    damage: number
    damageType: string
    isCritical: boolean
    isHeal: boolean
  }): Promise<void> {
    if (this.battleData) {
      await this.triggerAnimationAndWait(
        BattleSystemEvent.DAMAGE_ANIMATION,
        data,
        data.isCritical ? 1500 : 1000,
      )
    }
  }

  /**
   * 触发闪避动画并等待完成
   */
  private async triggerMissAnimationAndWait(data: {
    targetId: string
  }): Promise<void> {
    if (this.battleData) {
      await this.triggerAnimationAndWait(
        BattleSystemEvent.MISS_ANIMATION,
        data,
        1000,
      )
    }
  }

  /**
   * 触发Buff效果动画并等待完成
   */
  private async triggerBuffEffectAndWait(data: {
    targetId: string
    buffName: string
    isPositive: boolean
  }): Promise<void> {
    if (this.battleData) {
      await this.triggerAnimationAndWait(
        BattleSystemEvent.BUFF_EFFECT,
        data,
        800,
      )
    }
  }
}
