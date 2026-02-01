import type {
  BattleSystem as IBattleSystem,
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleEntityType,
  BattleCharacter,
  BattleEnemy,
} from '@/types/battle'
import type { Character } from '@/types/character'
import type { EnemyInstance } from '@/types/enemy'
import type { AttributeType } from '@/types/modifier'
import { logger } from '@/utils/logger'
import { BattleAIFactory, BattleAI } from '@/core/BattleAI'

interface ParticipantInfo {
  id: string
  name: string
  type: 'character' | 'enemy'
  maxHealth: number
  currentHealth: number
  maxEnergy: number
  currentEnergy: number
}

interface BattleData {
  battleId: string
  participants: Map<string, BattleParticipant>
  actions: BattleAction[]
  turnOrder: string[]
  currentTurn: number
  isActive: boolean
  startTime: number
  endTime?: number
  winner?: BattleEntityType
  aiInstances: Map<string, BattleAI> // 每个参与者的AI实例
}

abstract class BaseBattleParticipant {
  id: string
  name: string
  level: number
  currentHealth: number
  maxHealth: number
  currentEnergy: number
  maxEnergy: number
  buffs: string[]
  skills: Map<string, any> = new Map()

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

class SimpleBattleCharacter
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

class SimpleBattleEnemy extends BaseBattleParticipant implements BattleEnemy {
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

export class GameBattleSystem implements IBattleSystem {
  private static instance: GameBattleSystem
  private battles = new Map<string, BattleData>()
  private battleLogger = logger

  private constructor() {}

  public static getInstance(): GameBattleSystem {
    if (!GameBattleSystem.instance) {
      GameBattleSystem.instance = new GameBattleSystem()
    }
    return GameBattleSystem.instance
  }

  public createBattle(participantsInfo: ParticipantInfo[]): BattleState {
    const battleId = `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const participants = new Map<string, BattleParticipant>()
    const turnOrder: string[] = []

    // Create participants based on provided info
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
        turnOrder.push(participant.id)
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
        turnOrder.push(participant.id)
      }
    })

    // Simple turn order based on speed (in real implementation, would use actual speed attribute)
    turnOrder.sort(() => Math.random() - 0.5)

    const aiInstances = new Map<string, BattleAI>()

    // 为每个参与者创建AI实例
    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAI(participant.type)
      aiInstances.set(participant.id, ai)
    })

    const battleData: BattleData = {
      battleId,
      participants,
      actions: [],
      turnOrder,
      currentTurn: 0,
      isActive: true,
      startTime: Date.now(),
      winner: undefined,
      aiInstances,
    }

    this.battles.set(battleId, battleData)
    this.battleLogger.info(`Battle created: ${battleId}`, {
      participantCount: participantsInfo.length,
      characterCount: participantsInfo.filter((p) => p.type === 'character')
        .length,
      enemyCount: participantsInfo.filter((p) => p.type === 'enemy').length,
    })

    // Log initial battle state
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

    return this.convertToBattleState(battleData)
  }

  public async processTurn(battleId: string): Promise<void> {
    const battle = this.battles.get(battleId)
    if (!battle || !battle.isActive) {
      return
    }

    // 每回合开始时，所有存活的参与者获得25能量
    battle.participants.forEach((participant) => {
      if (participant.isAlive()) {
        participant.gainEnergy(25)
      }
    })

    if (battle.currentTurn >= battle.turnOrder.length) {
      battle.currentTurn = 0
    }

    const currentParticipantId = battle.turnOrder[battle.currentTurn]
    const participant = battle.participants.get(currentParticipantId)

    if (!participant || !participant.isAlive()) {
      battle.currentTurn++
      return
    }

    try {
      // 获取参与者的AI实例
      const ai = battle.aiInstances.get(participant.id)
      if (!ai) {
        // 如果没有AI实例，使用默认AI
        const defaultAi = BattleAIFactory.createAI(participant.type)
        battle.aiInstances.set(participant.id, defaultAi)
        await this.executeDefaultAction(battle, participant)
      } else {
        // 使用AI做出决策
        const battleState = this.convertToBattleState(battle)
        const action = ai.makeDecision(battleState, participant)
        // 设置action的回合号
        action.turn = battle.currentTurn + 1

        // 确保目标有效
        const target = battle.participants.get(action.targetId)
        if (target && target.isAlive()) {
          await this.executeAction(action)
        } else {
          // 目标无效，使用默认行动
          await this.executeDefaultAction(battle, participant)
        }
      }
    } catch (error) {
      logger.error('AI决策出错:', error)
      // 出错时使用默认行动
      await this.executeDefaultAction(battle, participant)
    }

    battle.currentTurn++

    // Check for battle end condition
    const aliveCharacters = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'character' && p.isAlive(),
    )
    const aliveEnemies = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'enemy' && p.isAlive(),
    )

    if (aliveCharacters.length === 0) {
      this.endBattle(battle.battleId, 'enemy')
    } else if (aliveEnemies.length === 0) {
      this.endBattle(battle.battleId, 'character')
    }
  }

  // 执行默认行动
  private async executeDefaultAction(
    battle: BattleData,
    participant: BattleParticipant,
  ): Promise<void> {
    const enemies = Array.from(battle.participants.values())
      .filter((p) => p.type === 'enemy' && p.isAlive())
      .map((p) => p.id)

    const characters = Array.from(battle.participants.values())
      .filter((p) => p.type === 'character' && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    if (participant.type === 'character' && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage = Math.floor(Math.random() * 20) + 10
    } else if (participant.type === 'enemy' && characters.length > 0) {
      targetId = characters[Math.floor(Math.random() * characters.length)]
      damage = Math.floor(Math.random() * 15) + 8
    } else {
      return
    }


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

  public async executeAction(action: BattleAction): Promise<BattleAction> {
    const battle = this.findBattleByParticipant(action.sourceId)
    if (!battle) {
      throw new Error(
        `No active battle found for participant ${action.sourceId}`,
      )
    }

    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      throw new Error(`Invalid source or target in action`)
    }

    // 处理技能执行
    if (action.type === 'skill' && action.skillId) {
      // 模拟技能能量消耗
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
          // 能量消耗成功
          action.effects.push({
            type: 'status',
            description: `消耗 ${energyCost} 能量`,
          })
        }
      }
    }

    // Apply damage or heal
    if (action.damage && action.damage > 0) {
      const actualDamage = target.takeDamage(action.damage)
      action.damage = actualDamage

      this.battleLogger.info(`Damage dealt: ${source.name} → ${target.name}`, {
        damage: actualDamage,
        targetHealth: target.currentHealth,
      })
    }

    if (action.heal && action.heal > 0) {
      const actualHeal = target.heal(action.heal)
      action.heal = actualHeal

      this.battleLogger.info(`Heal applied: ${source.name} → ${target.name}`, {
        heal: actualHeal,
        targetHealth: target.currentHealth,
      })
    }

    // Apply buff if specified
    if (action.buffId) {
      // In a real implementation, this would use the BuffSystem
      const buffInstanceId = `${target.id}_${action.buffId}_${Date.now()}`
      target.addBuff(buffInstanceId)

      action.effects.push({
        type: 'buff',
        buffId: action.buffId,
        description: `${action.buffId} applied to ${target.name}`,
      })
    }

    // 行动后处理
    source.afterAction()

    // Add action to battle log
    this.addBattleAction(battle.battleId, action)

    return action
  }

  // 获取技能能量消耗
  private getSkillEnergyCost(skillId: string): number {
    // 实现50能量释放小技能，100能量释放大招的机制
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 100 // 大招消耗100能量
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50 // 小技能消耗50能量
    }
    return 0
  }

  public getBattleState(battleId: string): BattleState | undefined {
    const battle = this.battles.get(battleId)
    if (!battle) return undefined

    return this.convertToBattleState(battle)
  }

  public endBattle(battleId: string, winner: BattleEntityType): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    battle.isActive = false
    battle.winner = winner
    battle.endTime = Date.now()

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

    this.battleLogger.info(`Battle ended: ${battleId}`, { winner })
  }

  private addBattleAction(battleId: string, action: BattleAction): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    battle.actions.push(action)

    // Keep only last 100 actions to prevent memory issues
    if (battle.actions.length > 100) {
      battle.actions = battle.actions.slice(-100)
    }
  }

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

  // Additional helper methods for UI integration
  public getAllBattles(): BattleState[] {
    return Array.from(this.battles.values()).map((b) =>
      this.convertToBattleState(b),
    )
  }

  public getActiveBattles(): BattleState[] {
    return Array.from(this.battles.values())
      .filter((b) => b.isActive)
      .map((b) => this.convertToBattleState(b))
  }

  public clearCompletedBattles(): void {
    for (const [battleId, battle] of this.battles.entries()) {
      if (!battle.isActive) {
        this.battles.delete(battleId)
      }
    }
  }
}
