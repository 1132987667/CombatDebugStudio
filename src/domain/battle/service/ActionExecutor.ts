/**
 * 文件: ActionExecutor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 动作执行器
 * 描述: 负责执行战斗中的各种动作，包括攻击、技能、治疗等，实现了IActionExecutor接口，处理动作的验证和执行逻辑
 * 版本: 2.0.0 - 集成触发器事件系统
 */

import {
  BattleAction,
  BattleEntity,
  ParticipantSide,
  BattleData,
  ActionTypes,
  ValidActionTypes,
} from '@/domain/battle/types'
import { PARTICIPANT_SIDE, BATTLE_CONSTANTS } from '@/domain/battle/types'
import { EFFECT_TYPES } from '@/shared/types/effect'
import { CombatRecord, createEmptyRecord } from '@/domain/battle/combat-record'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import {
  ControlType,
  type TriggerPhase,
  type TriggerEventContext,
} from '@/domain/buff/types'
import { TriggerEventBus } from '@/infrastructure/adapters/event/TriggerEventBus'

/**
 * 动作执行器类
 * 负责执行战斗中的各种动作，包括攻击、技能、治疗等
 * 实现了IActionExecutor接口，处理动作的验证和执行逻辑
 * 集成触发器事件系统，支持攻击相关事件触发
 * 推荐通过容器注入使用
 */
export class ActionExecutor {
  /** 战斗数据存储映射，以battleId为键 */
  private battles = new Map<string, BattleData>()
  /** 参与者到战斗的映射，用于通过参与者ID快速查找所属战斗 */
  private participantToBattle = new Map<string, string>()
  /** Buff系统实例（通过构造函数注入） */
  private buffSystem: BuffSystem

  /**
   * 私有构造函数
   * @param buffSystem Buff系统实例（通过构造函数注入）
   */
  constructor(buffSystem: BuffSystem) {
    this.buffSystem = buffSystem
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
      currentTurn: context.currentTurn ?? 0,
      ...context,
    }
    eventBus.emit(phase, fullContext)
  }

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

    // 检查角色是否处于控制状态
    const controlType = this.buffSystem.getHighestPriorityControlEffect(
      source.id,
    )

    if (controlType === ControlType.STUN) {
      // 眩晕状态：无法进行任何行动
      action.effects.push({
        type: EFFECT_TYPES.STATUS,
        description: `${source.name} 处于眩晕状态，无法行动`,
      })
      return
    } else if (
      controlType === ControlType.SILENCE &&
      action.type === ActionTypes.SKILL
    ) {
      // 沉默状态：无法使用技能，改为普通攻击
      action.type = ActionTypes.ATTACK
      action.damage =
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN
      action.effects.push({
        type: EFFECT_TYPES.STATUS,
        description: `${source.name} 处于沉默状态，无法使用技能，改为普通攻击`,
      })
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
    if (!ValidActionTypes.includes(action.type)) {
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
    participant: BattleEntity,
  ): Promise<void> {
    const enemies = this.getAliveParticipantsByType(
      battle,
      PARTICIPANT_SIDE.ENEMY,
    )
    const characters = this.getAliveParticipantsByType(
      battle,
      PARTICIPANT_SIDE.ALLY,
    )

    let targetId: string
    let damage: number

    if (participant.type === PARTICIPANT_SIDE.ALLY && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage =
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN
    } else if (
      participant.type === PARTICIPANT_SIDE.ENEMY &&
      characters.length > 0
    ) {
      targetId = characters[Math.floor(Math.random() * characters.length)]
      damage =
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.ENEMY_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.ENEMY_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.ENEMY_ATTACK_DAMAGE_MIN
    } else {
      return
    }

    await this.executeAction({
      id: `action_${Date.now()}`,
      type: ActionTypes.ATTACK,
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      turn: battle.currentTurn + 1,
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
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    switch (action.type) {
      case ActionTypes.ATTACK:
        this.processAttack(action, source, target)
        break
      case ActionTypes.SKILL:
        this.processSkill(action, source, target)
        break
      case ActionTypes.HEAL:
        this.processHeal(action, source, target)
        break
      default:
        battleLogManager.addDebugLog(`Unknown action type: ${action.type}`)
    }
  }

  /**
   * 处理攻击动作
   * 对目标造成伤害，计算实际伤害值并更新目标生命值
   * 集成触发器事件系统，触发攻击相关事件
   * @param action - 攻击动作对象
   * @param source - 攻击发起者
   * @param target - 攻击承受者
   */
  private processAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    if (action.damage) {
      // 触发攻击前事件
      this.emitTriggerEvent('ON_ATTACK_BEFORE', {
        sourceId: source.id,
        targetId: target.id,
        value: action.damage,
        currentTurn: action.turn,
      })

      const actualDamage = target.takeDamage(action.damage)
      action.damage = actualDamage

      // 触发攻击命中事件
      this.emitTriggerEvent('ON_ATTACK_HIT', {
        sourceId: source.id,
        targetId: target.id,
        value: actualDamage,
        currentTurn: action.turn,
      })

      // 触发受到伤害事件
      this.emitTriggerEvent('ON_DAMAGE_TAKEN', {
        sourceId: target.id,
        targetId: source.id,
        value: actualDamage,
        currentTurn: action.turn,
      })

      action.effects.push({
        type: EFFECT_TYPES.DAMAGE,
        value: actualDamage,
        description: `${source.name} 攻击 ${target.name} 造成 ${actualDamage} 伤害`,
      })

      // 触发攻击后事件
      this.emitTriggerEvent('ON_ATTACK_AFTER', {
        sourceId: source.id,
        targetId: target.id,
        value: actualDamage,
        currentTurn: action.turn,
      })

      // 检查目标是否死亡
      if (!target.isAlive()) {
        // 触发击杀事件
        this.emitTriggerEvent('ON_KILL', {
          sourceId: source.id,
          targetId: target.id,
          value: actualDamage,
          currentTurn: action.turn,
        })

        // 触发死亡事件
        this.emitTriggerEvent('ON_DEATH', {
          sourceId: target.id,
          targetId: source.id,
          value: actualDamage,
          currentTurn: action.turn,
        })
      }
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
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    if (!action.skillId) {
      battleLogManager.addDebugLog('技能动作缺少skillId')
      return
    }

    const battleId = this.participantToBattle.get(source.id)
    const battle = battleId ? this.battles.get(battleId) : null

    if (!battle) {
      battleLogManager.addDebugLog(`无法找到参与者 ${source.id} 所属的战斗`)
      action.type = ActionTypes.ATTACK
      action.damage =
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN
      action.effects.push({
        type: EFFECT_TYPES.STATUS,
        description: `找不到战斗数据，改为普通攻击`,
      })
      this.processAttack(action, source, target)
      return
    }

    try {
      if (!battle.skillManager) {
        battleLogManager.addDebugLog(`战斗数据中缺少技能管理器`)
        action.type = ActionTypes.ATTACK
        action.damage =
          Math.floor(
            Math.random() *
              (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
                BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
          ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN
        action.effects.push({
          type: EFFECT_TYPES.STATUS,
          description: `技能管理器不存在，改为普通攻击`,
        })
        this.processAttack(action, source, target)
        return
      }

      // ponytail: energy check+spend is handled by SkillManager.executeSkill()
      const record = this.createSkillRecord(action, source, target, battle)

      const skillAction = battle.skillManager.executeSkill(
        action.skillId,
        source,
        target,
        action.turn,
      )

      if (!skillAction) {
        battleLogManager.addDebugLog(`技能执行返回空: ${action.skillId}，跳过`)
        action.type = ActionTypes.ATTACK
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [{
          type: EFFECT_TYPES.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能返回空)`,
        }]
      } else {
        action.damage = skillAction.damage
        action.heal = skillAction.heal
        action.effects.push(...skillAction.effects)

        if (record) {
          this.finalizeRecord(record, action)
        }

        battleLogManager.addDebugLog(`技能执行成功: ${action.skillId}`)
      }
    } catch (error) {
      battleLogManager.addDebugLog(`技能执行失败: ${action.skillId}`, error)
      action.type = ActionTypes.ATTACK
      action.damage =
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN
      action.effects.push({
        type: EFFECT_TYPES.STATUS,
        description: `技能执行失败，改为普通攻击`,
      })
      this.processAttack(action, source, target)
    }
  }

  /**
   * 处理治疗动作
   * 为目标恢复生命值，计算实际恢复量并更新
   * 集成触发器事件系统，触发治疗相关事件
   * @param action - 治疗动作对象
   * @param source - 治疗发起者
   * @param target - 治疗承受者
   */
  private processHeal(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    if (action.heal) {
      const actualHeal = target.heal(action.heal)
      action.heal = actualHeal

      // 触发受到治疗事件
      this.emitTriggerEvent('ON_HEAL_RECEIVED', {
        sourceId: target.id,
        targetId: source.id,
        value: actualHeal,
        currentTurn: action.turn,
      })

      action.effects.push({
        type: EFFECT_TYPES.HEAL,
        value: actualHeal,
        description: `${source.name} 治疗 ${target.name} 恢复 ${actualHeal} 生命值`,
      })
    }
  }

  /**
   * 获取指定类型的存活参与者ID列表
   * 用于查找可以执行动作的有效目标
   * @param battle - 战斗数据对象
   * @param type - 参与者类型，ALLY或ENEMY
   * @returns string[] - 符合条件的参与者ID数组
   */
  private getAliveParticipantsByType(
    battle: BattleData,
    type: ParticipantSide,
  ): string[] {
    return Array.from(battle.participants.entries())
      .filter(([_, p]) => p.type === type && p.isAlive())
      .map(([id, _]) => id)
  }

  /**
   * 判断是否需要记录详细调试信息
   * 可根据配置或调试模式启用
   */
  private shouldRecordDetail(): boolean {
    return true
  }

  /**
   * 为技能执行创建记录对象
   */
  private createSkillRecord(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    battle: BattleData,
  ): CombatRecord | undefined {
    if (!this.shouldRecordDetail()) {
      return undefined
    }

    return createEmptyRecord(
      battle.battleId,
      source.id,
      source.name,
      'skill',
      target.id,
      target.name,
      battle.currentRound,
      action.skillId,
    )
  }

  /**
   * 完成记录对象的最终处理
   */
  private finalizeRecord(record: CombatRecord, action: BattleAction): void {
    record.message = this.generateRecordMessage(record, action)
    battleLogManager.addDebugLog('技能记录已生成', record)
  }

  /**
   * 生成记录的描述消息
   */
  private generateRecordMessage(
    record: CombatRecord,
    action: BattleAction,
  ): string {
    const parts: string[] = []

    if (record.damage > 0) {
      parts.push(`造成 ${record.damage} 伤害`)
    }
    if (record.heal > 0) {
      parts.push(`恢复 ${record.heal} 生命值`)
    }
    if (record.effects.length > 0) {
      const buffCount = record.effects.filter(
        (e) => e.type === 'buff' || e.type === 'debuff',
      ).length
      if (buffCount > 0) {
        parts.push(`施加 ${buffCount} 个效果`)
      }
    }

    return parts.length > 0 ? parts.join('，') : '无效果'
  }
}
