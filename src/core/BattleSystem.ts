import type {
  BattleSystem as IBattleSystem,
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleEntityType,
  BattleCharacter,
  BattleEnemy,
  ParticipantInfo,
} from '@/types/battle'
import type { Character } from '@/types/character'
import type { EnemyInstance } from '@/types/enemy'
import type { AttributeType } from '@/types/modifier'
import { logger } from '@/utils/logger'
import { BattleAIFactory, BattleAI } from '@/core/BattleAI'
import { container } from './di/Container'
import { TurnManager } from './battle/TurnManager'
import { TURN_MANAGER_TOKEN } from './battle/interfaces'

/**
 * 战斗数据接口
 * 描述战斗的完整状态和数据
 */
interface BattleData {
  /** 战斗唯一标识符 */
  battleId: string
  /** 参与者映射，以参与者ID为键 */
  participants: Map<string, BattleParticipant>
  /** 战斗行动记录 */
  actions: BattleAction[]
  /** 回合顺序，按参与者ID排序 */
  turnOrder: string[]
  /** 当前回合索引 */
  currentTurn: number
  /** 战斗是否活跃 */
  isActive: boolean
  /** 战斗开始时间戳 */
  startTime: number
  /** 战斗结束时间戳（可选） */
  endTime?: number
  /** 战斗胜利者（可选） */
  winner?: BattleEntityType
  /** 每个参与者的AI实例映射 */
  aiInstances: Map<string, BattleAI>
}

/**
 * 基础战斗参与者抽象类
 * 为所有战斗参与者提供通用的属性和方法
 * 是角色和敌人的基类
 */
abstract class BaseBattleParticipant {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 参与者等级 */
  level: number
  /** 当前生命值 */
  currentHealth: number
  /** 最大生命值 */
  maxHealth: number
  /** 当前能量值 */
  currentEnergy: number
  /** 最大能量值 */
  maxEnergy: number
  /**  buff实例ID列表 */
  buffs: string[]
  /** 技能集合，以技能ID为键 */
  skills: Map<string, any> = new Map()

  /**
   * 构造函数
   * @param data 参与者初始化数据
   */
  constructor(data: {
    id: string
    name: string
    level: number
    currentHealth: number
    maxHealth: number
    currentEnergy?: number
    maxEnergy?: number
    buffs?: string[]
    skills?: any[]
  }) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.currentHealth = data.currentHealth
    this.maxHealth = data.maxHealth
    this.currentEnergy = data.currentEnergy || 0
    this.maxEnergy = data.maxEnergy || 150
    this.buffs = data.buffs || []

    // 初始化技能
    if (data.skills) {
      data.skills.forEach((skill) => {
        this.skills.set(skill.id, skill)
      })
    }
  }

  /**
   * 获取参与者类型
   * 子类必须实现此方法
   */
  abstract get type(): BattleEntityType

  getAttribute(attribute: string): number {
    // Simplified attribute system - in real implementation, this would use the actual attribute system
    switch (attribute) {
      case 'HP':
        return this.currentHealth
      case 'MAX_HP':
        return this.maxHealth
      case 'ATK':
        return this.level * 5 // Simplified attack calculation
      case 'DEF':
        return this.level * 2 // Simplified defense calculation
      case 'energy':
        return this.currentEnergy
      case 'max_energy':
        return this.maxEnergy
      default:
        return 0
    }
  }

  setAttribute(attribute: string, value: number): void {
    if (attribute === 'HP') {
      this.currentHealth = Math.max(0, Math.min(value, this.maxHealth))
    } else if (attribute === 'energy') {
      this.currentEnergy = Math.max(0, Math.min(value, this.maxEnergy))
    }
    // Other attributes would be handled in a real implementation
  }

  addBuff(buffInstanceId: string): void {
    if (!this.buffs.includes(buffInstanceId)) {
      this.buffs.push(buffInstanceId)
    }
  }

  removeBuff(buffInstanceId: string): void {
    this.buffs = this.buffs.filter((id) => id !== buffInstanceId)
  }

  hasBuff(buffId: string): boolean {
    return this.buffs.some((id) => id.includes(buffId))
  }

  takeDamage(amount: number): number {
    const damage = Math.max(0, amount)
    this.currentHealth = Math.max(0, this.currentHealth - damage)
    // 受到攻击获得15能量
    this.gainEnergy(15)
    return damage
  }

  heal(amount: number): number {
    const healAmount = Math.max(0, amount)
    const originalHealth = this.currentHealth
    this.currentHealth = Math.min(
      this.currentHealth + healAmount,
      this.maxHealth,
    )
    return this.currentHealth - originalHealth
  }

  gainEnergy(amount: number): void {
    this.currentEnergy = Math.min(this.currentEnergy + amount, this.maxEnergy)
  }

  spendEnergy(amount: number): boolean {
    if (this.currentEnergy >= amount) {
      this.currentEnergy -= amount
      return true
    }
    return false
  }

  isAlive(): boolean {
    return this.currentHealth > 0
  }

  // 技能管理
  addSkill(skill: any): void {
    this.skills.set(skill.id, skill)
  }

  getSkill(skillId: string): any {
    return this.skills.get(skillId)
  }

  getSkills(): any[] {
    return Array.from(this.skills.values())
  }

  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId)
  }

  // 行动后处理
  afterAction(): void {
    // 每次行动后获得能量
    this.gainEnergy(10)
  }

  // 检查是否满血
  isFullHealth(): boolean {
    return this.currentHealth >= this.maxHealth
  }

  // 检查是否需要治疗
  needsHealing(): boolean {
    return this.currentHealth / this.maxHealth < 0.5
  }
}

export class SimpleBattleCharacter
  extends BaseBattleParticipant
  implements BattleCharacter
{
  type = 'character' as const
  character: Character

  constructor(data: {
    id: string
    name: string
    level: number
    currentHealth: number
    maxHealth: number
    buffs?: string[]
    character?: Character
  }) {
    super(data)
    this.character = data.character || this.createDefaultCharacter(data)
  }

  private createDefaultCharacter(data: {
    id: string
    name: string
    level: number
  }): Character {
    const attributes: Record<AttributeType, number> = {
      HP: data.level * 10,
      MP: data.level * 5,
      ATK: data.level * 2,
      DEF: data.level,
      SPD: data.level,
      CRIT_RATE: 0.05,
      CRIT_DMG: 1.5,
      ACCURACY: 0.9,
      EVADE: 0.1,
      LIFESTEAL: 0,
      REGENERATION: 0,
      MANA_REGEN: 0,
      DAMAGE_BOOST: 0,
      DAMAGE_REDUCE: 0,
    }

    const buffs: string[] = []

    return {
      id: data.id,
      name: data.name,
      level: data.level,
      attributes,
      buffs,
      getAttribute: (attribute: AttributeType) => attributes[attribute] || 0,
      setAttribute: (attribute: AttributeType, value: number) => {
        attributes[attribute] = value
      },
      addBuff: (buffInstanceId: string) => {
        if (!buffs.includes(buffInstanceId)) {
          buffs.push(buffInstanceId)
        }
      },
      removeBuff: (buffInstanceId: string) => {
        const index = buffs.indexOf(buffInstanceId)
        if (index !== -1) {
          buffs.splice(index, 1)
        }
      },
      hasBuff: (buffId: string) => buffs.some((id) => id.includes(buffId)),
    }
  }
}

export class SimpleBattleEnemy
  extends BaseBattleParticipant
  implements BattleEnemy
{
  type = 'enemy' as const
  enemy: EnemyInstance

  constructor(data: {
    id: string
    name: string
    level: number
    currentHealth: number
    maxHealth: number
    buffs?: string[]
    enemy?: EnemyInstance
  }) {
    super(data)
    this.enemy = data.enemy || this.createDefaultEnemy(data)
  }

  private createDefaultEnemy(data: {
    id: string
    name: string
    level: number
    currentHealth: number
    maxHealth: number
  }): EnemyInstance {
    const stats = {
      health: data.maxHealth,
      minAttack: data.level * 2,
      maxAttack: data.level * 4,
      defense: data.level,
      speed: data.level * 2,
    }

    const buffs: string[] = []
    const activeSkills = new Set<string>()
    let enemyCurrentHealth = data.currentHealth
    const enemyMaxHealth = data.maxHealth

    return {
      id: data.id,
      name: data.name,
      level: data.level,
      stats,
      drops: [],
      skills: {},
      get currentHealth() {
        return enemyCurrentHealth
      },
      set currentHealth(value: number) {
        enemyCurrentHealth = Math.max(0, Math.min(value, enemyMaxHealth))
      },
      buffs,
      activeSkills,
      lastActionTime: Date.now(),
      get isDefeated() {
        return enemyCurrentHealth <= 0
      },
      getAttribute: (attribute: string) => {
        switch (attribute) {
          case 'HP':
            return enemyCurrentHealth
          case 'MAX_HP':
            return enemyMaxHealth
          case 'ATK':
            return stats.minAttack + (stats.maxAttack - stats.minAttack) / 2
          case 'DEF':
            return stats.defense
          case 'SPD':
            return stats.speed
          default:
            return 0
        }
      },
      setAttribute: (attribute: string, value: number) => {
        if (attribute === 'HP') {
          enemyCurrentHealth = Math.max(0, Math.min(value, enemyMaxHealth))
        }
      },
      addBuff: (buffInstanceId: string) => {
        if (!buffs.includes(buffInstanceId)) {
          buffs.push(buffInstanceId)
        }
      },
      removeBuff: (buffInstanceId: string) => {
        const index = buffs.indexOf(buffInstanceId)
        if (index !== -1) {
          buffs.splice(index, 1)
        }
      },
      hasBuff: (buffId: string) => buffs.some((id) => id.includes(buffId)),
    }
  }
}

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

  // 战斗日志记录器实例
  private battleLogger = logger

  // 私有构造函数，防止外部直接实例化
  private constructor() {}

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
   * @param {ParticipantInfo[]} participantsInfo - 参与者信息数组
   * @returns {BattleState} 创建的战斗状态
   */
  public createBattle(participantsInfo: ParticipantInfo[]): BattleState {
    console.log('participantsInfo', participantsInfo)

    const battleId = `battle_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const participants = new Map<string, BattleParticipant>()

    participantsInfo.forEach((info) => {
      if (info.type === 'character') {
        const participant = new SimpleBattleCharacter({
          id: `character_${info.id}`,
          name: info.name,
          level: 5,
          currentHealth: info.currentHealth,
          maxHealth: info.maxHealth,
          buffs: [],
        })
        participant.currentEnergy = info.currentEnergy
        participant.maxEnergy = info.maxEnergy
        participants.set(participant.id, participant)
      } else if (info.type === 'enemy') {
        const participant = new SimpleBattleEnemy({
          id: `enemy_${info.id}`,
          name: info.name,
          level: 5,
          currentHealth: info.currentHealth,
          maxHealth: info.maxHealth,
          buffs: [],
        })
        participant.currentEnergy = info.currentEnergy
        participant.maxEnergy = info.maxEnergy
        participants.set(participant.id, participant)
      }
    })

    const turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )
    const participantArray = Array.from(participants.values())
    const turnOrder = turnManager.createTurnOrder(participantArray)
    turnManager.initializeBattle(battleId, turnOrder)

    // AI实例映射表，为每个参与者创建对应的AI实例
    const aiInstances = new Map<string, BattleAI>()

    // 为每个参与者创建AI实例
    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAI(participant.type)
      aiInstances.set(participant.id, ai)
    })

    // 构建战斗数据对象
    const battleData: BattleData = {
      battleId,
      participants,
      actions: [], // 战斗动作记录
      turnOrder,
      currentTurn: 0, // 当前回合索引
      isActive: true, // 战斗是否活跃
      startTime: Date.now(), // 战斗开始时间
      winner: undefined, // 胜利者（未确定）
      aiInstances,
    }

    // 将战斗数据存入映射表
    this.battles.set(battleId, battleData)

    // 记录战斗创建日志
    this.battleLogger.info(`Battle created: ${battleId}`, {
      participantCount: participantsInfo.length,
      characterCount: participantsInfo.filter((p) => p.type === 'character')
        .length,
      enemyCount: participantsInfo.filter((p) => p.type === 'enemy').length,
    })

    // 添加战斗开始的系统动作
    this.addBattleAction(battleId, {
      id: `init_${Date.now()}`,
      type: 'attack',
      sourceId: 'system',
      targetId: 'system',
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: 'status',
          description: `战斗开始！参战角色: ${participantsInfo.filter((p) => p.type === 'character').length} 人，参战敌人: ${participantsInfo.filter((p) => p.type === 'enemy').length} 人`,
          duration: 0,
        },
      ],
    })

    // 返回战斗状态
    return this.convertToBattleState(battleData)
  }

  /**
   * 内部方法：处理战斗回合的核心逻辑
   * 用于自动战斗和手动战斗
   * @param {string} battleId - 战斗ID
   */
  private async processTurnInternal(battleId: string): Promise<void> {
    const battle = this.battles.get(battleId)
    if (!battle || !battle.isActive) {
      return
    }

    const turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )

    battle.participants.forEach((participant) => {
      if (participant.isAlive()) {
        participant.gainEnergy(25)
      }
    })

    const currentParticipantId = turnManager.calculateNextTurn(battleId)
    if (!currentParticipantId) {
      return
    }

    battle.currentTurn = turnManager.getCurrentTurn(battleId)

    const participant = battle.participants.get(currentParticipantId)
    if (!participant || !participant.isAlive()) {
      return
    }

    try {
      const ai = battle.aiInstances.get(participant.id)
      if (!ai) {
        const defaultAi = BattleAIFactory.createAI(participant.type)
        battle.aiInstances.set(participant.id, defaultAi)
        await this.executeDefaultAction(battle, participant)
      } else {
        const battleState = this.convertToBattleState(battle)
        const action = ai.makeDecision(battleState, participant)
        action.turn = battle.currentTurn + 1

        const target = battle.participants.get(action.targetId)
        if (target && target.isAlive()) {
          await this.executeAction(action)
        } else {
          await this.executeDefaultAction(battle, participant)
        }
      }
    } catch (error) {
      logger.error('AI决策出错:', error)
      await this.executeDefaultAction(battle, participant)
    }

    const aliveCharacters = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'character' && p.isAlive(),
    )
    const aliveEnemies = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'enemy' && p.isAlive(),
    )

    if (aliveCharacters.length === 0) {
      this.endBattle(battle.battleId, 'enemy')
      turnManager.removeBattle(battleId)
    } else if (aliveEnemies.length === 0) {
      this.endBattle(battle.battleId, 'character')
      turnManager.removeBattle(battleId)
    }
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
    const autoState = this.autoBattleStates.get(battleId)
    if (autoState?.isActive) {
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
      .filter((p) => p.type === 'enemy' && p.isAlive())
      .map((p) => p.id)

    const characters = Array.from(battle.participants.values())
      .filter((p) => p.type === 'character' && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    // 根据参与者类型选择目标
    if (participant.type === 'character' && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage = Math.floor(Math.random() * 20) + 10 // 10-30伤害
    } else if (participant.type === 'enemy' && characters.length > 0) {
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
      turn: battle.currentTurn + 1,
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
      // 计算技能能量消耗
      const energyCost = this.getSkillEnergyCost(action.skillId)
      if (energyCost > 0) {
        const success = source.spendEnergy(energyCost)
        if (!success) {
          // 能量不足，改为普通攻击
          action.type = 'attack'
          action.damage = Math.floor(Math.random() * 20) + 10
          action.effects = [
            {
              type: 'damage',
              value: action.damage,
              description: `${source.name} 普通攻击 (能量不足)`,
            },
          ]
        } else {
          // 能量消耗成功，添加效果描述
          action.effects.push({
            type: 'status',
            description: `消耗 ${energyCost} 能量`,
          })
        }
      }
    }

    // 应用伤害
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

    // 应用增益效果（如果指定）
    if (action.buffId) {
      // 实际实现中会使用BuffSystem
      const buffInstanceId = `${target.id}_${action.buffId}_${Date.now()}`
      target.addBuff(buffInstanceId)

      action.effects.push({
        type: 'buff',
        buffId: action.buffId,
        description: `${action.buffId} applied to ${target.name}`,
      })
    }

    // 行动后处理（如减少状态持续时间等）
    source.afterAction()

    // 将动作添加到战斗日志
    this.addBattleAction(battle.battleId, action)

    return action
  }

  /**
   * 获取技能能量消耗
   * @param {string} skillId - 技能ID
   * @returns {number} 能量消耗值
   */
  private getSkillEnergyCost(skillId: string): number {
    // 实现50能量释放小技能，100能量释放大招的机制
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 100 // 大招消耗100能量
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50 // 小技能消耗50能量
    }
    return 0
  }

  /**
   * 获取战斗状态
   * @param {string} battleId - 战斗ID
   * @returns {BattleState | undefined} 战斗状态，如果不存在则返回undefined
   */
  public getBattleState(battleId: string): BattleState | undefined {
    const battle = this.battles.get(battleId)
    if (!battle) return undefined

    return this.convertToBattleState(battle)
  }

  /**
   * 结束战斗
   * @param {string} battleId - 战斗ID
   * @param {BattleEntityType} winner - 胜利者类型
   */
  public endBattle(battleId: string, winner: BattleEntityType): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    // 设置战斗为非活跃状态
    battle.isActive = false
    battle.winner = winner
    battle.endTime = Date.now()

    // 添加战斗结束的系统动作
    this.addBattleAction(battleId, {
      id: `end_${Date.now()}`,
      type: 'skill',
      sourceId: 'system',
      targetId: 'system',
      success: true,
      timestamp: Date.now(),
      turn: battle.currentTurn + 1,
      effects: [
        {
          type: 'status',
          description: `战斗结束！胜利者: ${winner === 'character' ? '角色方' : '敌方'}`,
          duration: 0,
        },
      ],
    })

    // 停止自动战斗
    this.stopAutoBattle(battleId)
    this.battleLogger.info(`Battle ended: ${battleId}`, { winner })
  }

  /**
   * 添加战斗动作到日志
   * @param {string} battleId - 战斗ID
   * @param {BattleAction} action - 战斗动作
   */
  private addBattleAction(battleId: string, action: BattleAction): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    // 添加动作到动作记录
    battle.actions.push(action)

    // 只保留最近100个动作，防止内存问题
    if (battle.actions.length > 100) {
      battle.actions = battle.actions.slice(-100)
    }
  }

  /**
   * 通过参与者ID查找战斗
   * @param {string} participantId - 参与者ID
   * @returns {BattleData | undefined} 战斗数据，如果不存在则返回undefined
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
   * 转换战斗数据为战斗状态
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
      isActive: battleData.isActive,
      startTime: battleData.startTime,
      endTime: battleData.endTime,
      winner: battleData.winner,
    }
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
   * 获取所有活跃战斗状态
   * @returns {BattleState[]} 活跃战斗状态数组
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
   * 自动战斗状态管理
   * 存储每个战斗的自动战斗状态
   */
  private autoBattleStates = new Map<
    string,
    {
      isActive: boolean
      intervalId: number | null
      speed: number
      errorCount: number
      consecutiveFailures: number
    }
  >()

  /**
   * 开始自动战斗
   * 支持异常重试和状态恢复
   * @param battleId - 战斗ID
   * @param speed - 自动播放速度（每秒回合数）
   */
  public startAutoBattle(battleId: string, speed: number): void {
    const battle = this.battles.get(battleId)
    if (!battle) {
      this.battleLogger.warn(`战斗 ${battleId} 不存在，无法开始自动战斗`)
      return
    }

    const existingState = this.autoBattleStates.get(battleId)
    if (existingState?.isActive) {
      this.battleLogger.warn(`战斗 ${battleId} 已经在进行自动战斗`)
      return
    }

    if (existingState && existingState.intervalId !== null) {
      clearInterval(existingState.intervalId)
    }

    const safeSpeed = Math.max(0.5, Math.min(speed, 5))
    const intervalMs = Math.floor(1000 / safeSpeed)

    const intervalId = setInterval(() => {
      this.executeAutoBattleTurn(battleId)
    }, intervalMs)

    this.autoBattleStates.set(battleId, {
      isActive: true,
      intervalId: intervalId as unknown as number,
      speed: safeSpeed,
      errorCount: 0,
      consecutiveFailures: 0,
    })

    this.battleLogger.info(`战斗 ${battleId} 开始自动播放，速度: ${safeSpeed}x`)
  }

  /**
   * 回合执行回调类型
   */
  public onTurnExecuted: ((battleId: string) => void) | null = null

  /**
   * 执行自动战斗回合
   * 包含异常处理和状态恢复
   * @param battleId - 战斗ID
   */
  private executeAutoBattleTurn(battleId: string): void {
    const battle = this.battles.get(battleId)
    const autoState = this.autoBattleStates.get(battleId)

    if (!battle || !autoState || !autoState.isActive || !battle.isActive) {
      this.stopAutoBattle(battleId)
      return
    }

    try {
      this.processTurnInternal(battleId)
      autoState.consecutiveFailures = 0

      if (this.onTurnExecuted) {
        this.onTurnExecuted(battleId)
      }
    } catch (error) {
      autoState.errorCount++
      autoState.consecutiveFailures++
      this.battleLogger.error(`自动战斗回合执行错误:`, error)

      if (autoState.consecutiveFailures >= 5) {
        this.battleLogger.warn(`自动战斗连续失败5次，暂停自动战斗`)
        this.stopAutoBattle(battleId)
      }
    }
  }

  /**
   * 停止自动战斗
   * @param {string} battleId - 战斗ID
   */
  public stopAutoBattle(battleId: string): void {
    const autoState = this.autoBattleStates.get(battleId)
    if (!autoState) {
      return
    }

    // 清除定时器
    if (autoState.intervalId !== null) {
      clearInterval(autoState.intervalId)
    }

    // 更新状态
    autoState.isActive = false
    autoState.intervalId = null

    this.battleLogger.info(`战斗 ${battleId} 停止自动播放`)
  }

  /**
   * 检查战斗是否正在进行自动战斗
   * @param {string} battleId - 战斗ID
   * @returns {boolean} 是否正在自动战斗
   */
  public isAutoBattleActive(battleId: string): boolean {
    const autoState = this.autoBattleStates.get(battleId)
    return autoState?.isActive || false
  }

  /**
   * 设置自动战斗速度
   * @param {string} battleId - 战斗ID
   * @param {number} speed - 播放速度
   */
  public setAutoBattleSpeed(battleId: string, speed: number): void {
    const autoState = this.autoBattleStates.get(battleId)
    if (!autoState) {
      this.battleLogger.warn(`战斗 ${battleId} 不存在，无法设置自动战斗速度`)
      return
    }

    const wasActive = autoState.isActive
    const oldSpeed = autoState.speed

    // 如果当前有定时器，先清除
    if (wasActive && autoState.intervalId !== null) {
      clearInterval(autoState.intervalId)
    }

    // 更新速度
    autoState.speed = speed

    // 如果之前是激活状态，重新创建定时器
    if (wasActive) {
      const intervalId = setInterval(() => {
        const currentBattle = this.battles.get(battleId)
        const currentAutoState = this.autoBattleStates.get(battleId)

        // 检查状态有效性
        if (
          !currentBattle ||
          !currentAutoState ||
          !currentAutoState.isActive ||
          !currentBattle.isActive
        ) {
          this.stopAutoBattle(battleId)
          return
        }

        // 执行回合逻辑
        this.processTurnInternal(battleId).catch((error) => {
          this.battleLogger.error(`自动战斗时出错:`, error)
          this.stopAutoBattle(battleId)
        })
      }, 1000 / speed)

      autoState.intervalId = intervalId as unknown as number
      this.battleLogger.info(
        `战斗 ${battleId} 自动播放速度从 ${oldSpeed}x 更新为: ${speed}x`,
      )
    } else {
      // 如果未激活，只更新速度值
      autoState.speed = speed
    }
  }
}
