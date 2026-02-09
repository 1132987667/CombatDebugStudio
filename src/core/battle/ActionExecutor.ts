/**
 * 文件: ActionExecutor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 动作执行器
 * 描述: 负责执行战斗中的各种动作，包括攻击、技能、治疗等，实现了IActionExecutor接口，处理动作的验证和执行逻辑
 * 版本: 1.0.0
 */

import type {
  BattleAction,
  BattleParticipant,
  BattleState,
} from '@/types/battle'
import { SkillManager } from '@/core/skill/SkillManager'
import { logger } from '@/utils/logging'

/**
 * 战斗数据接口
 * 存储战斗的基本信息，用于动作执行时的上下文获取
 */
interface BattleData {
  /** 战斗的唯一标识符 */
  battleId: string
  /** 参与者映射表，以参与者ID为键 */
  participants: Map<string, BattleParticipant>
  /** 回合顺序数组，存储参与者ID */
  turnOrder: string[]
  /** 当前回合号 */
  currentTurn: number
  /** 战斗是否处于活跃状态 */
  isActive: boolean
}

/**
 * 动作执行器类
 * 负责执行战斗中的各种动作，包括攻击、技能、治疗等
 * 实现了IActionExecutor接口，处理动作的验证和执行逻辑
 */
export class ActionExecutor {
  /** 日志记录器实例，用于记录动作执行过程中的信息 */
  private logger = logger
  /** 战斗数据存储映射，以battleId为键 */
  private battles = new Map<string, BattleData>()
  /** 参与者到战斗的映射，用于通过参与者ID快速查找所属战斗 */
  private participantToBattle = new Map<string, string>()

  /**
   * 注册战斗数据
   * 将战斗数据添加到管理器中，并建立参与者到战斗的映射关系
   * @param battleId - 战斗的唯一标识符
   * @param battle - 战斗数据对象，包含参与者信息和回合状态
   */
  public registerBattle(battleId: string, battle: BattleData): void {
    this.battles.set(battleId, battle)
    battle.participants.forEach((_, participantId) => {
      this.participantToBattle.set(participantId, battleId)
    })
  }

  /**
   * 执行战斗动作
   * 根据动作类型处理攻击、技能或治疗，并更新参与者和动作状态
   * @param action - 要执行的战斗动作对象，包含源目标、类型和效果
   * @returns Promise<void> - 异步执行，完成后无返回值
   * @throws Error - 当找不到对应的战斗或参与者无效时抛出
   */
  public async executeAction(action: BattleAction): Promise<void> {
    const battleId = this.participantToBattle.get(action.sourceId)
    if (!battleId) {
      throw new Error(`No battle found for participant ${action.sourceId}`)
    }

    const battle = this.battles.get(battleId)
    if (!battle) {
      throw new Error(`Battle ${battleId} not found`)
    }

    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      throw new Error(`Invalid source or target in action`)
    }

    this.processActionType(action, source, target)
    source.afterAction()
  }

  /**
   * 验证动作的有效性
   * 检查动作对象是否包含必要的基本信息
   * @param action - 要验证的战斗动作对象
   * @returns boolean - 动作有效返回true，无效返回false
   */
  public validateAction(action: BattleAction): boolean {
    if (!action.sourceId || !action.targetId || !action.type) {
      return false
    }
    if (!['attack', 'skill', 'heal', 'buff', 'item'].includes(action.type)) {
      return false
    }
    return true
  }

  /**
   * 执行默认动作
   * 当AI决策失败或需要默认行为时执行，生成随机目标的普通攻击
   * @param battle - 当前战斗数据对象
   * @param participant - 执行默认动作的参与者
   * @returns Promise<void> - 异步执行，完成后无返回值
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
   * 在战斗结束时调用，清理相关的战斗和参与者映射
   * @param battleId - 要移除的战斗ID
   */
  public removeBattle(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (battle) {
      battle.participants.forEach((_, participantId) => {
        this.participantToBattle.delete(participantId)
      })
    }
    this.battles.delete(battleId)
  }

  /**
   * 根据动作类型分发处理逻辑
   * 私有方法，根据action.type调用相应的处理函数
   * @param action - 要处理的战斗动作对象
   * @param source - 动作发起者
   * @param target - 动作承受者
   */
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

  /**
   * 处理攻击动作
   * 对目标造成伤害，计算实际伤害值并更新目标生命值
   * @param action - 攻击动作对象
   * @param source - 攻击发起者
   * @param target - 攻击承受者
   */
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

  /**
   * 处理技能动作
   * 使用SkillManager处理技能执行，包括能量消耗和技能效果
   * @param action - 技能动作对象
   * @param source - 技能使用者
   * @param target - 技能目标
   */
  private processSkill(
    action: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    if (!action.skillId) {
      this.logger.error('技能动作缺少skillId')
      return
    }

    // 从映射获取战斗数据
    const battleId = this.participantToBattle.get(source.id)
    const battle = battleId ? this.battles.get(battleId) : null

    if (!battle) {
      this.logger.error(`无法找到参与者 ${source.id} 所属的战斗`)
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects.push({
        type: 'status',
        description: `找不到战斗数据，改为普通攻击`,
      })
      this.processAttack(action, source, target)
      return
    }

    // 检查能量消耗
    const energyCost = this.getSkillEnergyCost(action.skillId)
    if (energyCost > 0) {
      const success = source.spendEnergy(energyCost)
      if (!success) {
        // 能量不足，降级为普通攻击
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
      // 使用战斗中的 SkillManager 执行技能
      const skillAction = battle.skillManager.executeSkill(
        action.skillId,
        source,
        target,
      )

      // 合并技能执行结果到当前动作
      action.damage = skillAction.damage
      action.heal = skillAction.heal
      action.effects.push(...skillAction.effects)

      this.logger.debug(`技能执行成功: ${action.skillId}`)
    } catch (error) {
      this.logger.error(`技能执行失败: ${action.skillId}`, error)
      // 技能执行失败，降级为普通攻击
      action.type = 'attack'
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects.push({
        type: 'status',
        description: `技能执行失败，改为普通攻击`,
      })
      this.processAttack(action, source, target)
    }
  }

  /**
   * 处理治疗动作
   * 为目标恢复生命值，计算实际恢复量并更新
   * @param action - 治疗动作对象
   * @param source - 治疗发起者
   * @param target - 治疗承受者
   */
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

  /**
   * 获取技能的能量消耗
   * 根据技能ID判断消耗类型，大招100能量，技能50能量
   * @param skillId - 技能的唯一标识符
   * @returns number - 能量消耗值
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
   * 获取指定类型的存活参与者ID列表
   * 用于查找可以执行动作的有效目标
   * @param battle - 战斗数据对象
   * @param type - 参与者类型，'character'或'enemy'
   * @returns string[] - 符合条件的参与者ID数组
   */
  private getAliveParticipantsByType(
    battle: BattleData,
    type: 'character' | 'enemy',
  ): string[] {
    return Array.from(battle.participants.entries())
      .filter(([_, p]) => p.type === type && p.isAlive())
      .map(([id, _]) => id)
  }
}
