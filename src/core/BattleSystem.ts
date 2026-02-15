/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 1.0.0
 */

import type {
  BattleSystem as IBattleSystem,
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleData,
  ParticipantSide,
  RoundStatus,
} from '@/types/battle'
import { BATTLE_STATUS, ROUND_STATUS, PARTICIPANT_SIDE } from '@/types/battle'
import type { Character } from '@/types/character'
import type { EnemyInstance } from '@/types/enemy'
import type { AttributeType } from '@/types/modifier'
import { battleLogManager } from '@/utils/logging'
import { RAFTimer } from '@/utils/RAF'
import { container } from './di/Container'
import {
  TURN_MANAGER_TOKEN,
  ACTION_EXECUTOR_TOKEN,
  AI_SYSTEM_TOKEN,
} from '@/core/battle/interfaces'
import type { BattleAI } from '@/core/BattleAI'

import { TurnManager } from '@/core/battle/TurnManager'
import { ActionExecutor } from '@/core/battle/ActionExecutor'
import { ParticipantManager } from '@/core/battle/ParticipantManager'
import { AISystem } from '@/core/battle/AISystem'
import { BattleRecorder } from '@/core/battle/BattleRecorder'
import { BattleRuleManager } from '@/core/battle/BattleRuleManager'
import { SkillManager } from '@/core/skill/SkillManager'
import { BuffSystem } from '@/core/BuffSystem'
import type { BattleLogEntry } from '@/types/battle-log'

/**
 * 战斗系统核心类
 * 负责管理所有战斗实例、处理回合逻辑、执行战斗动作
 * 采用单例模式确保全局只有一个战斗系统实例
 */
export class GameBattleSystem implements IBattleSystem {
  // 单例实例
  private static instance: GameBattleSystem
  // 存储所有战斗数据的映射表，key为战斗ID，value为战斗数据
  private battles = new Map<string, BattleData>()
  private curBattleId: string
  private curBattleData: BattleData

  // 自动战斗速度到延迟(ms)的映射
  private static readonly AUTO_BATTLE_DELAYS: Record<number, number> = {
    1: 1000,
    2: 500,
    3: 330,
    5: 200,
  }

  // 战斗日志记录器实例
  private battleLogger = battleLogManager

  // 事件系统
  private eventListeners: Map<string, Function[]> = new Map()

  // 技能管理器实例
  private skillManager = new SkillManager()
  private ruleManager = new BattleRuleManager()
  private buffSystem = BuffSystem.getInstance()

  private turnManager: TurnManager
  private actionExecutor: ActionExecutor
  private participantManager: ParticipantManager
  private aiSystem: AISystem
  private battleRecorder: BattleRecorder
  private curParticipantsInfo: BattleParticipant[] = []
  private rafTimer = new RAFTimer()

  // 私有构造函数，防止外部直接实例化
  private constructor() {
    this.turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )
    this.actionExecutor = container.resolve<ActionExecutor>(
      ACTION_EXECUTOR_TOKEN.toString(),
    )
    this.participantManager = new ParticipantManager()
    this.aiSystem = container.resolve<AISystem>(AI_SYSTEM_TOKEN.toString())
    this.battleRecorder = new BattleRecorder()

    this.curBattleData = this.getDefBattleData()
    this.curBattleId = this.curBattleData.battleId
    this.initializeRuleManager()
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
   * 获取战斗系统单例实例
   * @returns {GameBattleSystem} 战斗系统单例实例
   */
  public static getInstance(): GameBattleSystem {
    if (!GameBattleSystem.instance) {
      GameBattleSystem.instance = new GameBattleSystem()
    }
    return GameBattleSystem.instance
  }

  /**
   * 创建新的战斗实例
   * @param {BattleParticipant[]} participantsInfo - 参与者数组
   * @returns {BattleState} 创建的战斗状态
   */
  public createBattle(participantsInfo: BattleParticipant[]): BattleState {
    console.log('participantsInfo', participantsInfo)
    this.curParticipantsInfo = participantsInfo

    const participants =
      this.participantManager.createParticipants(participantsInfo)
    const battleData = this.curBattleData
    battleData.participants = participants
    battleData.aiInstances = this.aiSystem.createAIInstances(participants)

    // 使用TurnManager初始化回合顺序
    this.turnManager.initializeBattle(
      battleData,
      this.turnManager.createTurnOrder(Array.from(participants.values())),
    )

    // 将战斗数据存入映射表
    this.battles.set(battleData.battleId, battleData)

    // 更新战斗状态
    battleData.battleState = BATTLE_STATUS.PREPARING

    // 统一注册到 ActionExecutor，建立参与者到战斗的映射
    this.actionExecutor.registerBattle(
      this.curBattleData.battleId,
      this.curBattleData,
    )
    const battleId = this.curBattleData.battleId
    // 开始记录战斗
    this.battleRecorder.startRecording(battleId, {
      participants: participantsInfo,
    })

    // 记录战斗创建日志
    this.battleLogger.info(`Battle created: ${battleId}`, {
      participantCount: participantsInfo.length,
      characterCount: participantsInfo.filter(
        (p) => p.type === PARTICIPANT_SIDE.ALLY,
      ).length,
      enemyCount: participantsInfo.filter(
        (p) => p.type === PARTICIPANT_SIDE.ENEMY,
      ).length,
      currentBattleState: battleData.battleState,
    })

    // 添加战斗开始的系统动作
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

    this.addBattleAction(battleId, initAction)

    // 记录初始化动作到战斗记录器
    this.battleRecorder.recordAction(battleId, initAction, 0)

    // 应用所有角色的被动技能效果
    this.applyPassiveSkills(participants)

    // 进入战斗阶段
    battleData.battleState = BATTLE_STATUS.ACTIVE
    battleData.roundState = ROUND_STATUS.START
    battleData.isActive = true

    // 返回战斗状态
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
    for (const participant of participants.values()) {
      const skills = participant.getSkills()
      const passiveSkills = skills.filter(
        (skill) => skill.type === 'passive',
      )

      for (const passiveSkill of passiveSkills) {
        try {
          // 被动技能通过buff机制生效
          const skillConfig = this.skillManager.getSkillConfig(passiveSkill.id)
          if (skillConfig?.steps) {
            for (const step of skillConfig.steps) {
              if (step.type === 'buff' && step.buffId) {
                this.buffSystem.addBuff(participant.id, step.buffId, {
                  id: step.buffId,
                  name: skillConfig.name,
                  duration: step.duration || -1,
                  description: skillConfig.description,
                })
                this.battleLogger.info(
                  `被动技能生效[${participant.name}]: ${skillConfig.name}`,
                )
              }
            }
          }
        } catch (error) {
          this.battleLogger.error(
            `应用被动技能失败[${participant.name} - ${passiveSkill.name}]:`,
            error,
          )
        }
      }
    }
  }

  /**
   * 内部方法：处理战斗回合的核心逻辑
   * 实现每回合重新计算出手顺序，并按顺序执行所有角色行动
   * @param {string} battleId - 战斗ID
   */
  private async processTurnInternal(battleId: string): Promise<void> {
    const battle = this.battles.get(battleId)
    if (!battle) {
      return
    }

    battle.roundState = ROUND_STATUS.START

    const combatRules = this.ruleManager.getCombatRules()
    this.participantManager.gainEnergyToAllAlive(
      battle.participants,
      combatRules.energyGainPerTurn,
    )

    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    if (aliveParticipants.length === 0) {
      battle.roundState = ROUND_STATUS.END
      this.checkBattleEndCondition(battle)
      return
    }

    const newTurnOrder = this.turnManager.recalculateTurnOrder(battle)
    battle.turnOrder = newTurnOrder
    battle.currentTurn = 0

    this.battleRecorder.recordTurnStart(battleId, 1, newTurnOrder[0])

    this.syncBattleStateUpdate(battleId)

    this.battleLogger.info('回合开始，重新计算出手顺序', {
      turnOrder: newTurnOrder.map((id) => {
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

    for (let i = 0; i < newTurnOrder.length; i++) {
      const participantId = newTurnOrder[i]
      const participant = battle.participants.get(participantId)

      if (!participant || !participant.isAlive()) {
        continue
      }

      battle.currentTurn = i

      this.syncBattleStateUpdate(battleId)

      try {
        await this.executeParticipantAction(battle, participant)
      } catch (error) {
        this.battleLogger.error('角色行动执行出错:', error)
        await this.executeDefaultAction(battle, participant)
      }

      this.buffSystem.update(0)

      this.syncBattleStateUpdate(battleId)

      this.checkBattleEndCondition(battle)

      if (!battle.isActive) {
        return
      }
    }

    battle.roundState = ROUND_STATUS.END

    this.battleRecorder.recordTurnEnd(
      battleId,
      this.turnManager.getTurnNumber(battle),
    )

    battle.currentRound++

    battle.roundState = ROUND_STATUS.START
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
      // 获取所有可用技能并过滤掉被动技能
      const allAvailableSkills = participant.getSkills().filter((skill) => {
        const energyCost = this.getSkillEnergyCost(skill?.id)
        return participant.currentEnergy >= energyCost
      })

      // 过滤掉被动技能
      const availableSkills = allAvailableSkills.filter((skill) => {
        return skill.type !== 'passive'
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
        
        this.battleLogger.debug(`AI决策[${participant.name}]: ${action.type === 'skill' ? '使用技能' : '普通攻击'}`)
        
        if (action.type === 'skill' && action.skillId) {
          const skill = participant.getSkills().find(s => s.id === action.skillId)
          if (skill) {
            await this.selectAndExecuteSkill(battle, participant, skill)
          } else {
            await this.selectAndExecuteAttack(battle, participant)
          }
        } else {
          await this.selectAndExecuteAttack(battle, participant)
        }
      } else if (availableSkills.length > 0 && Math.random() < 0.4 && availableSkills[0]) {
        // 没有AI实例时使用原来的随机选择逻辑（也过滤了被动技能）
        const selectedSkill =
          availableSkills[Math.floor(Math.random() * availableSkills.length)]
        await this.selectAndExecuteSkill(battle, participant, selectedSkill)
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
          type: 'damage',
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        },
      ]
    }

    this.addBattleAction(battle.battleId, action)
    this.battleRecorder.recordAction(
      battle.battleId,
      action,
      this.turnManager.getTurnNumber(battle),
    )

    this.syncBattleStateUpdate(battle.battleId)

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
    const baseDamage = source.getAttribute('ATK')
    const damage = Math.floor(baseDamage * (0.8 + Math.random() * 0.4))

    const action: BattleAction = {
      id: `attack_${Date.now()}`,
      type: 'attack',
      sourceId: source.id,
      targetId: target,
      damage,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      turn: this.turnManager.getTurnNumber(battle),
      effects: [
        {
          type: 'damage',
          value: damage,
          description: `${source.name} 普通攻击 造成 ${damage} 伤害`,
        },
      ],
    }

    targetParticipant!.takeDamage(damage)

    this.triggerDamageAnimation({
      targetId: target,
      damage,
      damageType: 'physical',
      isCritical: false,
      isHeal: false,
    })

    const logEntry: BattleLogEntry = {
      turn: `回合${this.turnManager.getTurnNumber(battle)}`,
      source: source.name,
      action: '对',
      target: targetParticipant!.name,
      result: `${source.name} 对 ${targetParticipant!.name} 发动普通攻击，造成 ${damage} 点物理伤害。`,
      level: 'damage',
    }
    this.syncBattleLog(battle.battleId, logEntry)

    this.addBattleAction(battle.battleId, action)
    this.battleRecorder.recordAction(
      battle.battleId,
      action,
      this.turnManager.getTurnNumber(battle),
    )

    this.battleLogger.info(
      `普通攻击: ${source.name} → ${targetParticipant!.name}`,
      {
        damage,
        targetHealth: targetParticipant!.currentHealth,
      },
    )

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
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 100
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50
    }
    return 0
  }

  /**
   * 处理战斗回合（公开接口）
   * @param {string} battleId - 战斗ID
   */
  public async processTurn(battleId: string): Promise<void> {
    const battle = this.battles.get(battleId)
    if (!battle || !battle.isActive) {
      return
    }

    // 检查是否在自动战斗中，如果是则跳过
    if (battle.autoPlaying) {
      return
    }

    await this.processTurnInternal(battleId)
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
          type: 'damage',
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
    // 通过动作发起者找到对应的战斗
    const battle = this.findBattleByParticipant(action.sourceId)
    if (!battle) {
      throw new Error(
        `No active battle found for participant ${action.sourceId}`,
      )
    }

    // 获取动作发起者和目标
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

        this.battleLogger.info(`技能执行成功: ${action.skillId}`, {
          source: source.name,
          target: target.name,
          damage: action.damage,
          heal: action.heal,
        })
      } catch (error) {
        this.battleLogger.error(`技能执行失败: ${action.skillId}`, error)
        // 技能执行失败，降级为普通攻击
        action.type = 'attack'
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [
          {
            type: 'damage',
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

      // 记录伤害日志
      this.battleLogger.info(`Damage dealt: ${source.name} → ${target.name}`, {
        damage: actualDamage,
        targetHealth: target.currentHealth,
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
    }

    // 添加动作到战斗记录
    this.addBattleAction(battle.battleId, action)

    // 记录动作到战斗记录器
    this.battleRecorder.recordAction(
      battle.battleId,
      action,
      this.turnManager.getTurnNumber(battle),
    )

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
   * @param {string} battleId - 战斗ID
   * @param {BattleAction} action - 战斗动作
   */
  private addBattleAction(battleId: string, action: BattleAction): void {
    const battle = this.battles.get(battleId)
    if (battle) {
      battle.actions.push(action)

      // 限制动作记录数量，防止内存占用过多（从原始版本继承）
      if (battle.actions.length > 100) {
        battle.actions = battle.actions.slice(-100)
      }
    }
  }

  /**
   * 根据参与者ID查找战斗
   * @param {string} participantId - 参与者ID
   * @returns {BattleData | undefined} 战斗数据
   */
  private findBattleByParticipant(
    participantId: string,
  ): BattleData | undefined {
    for (const battle of this.battles.values()) {
      if (battle.participants.has(participantId) && battle.isActive) {
        return battle
      }
    }
    return undefined
  }

  /**
   * 检查战斗结束条件
   * @param {BattleData} battle - 战斗数据
   */
  private checkBattleEndCondition(battle: BattleData): void {
    const aliveCharacters = Array.from(battle.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ALLY && p.isAlive(),
    )
    const aliveEnemies = Array.from(battle.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ENEMY && p.isAlive(),
    )

    if (aliveCharacters.length === 0) {
      this.endBattle(battle.battleId, PARTICIPANT_SIDE.ENEMY)
    } else if (aliveEnemies.length === 0) {
      this.endBattle(battle.battleId, PARTICIPANT_SIDE.ALLY)
    }
  }

  /**
   * 结束战斗
   * @param {string} battleId - 战斗ID
   * @param {ParticipantSide} winner - 胜利者类型
   */
  public async endBattle(
    battleId: string,
    winner: ParticipantSide,
  ): Promise<void> {
    const battle = this.battles.get(battleId)
    if (!battle) {
      this.battleLogger.warn(`战斗不存在: ${battleId}`)
      return
    }

    // 转换到战斗结算
    battle.battleState = BATTLE_STATUS.SETTLEMENT
    battle.roundState = ROUND_STATUS.NONE

    battle.isActive = false
    battle.winner = winner
    battle.endTime = Date.now()

    this.battleLogger.info(`Battle ended: ${battleId}`, {
      winner,
      duration: battle.endTime - battle.startTime,
      currentBattleState: battle.battleState,
    })

    // 添加战斗结束动作
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

    this.addBattleAction(battleId, endAction)

    // 记录结束动作
    this.battleRecorder.recordAction(
      battleId,
      endAction,
      this.turnManager.getTurnNumber(battle),
    )

    // 结束记录并保存战斗过程
    this.battleRecorder.endRecording(battleId, winner)
    this.battleRecorder.saveRecording(battleId)

    // 转换到战斗结束
    battle.battleState = BATTLE_STATUS.ENDED
  }

  /**
   * 重置战斗
   * @param {string} battleId - 战斗ID
   */
  public resetBattle(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (!battle) {
      this.battleLogger.warn(`战斗不存在: ${battleId}`)
      return
    }

    // 停止自动战斗
    this.stopAutoBattle(battleId)

    // 重置战斗状态
    battle.winner = undefined
    battle.endTime = undefined
    battle.turnOrder = []
    battle.currentTurn = 0
    battle.battleState = BATTLE_STATUS.CREATED
    battle.roundState = ROUND_STATUS.NONE

    // 清空战斗动作记录
    battle.actions = []

    // 重置所有参与者状态
    battle.participants.forEach((participant) => {
      participant.currentHealth = participant.maxHealth
      participant.currentEnergy = 0
      participant.buffs = []
    })

    // 清除战斗记录
    this.battleRecorder.clearRecordings()

    this.battleLogger.info(`战斗已重置: ${battleId}`)
  }

  /**
   * 获取战斗当前状态
   * @param {string} battleId - 战斗ID
   * @returns 当前战斗状态
   */
  public getBattleStatus(battleId: string): string | undefined {
    const battle = this.battles.get(battleId)
    return battle?.battleState
  }

  /**
   * 获取回合当前状态
   * @param {string} battleId - 战斗ID
   * @returns 当前回合状态
   */
  public getRoundState(battleId: string): RoundStatus | undefined {
    const battle = this.battles.get(battleId)
    return battle?.roundState
  }

  /**
   * 检查战斗是否处于指定状态
   * @param {string} battleId - 战斗ID
   * @param {BattleState} state - 要检查的状态
   * @returns 是否处于指定状态
   */
  public isBattleInState(battleId: string, state: string): boolean {
    const battle = this.battles.get(battleId)
    return battle?.battleState === state
  }

  /**
   * 检查战斗是否已结束
   * @param {string} battleId - 战斗ID
   * @returns 是否已结束
   */
  public isBattleEnded(battleId: string): boolean {
    return this.isBattleInState(battleId, BATTLE_STATUS.ENDED)
  }

  /**
   * 检查战斗是否正在进行中
   * @param {string} battleId - 战斗ID
   * @returns 是否正在进行中
   */
  public isBattleInProgress(battleId: string): boolean {
    const battle = this.battles.get(battleId)
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
   * @param {string} battleId - 战斗ID
   * @returns {BattleState | undefined} 战斗状态
   */
  public getBattleState(battleId: string): BattleState | undefined {
    const battle = this.battles.get(battleId)
    if (!battle) return undefined

    return this.convertToBattleState(battle)
  }

  /**
   * 获取所有战斗状态
   * @returns {BattleState[]} 所有战斗状态数组
   */
  public getAllBattles(): BattleState[] {
    return Array.from(this.battles.values()).map((b) =>
      this.convertToBattleState(b),
    )
  }

  /**
   * 获取活跃的战斗状态
   * @returns {BattleState[]} 活跃的战斗状态数组
   */
  public getActiveBattles(): BattleState[] {
    return Array.from(this.battles.values())
      .filter((b) => b.isActive)
      .map((b) => this.convertToBattleState(b))
  }

  /**
   * 清理已完成的战斗
   */
  public clearCompletedBattles(): void {
    for (const [battleId, battle] of this.battles.entries()) {
      if (!battle.isActive) {
        this.battles.delete(battleId)
      }
    }
  }

  /**
   * 开始自动战斗
   * @param {string} battleId - 战斗ID
   */
  public startAutoBattle(
    battleId: string | undefined = this.curBattleId,
  ): void {
    const curBattleData = this.getBattleData(battleId)
    if (!curBattleData) {
      this.battleLogger.warn(`战斗不存在: ${battleId}`)
      return
    }
    curBattleData.autoPlaying = true
    // 自动战斗逻辑
    const autoBattleLoop = async () => {
      const battle = this.getBattleData(battleId)
      if (!battle?.autoPlaying) {
        return
      }
      try {
        await this.processTurnInternal(battleId)
        // 检查战斗是否结束
        if (
          battle.battleState === BATTLE_STATUS.ENDED ||
          battle.battleState === BATTLE_STATUS.PAUSED
        ) {
          this.stopAutoBattle(battleId)
          return
        }
        // 继续下一回合
        const delay = this.getBattleDelay(battleId)
        const intervalId = this.rafTimer.setTimeout(autoBattleLoop, delay)
        battle.autoBattleIntervalId = intervalId
      } catch (error) {
        this.battleLogger.error('自动战斗出错:', error)
        this.stopAutoBattle(battleId)
      }
    }
    // 初始延迟
    const delay = this.getBattleDelay(battleId)
    const intervalId = this.rafTimer.setTimeout(autoBattleLoop, delay)
    curBattleData.autoBattleIntervalId = intervalId
    this.battleLogger.info(`自动战斗开始: ${this.curBattleId}`)
  }

  private getBattleDelay(battleId: string): number {
    const curBattleData = this.getBattleData(battleId)
    if (!curBattleData) {
      return 500
    }
    return (
      GameBattleSystem.AUTO_BATTLE_DELAYS[curBattleData?.battleSpeed] ?? 500
    )
  }

  /**
   * 停止自动战斗
   * @param {string} battleId - 战斗ID
   */
  public stopAutoBattle(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (!battle) {
      this.battleLogger.warn(`战斗不存在: ${battleId}`)
      return
    }

    battle.autoPlaying = false

    if (battle.autoBattleIntervalId) {
      this.rafTimer.clearTimeout(battle.autoBattleIntervalId)
      battle.autoBattleIntervalId = undefined
    }

    this.battleLogger.info(`自动战斗停止: ${battleId}`)
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
  public onTurnExecuted(battleId: string, turnNumber: number): void {
    this.battleLogger.info(`回合 ${turnNumber} 执行完成: ${battleId}`)
  }

  // 自动战斗相关方法
  /**
   * 是否激活自动战斗
   */
  public isAutoBattleActive(battleId: string): boolean {
    const battle = this.battles.get(battleId)
    return battle?.autoPlaying || false
  }

  /**
   * 获取参与者管理器实例
   */
  public getParticipantManager(): ParticipantManager {
    return this.participantManager
  }

  public getCurParticipantsInfo(): BattleParticipant[] {
    return this.curParticipantsInfo
  }

  /**
   * 获取当前战斗数据
   */
  public getCurBattleData(): BattleData | undefined {
    return this.curBattleData
  }

  public getBattleData(
    battleId: string | undefined = this.curBattleId,
  ): BattleData | undefined {
    return this.battles.get(battleId)
  }

  public setBattleSpeed(battleId: string, speed: number): void {
    const battle = this.battles.get(battleId)
    if (battle) {
      battle.battleSpeed = speed
    }
    this.curBattleData.battleSpeed = speed
  }

  /**
   * 事件系统方法
   */
  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  public off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => callback(data))
    }
  }

  /**
   * 同步战斗日志到外部系统
   */
  private syncBattleLog(battleId: string, logEntry: BattleLogEntry): void {
    this.battleLogger.info('syncBattleLog called', { battleId, logEntry })
    this.emit('battleLog', { battleId, log: logEntry })
  }

  /**
   * 同步战斗状态更新
   */
  private syncBattleStateUpdate(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (battle) {
      this.emit('battleStateUpdate', {
        battleId,
        participants: Array.from(battle.participants.values()).map((p) => ({
          id: p.id,
          name: p.name,
          currentHp: p.getAttribute('HP'),
          maxHp: p.getAttribute('MAX_HP'),
          currentEnergy: p.currentEnergy,
          buffs: p.buffs,
        })),
        turnOrder: battle.turnOrder,
        currentTurn: battle.currentTurn,
        currentRound: battle.currentRound,
      })
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
    this.emit('damageAnimation', data)
  }
}
