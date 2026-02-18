/**
 * 文件: PassiveSkillManager.ts
 * 创建日期: 2026-02-17
 * 作者: CombatDebugStudio
 * 功能: 被动技能管理器
 * 描述: 管理被动技能的触发时机和效果执行
 * 版本: 1.0.0
 */

import type { BattleParticipant } from '@/types/battle'
import { SkillManager } from '@/core/skill/SkillManager'
import { BuffSystem } from '@/core/BuffSystem'

/**
 * 被动技能触发时机枚举
 */
export enum PassiveSkillTrigger {
  /** 战斗开始时触发 */
  BATTLE_START = 'battle_start',
  /** 受击时触发 */
  ON_HIT = 'on_hit',
  /** 回合开始时触发 */
  TURN_START = 'turn_start',
  /** 回合结束时触发 */
  TURN_END = 'turn_end',
  /** 攻击前触发 */
  BEFORE_ATTACK = 'before_attack',
  /** 攻击后触发 */
  AFTER_ATTACK = 'after_attack',
  /** 死亡时触发 */
  ON_DEATH = 'on_death'
}

/**
 * 被动技能管理器类
 * 负责管理被动技能的触发时机和效果执行
 */
export class PassiveSkillManager {
  private static instance: PassiveSkillManager
  private skillManager: SkillManager
  private buffSystem: BuffSystem

  /**
   * 私有构造函数，防止外部实例化
   */
  private constructor() {
    this.skillManager = SkillManager.getInstance()
    this.buffSystem = BuffSystem.getInstance()
  }

  /**
   * 获取单例实例
   * @returns PassiveSkillManager实例
   */
  public static getInstance(): PassiveSkillManager {
    if (!PassiveSkillManager.instance) {
      PassiveSkillManager.instance = new PassiveSkillManager()
    }
    return PassiveSkillManager.instance
  }

  /**
   * 触发指定时机的被动技能
   * @param trigger 触发时机
   * @param participant 参与者
   * @param context 上下文信息
   */
  public triggerPassiveSkills(
    trigger: PassiveSkillTrigger,
    participant: BattleParticipant,
    context: any = {}
  ): void {
    if (!participant.isAlive() && trigger !== PassiveSkillTrigger.ON_DEATH) {
      return
    }

    const skills = participant.getSkills()
    if (!skills) return

    for (const skillId of skills) {
      try {
        const skillConfig = this.skillManager.getSkillConfig(skillId)
        if (!skillConfig || skillConfig.type !== 'passive') {
          continue
        }

        // 检查技能是否配置了当前触发时机
        const triggerTimes = skillConfig.triggerTimes || [PassiveSkillTrigger.BATTLE_START]
        if (!triggerTimes.includes(trigger)) {
          continue
        }

        // 执行被动技能效果
        this.executePassiveSkill(skillConfig, participant, context)
      } catch (error) {
        console.error(`触发被动技能失败[${participant.name} - ${skillId}]:`, error)
      }
    }
  }

  /**
   * 执行被动技能效果
   * @param skillConfig 技能配置
   * @param participant 参与者
   * @param context 上下文信息
   */
  private executePassiveSkill(
    skillConfig: any,
    participant: BattleParticipant,
    context: any
  ): void {
    if (skillConfig.steps) {
      for (const step of skillConfig.steps) {
        if (step.type === 'buff' && step.buffId) {
          this.buffSystem.addBuff(participant.id, step.buffId, {
            id: step.buffId,
            name: skillConfig.name,
            duration: step.duration || -1,
            description: skillConfig.description,
            sourceId: participant.id
          })
          console.log(`被动技能生效[${participant.name}]: ${skillConfig.name}`)
        }
        // 可以根据需要扩展其他类型的效果
      }
    }
  }

  /**
   * 批量触发多个参与者的被动技能
   * @param trigger 触发时机
   * @param participants 参与者映射
   * @param context 上下文信息
   */
  public triggerPassiveSkillsForAll(
    trigger: PassiveSkillTrigger,
    participants: Map<string, BattleParticipant>,
    context: any = {}
  ): void {
    for (const participant of participants.values()) {
      this.triggerPassiveSkills(trigger, participant, context)
    }
  }
}
