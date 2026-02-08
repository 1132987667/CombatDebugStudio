import type {
  BattleAction,
  BattleParticipant,
  BattleState,
} from '@/types/battle'
import { logger } from '@/utils/logging'
import { SkillManager } from '@/core/skill/SkillManager'

/**
 * 战斗数据接口
 * 存储战斗的基本信息，用于动作执行时的上下文获取
 */
interface BattleData {
  battleId: string
  participants: Map<string, BattleParticipant>
  turnOrder: string[]
  currentTurn: number
  isActive: boolean
}

/**
 * 动作执行器类 - 带诊断版本
 * 负责执行战斗中的各种动作
 */
export class ActionExecutor {
  private logger = logger
  private skillManager = new SkillManager()
  private battles = new Map<string, BattleData>()
  private participantToBattle = new Map<string, string>()
  private actionHistory: {
    action: BattleAction
    battleId: string
    timestamp: number
  }[] = []

  /**
   * 注册战斗数据
   */
  public registerBattle(battleId: string, battle: BattleData): void {
    const previousBattleId = this.participantToBattle.get(
      Array.from(battle.participants.keys())[0],
    )
    if (previousBattleId && previousBattleId !== battleId) {
      this.logger.warn(
        `Participant already registered to battle ${previousBattleId}, overwriting with ${battleId}`,
      )
    }

    this.battles.set(battleId, battle)
    battle.participants.forEach((participant, participantId) => {
      this.participantToBattle.set(participantId, battleId)
    })

    this.logger.info(
      `Registered battle ${battleId} with ${battle.participants.size} participants`,
    )
  }

  /**
   * 诊断参与者映射
   */
  public diagnoseParticipantMapping(sourceId: string): {
    found: boolean
    battleId: string | undefined
    participantExists: boolean
    registeredParticipants: string[]
    battleInfo: { battleId: string; participantCount: number } | null
  } {
    const battleId = this.participantToBattle.get(sourceId)
    const battle = battleId ? this.battles.get(battleId) : null

    return {
      found: !!battleId,
      battleId,
      participantExists: battle ? battle.participants.has(sourceId) : false,
      registeredParticipants: Array.from(this.participantToBattle.keys()),
      battleInfo: battle
        ? {
            battleId: battle.battleId,
            participantCount: battle.participants.size,
          }
        : null,
    }
  }

  /**
   * 执行战斗动作
   */
  public async executeAction(action: BattleAction): Promise<void> {
    const battleId = this.participantToBattle.get(action.sourceId)

    if (!battleId) {
      const diagnosis = this.diagnoseParticipantMapping(action.sourceId)
      this.logger.error(`No battle found for participant ${action.sourceId}`, {
        action,
        diagnosis,
        allRegisteredParticipants: Array.from(this.participantToBattle.keys()),
      })

      throw new Error(
        `No battle found for participant ${action.sourceId}. ` +
          `Diagnosis: found=${diagnosis.found}, battleId=${diagnosis.battleId}, ` +
          `participantExists=${diagnosis.participantExists}`,
      )
    }

    const battle = this.battles.get(battleId)
    if (!battle) {
      throw new Error(`Battle ${battleId} not found`)
    }

    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      throw new Error(
        `Invalid source or target in action. source=${!!source}, target=${!!target}`,
      )
    }

    this.processActionType(action, source, target)
    source.afterAction()

    this.actionHistory.push({ action, battleId, timestamp: Date.now() })
  }

  /**
   * 验证动作的有效性
   */
  public validateAction(action: BattleAction): boolean {
    if (!action.sourceId || !action.targetId || !action.type) {
      return false
    }
    if (!['attack', 'skill', 'heal', 'buff', 'item'].includes(action.type)) {
      return false
    }

    const battleId = this.participantToBattle.get(action.sourceId)
    if (!battleId) {
      this.logger.warn(
        `Action validation failed: participant ${action.sourceId} not registered`,
      )
      return false
    }

    return true
  }

  /**
   * 执行默认动作
   */
  public async executeDefaultAction(
    battle: BattleData,
    participant: BattleParticipant,
  ): Promise<void> {
    const enemies = this.getAliveParticipantsByType(battle, 'enemy')
    const characters = this.getAliveParticipantsByType(battle, 'character')

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

  /**
   * 移除战斗数据
   */
  public removeBattle(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (battle) {
      battle.participants.forEach((_, participantId) => {
        this.participantToBattle.delete(participantId)
      })
    }
    this.battles.delete(battleId)
    this.logger.info(`Removed battle ${battleId} and its participant mappings`)
  }

  /**
   * 获取当前状态快照
   */
  public getStatusSnapshot(): {
    battleCount: number
    participantMappingCount: number
    actionHistoryCount: number
    battles: { battleId: string; participantCount: number }[]
  } {
    return {
      battleCount: this.battles.size,
      participantMappingCount: this.participantToBattle.size,
      actionHistoryCount: this.actionHistory.length,
      battles: Array.from(this.battles.values()).map((b) => ({
        battleId: b.battleId,
        participantCount: b.participants.size,
      })),
    }
  }

  private processActionType(
    action: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    switch (action.type) {
      case 'attack':
        this.processAttack(action, source, target)
        break
      case 'skill':
        this.processSkill(action, source, target)
        break
      case 'heal':
        this.processHeal(action, source, target)
        break
      default:
        this.logger.warn(`Unknown action type: ${action.type}`)
    }
  }

  private processAttack(
    action: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    if (action.damage) {
      const actualDamage = target.takeDamage(action.damage)
      action.damage = actualDamage
      action.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 攻击 ${target.name} 造成 ${actualDamage} 伤害`,
      })
    }
  }

  private processSkill(
    action: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    if (!action.skillId) {
      this.logger.error('技能动作缺少skillId')
      return
    }

    const energyCost = this.getSkillEnergyCost(action.skillId)
    if (energyCost > 0) {
      const success = source.spendEnergy(energyCost)
      if (!success) {
        action.type = 'attack'
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects.push({
          type: 'status',
          description: `能量不足，改为普通攻击`,
        })
        this.processAttack(action, source, target)
        return
      }
    }

    try {
      const skillAction = this.skillManager.executeSkill(
        action.skillId,
        source,
        target,
      )
      action.damage = skillAction.damage
      action.heal = skillAction.heal
      action.effects.push(...skillAction.effects)
      this.logger.debug(`技能执行成功: ${action.skillId}`)
    } catch (error) {
      this.logger.error(`技能执行失败: ${action.skillId}`, error)
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects.push({
        type: 'status',
        description: `技能执行失败，改为普通攻击`,
      })
      this.processAttack(action, source, target)
    }
  }

  private processHeal(
    action: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    if (action.heal) {
      const actualHeal = target.heal(action.heal)
      action.heal = actualHeal
      action.effects.push({
        type: 'heal',
        value: actualHeal,
        description: `${source.name} 治疗 ${target.name} 恢复 ${actualHeal} 生命值`,
      })
    }
  }

  private getSkillEnergyCost(skillId: string): number {
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 100
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50
    }
    return 0
  }

  private getAliveParticipantsByType(
    battle: BattleData,
    type: 'character' | 'enemy',
  ): string[] {
    return Array.from(battle.participants.entries())
      .filter(([_, p]) => p.type === type && p.isAlive())
      .map(([id, _]) => id)
  }
}
