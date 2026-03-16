/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 1.0.0
 */

import type { IBattleSystem } from '@/core/battle/interfaces.ts'
import type {
  BattleAction,
  BattleData,
  BattleParticipant,
  BattleState,
  ParticipantSide,
  RoundStatus,
} from '@/types/battle'
import { BattleActionHelper } from '@/types/battle'

import type { BattleAI } from '@/core/BattleAI'
import { BuffSystem } from '@/core/BuffSystem'
import { AISystem } from '@/core/battle/AISystem'
import { ActionExecutor } from '@/core/battle/ActionExecutor'
import { BattleRecorder } from '@/core/battle/BattleRecorder'
import { BattleRuleManager } from '@/core/battle/BattleRuleManager'
import { ParticipantManager } from '@/core/battle/ParticipantManager'
import { TurnManager } from '@/core/battle/TurnManager'
import {
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
  PARTICIPANT_MANAGER_TOKEN,
  TURN_MANAGER_TOKEN,
} from '@/core/battle/interfaces'
import type { Container } from '@/core/di/Container'
import { DamageCalculator } from '@/core/skill/DamageCalculator'
import {
  PassiveSkillManager,
  PassiveSkillTrigger,
} from '@/core/skill/PassiveSkillManager'
import { SkillManager } from '@/core/skill/SkillManager'
import { eventBus } from '@/main'
import {
  AUTO_BATTLE_CONFIG,
  BATTLE_CONSTANTS,
  BATTLE_STATUS,
  BattleSystemEvent,
  PARTICIPANT_SIDE,
  ROUND_STATUS,
} from '@/types/battle'
import {
  newLogSegment,
  LogLevel,
  BATTLE_LOG_CATEGORIES,
} from '@/types/battle-log'
import { EFFECT_TYPES } from '@/types/effect'
import type { ExtendedSkillStep } from '@/types/skill'
import { RAFTimer } from '@/utils/RAF'
import { battleLogManager } from '@/utils/logging'

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
  private battleData: BattleData

  private isProcessingTurn = false

  private animationQueue: Array<{
    type: string
    data: any
    resolve: () => void
  }> = []

  private isAnimationPlaying = false

  /**
   * 当前开启【自动战斗】模式
   */
  private autoBattle = false
  /**
   * 当前是否处于暂停状态
   */
  private isPaused = true
  /**
   * 当前战斗速度倍率，默认为1
   */
  private battleSpeed = 1

  private autoBattleTimerId?: symbol

  /**
   * 等待指定时间（使用 RAFTimer）
   * @param ms 等待毫秒数
   */
  private wait(ms: number): Promise<void> {
    console.log('等待', ms, '毫秒')
    return new Promise((resolve) => {
      this.rafTimer.setTimeout(resolve, ms)
    })
  }

  /**
   * 等待当前动画播放完成
   */
  private async waitForAnimation(): Promise<void> {
    while (this.isAnimating()) {
      await this.wait(100)
    }
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
  ): BattleSystem {
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

    return new BattleSystem(
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

  /**
   * 获取当前回合数
   * @returns 当前回合数（从1开始）
   */
  public getTurn(): number {
    return this.battleData.currentTurn
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
      autoBattle: false,
      battleSpeed: 1,
      battleState: BATTLE_STATUS.CREATED,
      roundState: ROUND_STATUS.NONE,
      skillManager: this.skillManager,
    }
  }

  /**
   * 初始化规则管理器
   */
  private async initializeRuleManager(): Promise<void> {
    try {
      await this.ruleManager.loadConfig()
      battleLogManager.addDebugLog('战斗规则管理器初始化完成')

      // 配置伤害计算器
      this.configureDamageCalculator()
    } catch (error) {
      battleLogManager.addDebugLog('战斗规则管理器初始化失败', error)
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
   * @param {BattleParticipant[]} allyParticipants - 我方参与者数组
   * @param {BattleParticipant[]} enemyParticipants - 敌方参与者数组
   * @returns {BattleState} 初始化后的战斗状态
   */
  public initialize(
    allyParticipants: BattleParticipant[],
    enemyParticipants: BattleParticipant[],
  ): BattleState {
    const allParticipants = [...allyParticipants, ...enemyParticipants]
    console.log('allyParticipants', allyParticipants)
    console.log('enemyParticipants', enemyParticipants)

    const participants =
      this.participantManager.createParticipants(allParticipants)
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

    battleData.battleState = BATTLE_STATUS.ACTIVE
    battleData.roundState = ROUND_STATUS.START

    const autoBattleRules = this.ruleManager.getAutoBattleRules()
    this.autoBattle = autoBattleRules.enabled
    battleData.autoBattle = autoBattleRules.enabled
    battleData.battleSpeed = autoBattleRules.defaultSpeed

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
    if (battle.battleState !== BATTLE_STATUS.ACTIVE) {
      return
    }

    try {
      battle.roundState = ROUND_STATUS.START
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

      // battleLogManager.addBattleLog(battle.currentTurn, '本回合出手顺序', {
      //   turnOrder: currentTurnOrder.map((id) => {
      //     const participant = battle.participants.get(id)
      //     const effectiveSpeed = this.turnManager.calculateEffectiveSpeed(
      //       participant!,
      //     )
      //     return {
      //       id,
      //       name: participant?.name,
      //       effectiveSpeed,
      //     }
      //   }),
      // })

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, 1, currentTurnOrder[0])

      for (let i = 0; i < currentTurnOrder.length; i++) {
        await this.waitForAnimation()
        const participantId = currentTurnOrder[i]
        const participant = battle.participants.get(participantId)
        if (!participant || !participant.isAlive()) {
          continue
        }

        battle.currentTurn = i

        try {
          await this.executeParticipantAction(battle, participant)
        } catch (error) {
          battleLogManager.addDebugLog('角色行动执行出错:', error)
          await this.executeDefaultAction(battle, participant)
        }

        await this.waitForAnimation()

        this.buffSystem.updatePerTurn(participant.id, battle.currentRound || 1)

        this.checkBattleEndCondition()

        if (battle.battleState !== BATTLE_STATUS.ACTIVE) {
          return
        }
      }

      await this.waitForAnimation()

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
      battleLogManager.addDebugLog('处理回合时出错:', LogLevel.ERROR, error)
    } finally {
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
        const action = BattleActionHelper.createStatus({
          sourceId: participant.id,
          targetId: participant.id,
          turn: this.turnManager.getTurnNumber(battle),
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
          this.turnManager.getTurnNumber(battle),
          `${participant.name} 被控制，无法行动`,
          [{ text: `${participant.name} 被控制，无法行动` }],
          BATTLE_LOG_CATEGORIES.STATUS,
        )

        battleLogManager.addDebugLog(
          `角色[${participant.name}]被控制，无法行动`,
        )
        return
      }

      // 获取所有可用技能并过滤掉被动技能
      const allSkillIds = participant.getSkillIds()
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
            battleId: battle.battleId,
            participants: battle.participants,
            actions: battle.actions,
            turnOrder: battle.turnOrder,
            currentTurn: battle.currentTurn,
            battleState: battle.battleState!,
            startTime: battle.startTime,
          },
          participant,
        )

        battleLogManager.addDebugLog(
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

    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: targetId,
      skillId: skill.id,
      skillName: skill.name,
      turn: this.turnManager.getTurnNumber(battle),
    })

    try {
      const skillAction = this.skillManager.executeSkill(
        skill.id,
        source,
        battle.participants.get(targetId)!,
      )

      action.damage = skillAction.damage
      action.heal = skillAction.heal
      action.effects = skillAction.effects

      battleLogManager.addBattleLog(
        battle.currentTurn,
        `技能执行成功: ${skill.id}`,
        [{ text: `技能执行成功: ${skill.id}` }],
        BATTLE_LOG_CATEGORIES.ACTION,
      )
    } catch (error) {
      battleLogManager.addDebugLog(`技能执行失败: ${skill.id}`, error)
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

    return action
  }

  /**
   * 构造普通攻击的技能步骤配置
   * @param source 攻击者
   * @param targetId 目标ID
   * @returns 技能步骤配置
   */
  private buildNormalAttackStep(
    source: BattleParticipant,
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
    source: BattleParticipant,
    target: BattleParticipant,
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
    source: BattleParticipant,
    target: BattleParticipant,
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
    source: BattleParticipant,
    target: BattleParticipant,
    turnNumber: number,
  ): Promise<void> {
    action.effects.push({
      type: EFFECT_TYPES.MISS,
      value: 0,
      description: `${target.name} 闪避了攻击`,
    })

    await this.triggerMissAnimationAndWait({ targetId: target.id })

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
    source: BattleParticipant,
    target: BattleParticipant,
    damageResult: { damage: number; isCritical: boolean },
    turnNumber: number,
  ): Promise<void> {
    const { damage, isCritical } = damageResult
    action.damage = damage

    this.applyDamageToTarget(source, target, damage)

    action.effects.push({
      type: EFFECT_TYPES.DAMAGE,
      value: damage,
      description: `${source.name} 普通攻击 造成 ${damage} 伤害${isCritical ? ' (暴击)' : ''}`,
    })

    await this.triggerDamageAnimationAndWait({
      targetId: target.id,
      damage,
      damageType: 'physical',
      isCritical,
      isHeal: false,
    })

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
    source: BattleParticipant,
  ): Promise<BattleAction> {
    const targetId = this.selectTarget(battle, source)
    const target = battle.participants.get(targetId)

    if (!target) {
      battleLogManager.addDebugLog(`攻击失败: 未找到目标 ${targetId}`)
      return this.createBattleAction(
        source.id,
        source.id,
        this.turnManager.getTurnNumber(battle),
      )
    }

    const turnNumber = this.turnManager.getTurnNumber(battle)

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

    const action = this.createBattleAction(source.id, targetId, turnNumber)

    if (damageResult.isMiss) {
      await this.handleMissAttack(action, source, target, turnNumber)
    } else {
      await this.handleHitAttack(
        action,
        source,
        target,
        damageResult,
        turnNumber,
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
          (effect) => effect.type === EFFECT_TYPES.MISS,
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
            effect.type === EFFECT_TYPES.BUFF ||
            effect.type === EFFECT_TYPES.DEBUFF
          ) {
            // 确定buff目标 - 通过 targetId 判断作用目标
            let buffTarget = target
            if (effect.targetId === source.id) {
              buffTarget = source
            }

            // 触发buff添加动画并等待完成
            await this.triggerBuffEffectAndWait({
              targetId: buffTarget.id,
              buffName: effect.buffId || 'unknown',
              isPositive: effect.type === EFFECT_TYPES.BUFF,
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
      battleLogManager.addDebugLog(
        `Heal applied: ${source.name} → ${target.name}`,
        {
          heal: actualHeal,
          targetHealth: target.currentHealth,
        },
      )

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
    battleLogManager.addBattleLog(
      battle.currentRound,
      `回合数达到上限(${battle.maxTurns})，${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}以血量优势获胜`,
      [
        {
          text: `回合数达到上限(${battle.maxTurns})，${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}以血量优势获胜`,
        },
      ],
      BATTLE_LOG_CATEGORIES.STATUS,
    )
  }

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  public async endBattle(winner: ParticipantSide): Promise<void> {
    const battle = this.battleData
    if (!battle) {
      battleLogManager.addDebugLog(`战斗不存在`)
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

    battle.battleState = BATTLE_STATUS.ENDED
    battle.winner = winner
    battle.endTime = Date.now()

    const battleId = battle.battleId
    battleLogManager.addBattleLog(battle.currentTurn, `战斗结束`, [
      {
        text: `战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}`,
      },
    ])

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

    eventBus.emit(BattleSystemEvent.BATTLE_END, {
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

    battleLogManager.addDebugLog(`战斗定时器已清理`)
  }

  /**
   * 重置战斗
   */
  public resetBattle(): void {
    const battle = this.battleData
    if (!battle) {
      battleLogManager.addDebugLog(`战斗不存在`)
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

    battleLogManager.addDebugLog(`战斗已重置: ${battleId}`)
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
   * 获取当前是否处于自动战斗状态
   * @returns 是否处于自动战斗状态
   */
  public getAutoBattle(): boolean {
    return this.autoBattle
  }

  /**
   * 获取当前是否处于暂停状态
   * @returns 是否处于暂停状态
   */
  public getIsPaused(): boolean {
    return this.isPaused
  }

  /**
   * 获取当前战斗速度倍率
   * @returns 战斗速度倍率
   */
  public getBattleSpeed(): number {
    return this.battleSpeed
  }

  /**
   * 设置战斗速度倍率
   * @param speed 战斗速度倍率
   */
  public setSpeed(speed: number): void {
    this.battleSpeed = speed
    this.battleData.battleSpeed = speed
    battleLogManager.addSystemLog(`战斗速度已调整为: ${speed}倍`, [
      newLogSegment(`战斗速度已调整为: `),
      newLogSegment(`${speed}`, 'number'),
      newLogSegment(`倍`, 'number'),
    ])
  }

  /**
   * 切换暂停状态
   */
  public togglePause(): void {
    this.isPaused = !this.isPaused
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
      participants: new Map(battleData.participants),
      actions: [...battleData.actions],
      turnOrder: [...battleData.turnOrder],
      currentTurn: battleData.currentTurn,
      battleState: battleData.battleState!,
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
    this.autoBattle = true
    this.battleData.autoBattle = true
    battleLogManager.addDebugLog(`自动战斗开始: ${this.battleData.battleId}`)
    const autoBattleLoop = async () => {
      let battle = this.battleData
      console.log('自动战斗循环开始:', battle.autoBattle, battle.battleState)
      if (!battle.autoBattle || battle.battleState !== BATTLE_STATUS.ACTIVE) {
        return
      }
      try {
        console.log('processTurnInternal开始')
        await this.processTurnInternal()
        console.log('processTurnInternal结束')
        console.log(
          '自动战斗循环开始processTurnInternal:',
          battle.autoBattle,
          battle.battleState,
        )
        battle = this.battleData
        if (
          battle.battleState === BATTLE_STATUS.ENDED ||
          battle.battleState === BATTLE_STATUS.PAUSED
        ) {
          this.stopAutoBattle()
          return
        }

        const delay = this.getBattleDelay()
        const timerId = this.rafTimer.setTimeout(autoBattleLoop, delay)
        this.autoBattleTimerId = timerId
      } catch (error) {
        battleLogManager.addDebugLog('自动战斗出错:', LogLevel.ERROR, error)
        this.stopAutoBattle()
      }
    }

    const delay = this.getBattleDelay()
    const timerId = this.rafTimer.setTimeout(autoBattleLoop, delay)
    this.autoBattleTimerId = timerId
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
      battleLogManager.addDebugLog(`战斗不存在`)
      return
    }

    this.autoBattle = false
    this.battleData.autoBattle = false

    if (this.autoBattleTimerId) {
      this.rafTimer.clearTimeout(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }

    battleLogManager.addDebugLog(`自动战斗停止: ${battle.battleId}`)
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
   * 触发伤害数字动画
   */
  private triggerDamageAnimation(data: {
    targetId: string
    damage: number
    damageType: string
    isCritical: boolean
    isHeal: boolean
  }): void {
    eventBus.emit(BattleSystemEvent.DAMAGE_ANIMATION, data)
  }

  /**
   * 触发闪避动画
   */
  private triggerMissAnimation(data: { targetId: string }): void {
    eventBus.emit(BattleSystemEvent.MISS_ANIMATION, data)
  }

  /**
   * 触发Buff效果
   */
  private triggerBuffEffect(data: {
    targetId: string
    buffName: string
    isPositive: boolean
  }): void {
    eventBus.emit(BattleSystemEvent.BUFF_EFFECT, data)
  }

  /**
   * 获取动画时长（根据战斗速度动态调整）
   * 确保动画时间与角色行动间隔一致
   * @returns 动画时长（毫秒）
   */
  private getAnimationDuration(): number {
    const delay = this.getBattleDelay()
    return delay
  }

  /**
   * 触发动画并等待完成
   * @param animationType 动画类型
   * @param data 动画数据
   * @param duration 动画持续时间（毫秒），如果为0则使用战斗速度对应的默认时长
   */
  private async triggerAnimationAndWait(
    animationType: string,
    data: any,
    duration: number = 0,
  ): Promise<void> {
    const actualDuration = duration > 0 ? duration : this.getAnimationDuration()

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

    eventBus.emit(animation.type, animation.data)

    const duration = this.getAnimationDuration()

    await new Promise<void>((resolve) => {
      this.rafTimer.setTimeout(() => {
        animation.resolve()
        this.processAnimationQueue()
        resolve()
      }, duration)
    })
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
      const duration = Math.floor(this.getAnimationDuration() * 1.5)
      await this.triggerAnimationAndWait('skill-effect', data, duration)
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
      const baseDuration = this.getAnimationDuration()
      const duration = data.isCritical
        ? Math.floor(baseDuration * 1.5)
        : baseDuration
      await this.triggerAnimationAndWait(
        BattleSystemEvent.DAMAGE_ANIMATION,
        data,
        duration,
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
        this.getAnimationDuration(),
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
