import { BattleEntity, BattleTriggerPhase, PARTICIPANT_SIDE } from '@/domain/battle/types'
import { BATTLE_CONSTANTS } from '@/domain/battle/types'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType } from '@/domain/buff/types'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { BATTLE_LOG_CATEGORIES, buildNameSegments } from '@/shared/types/battle-log'

export interface PassiveSkillConfig {
  id: string
  name: string
  description: string
  trigger?: BattleTriggerPhase
  condition?: string
  skillId: string
  cooldown: number
  lastTriggeredTurn?: number
  triggerCount?: number
  maxTriggerCount?: number
  // 触发概率
  triggerProbability?: number
  hpThreshold?: number
}

export interface PassiveTriggerContext {
  currentTurn?: number;
  sourceId?: string;
  damage?: number;
  targetId?: string;
  roundNumber?: number;
  cause?: string;
  isCritical?: boolean;
}

export class PassiveSkillManager {
  private passives: Map<string, PassiveSkillConfig[]> = new Map()
  private skillManager: SkillManager
  private buffSystem: BuffSystem

  constructor(skillManager: SkillManager, buffSystem: BuffSystem) {
    this.skillManager = skillManager
    this.buffSystem = buffSystem
  }

  /** Factory method for compatibility with DI Container */
  static create(
    skillManager: SkillManager,
    buffSystem: BuffSystem,
  ): PassiveSkillManager {
    return new PassiveSkillManager(skillManager, buffSystem)
  }

  registerPassive(characterId: string, config: PassiveSkillConfig): void {
    const list = this.passives.get(characterId) || []
    list.push(config)
    this.passives.set(characterId, list)
  }

  /**
   * 触发被动技能
   */
  triggerPassives(
    trigger: BattleTriggerPhase,
    entity: BattleEntity,
    target?: BattleEntity,
    context?: PassiveTriggerContext,
  ): void {
    const characterPassives = this.passives.get(entity.id)
    if (!characterPassives) return

    for (const config of characterPassives) {
      // 检查触发时机是否匹配
      if (config.trigger !== trigger) continue
      // 检查冷却时间是否到，config.cooldown = -1 表示无冷却
      if (config.cooldown > 0 && config.lastTriggeredTurn) {
        const currentTurn = (context?.currentTurn as number) || 0
        if (currentTurn - config.lastTriggeredTurn < config.cooldown) continue
      }
      // 检查最大触发次数是否超过
      if (
        config.maxTriggerCount &&
        config.triggerCount &&
        config.triggerCount >= config.maxTriggerCount
      )
        continue
      // 检查触发概率是否命中
      if (
        config.triggerProbability &&
        Math.random() > config.triggerProbability
      )
        continue
      if (
        config.trigger === BattleTriggerPhase.HP_LOWER_THAN &&
        config.hpThreshold
      ) {
        const hpPercent =
          entity.getAttribute('currentHealth') /
          Math.max(1, entity.getAttribute('maxHealth'))
        if (hpPercent > config.hpThreshold / 100) continue
      }
      // 被动有触发条件，检查是否满足
      if (
        config.condition &&
        !this.evaluateCondition(config.condition, entity, target, context)
      )
        continue
      // 执行被动技能
      this.skillManager.executeSkill(
        config.skillId,
        entity,
        target!,
        (context?.currentTurn as number) || 0,
      )
      // ponytail: 被动触发日志 — 带角色名着色
      const targetName = target?.name || '自身'
      const targetEntity = target
      const segs = buildNameSegments(
        entity.name,
        entity.type === PARTICIPANT_SIDE.ALLY,
        targetName,
        targetEntity ? targetEntity.type === PARTICIPANT_SIDE.ALLY : undefined,
      )
      segs.push({ text: ` 触发 ${config.name}，对 ${targetName} 生效` })
      const entityPrefix = entity.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'
      const targetEntityPrefix = targetEntity ? (targetEntity.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]') : ''
      battleLogManager.addBattleLog({
        turn: (context?.currentTurn as number) || 1,
        message: `${entityPrefix}${entity.name} 触发 ${config.name}，对 ${targetEntityPrefix}${targetName} 生效`,
        segments: segs,
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
      config.lastTriggeredTurn = (context?.currentTurn as number) || 0
      config.triggerCount = (config.triggerCount || 0) + 1
    }
  }

  private evaluateCondition(
    condition: string,
    source: BattleEntity,
    target?: BattleEntity,
    context?: Record<string, any>,
  ): boolean {
    try {
      switch (condition) {
        case 'target_has_buff':
          return target ? target.getBuffInstanceIds().length > 0 : false
        case 'source_has_buff':
          return source.getBuffInstanceIds().length > 0
        case 'target_low_hp':
          return target
            ? target.getAttribute('currentHealth') /
                Math.max(1, target.getAttribute('maxHealth')) <
                BATTLE_CONSTANTS.HEAL_THRESHOLD
            : false
        // 守护者被动技能专用条件
        case 'target_has_poison':
          return target
            ? target.hasBuff('buff_poison') ||
                target.hasBuff('buff_strong_poison')
            : false
        case 'target_has_stun':
          return target ? target.hasBuff('buff_stun') : false
        case 'target_has_burn':
          return target ? target.hasBuff('buff_burn') : false
        case 'target_has_sleep':
          // ponytail: 睡眠 buff ID 待确认，当前用 hasBuff 通配检查
          return target
            ? target.getBuffInstanceIds().some((id) => id.includes('sleep'))
            : false
        case 'source_has_debuff_count_3':
          return source.getBuffInstanceIds().length >= 3
        case 'source_energy_high':
          return (
            source.getAttribute('currentEnergy') /
              Math.max(1, source.getAttribute('maxEnergy')) >
            0.9
          )
        case 'source_turn_gt_5':
          return (context?.currentTurn as number) > 5
        case 'source_turn_mod_5':
          return (
            (context?.currentTurn as number) % 5 === 0 &&
            (context?.currentTurn as number) > 0
          )
        default:
          return true
      }
    } catch {
      return true
    }
  }

  getPassives(characterId: string): PassiveSkillConfig[] {
    return this.passives.get(characterId) || []
  }

  removePassive(characterId: string, passiveId: string): boolean {
    const list = this.passives.get(characterId)
    if (!list) return false
    const index = list.findIndex((p) => p.id === passiveId)
    if (index === -1) return false
    list.splice(index, 1)
    return true
  }

  clearPassives(characterId: string): void {
    this.passives.delete(characterId)
  }

  clearAll(): void {
    this.passives.clear()
  }

  /** 为所有参与者触发指定时机的被动技能 */
  triggerPassiveSkillsForAll(
    trigger: BattleTriggerPhase,
    participants: Map<string, BattleEntity>,
    target?: BattleEntity,
    context?: Record<string, any>,
  ): void {
    for (const participant of participants.values()) {
      this.triggerPassives(trigger, participant, target, context)
    }
  }
}
