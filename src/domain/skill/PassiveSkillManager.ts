import { BattleEntity, BattleTriggerPhase } from '@/domain/battle/types'
import { BATTLE_CONSTANTS } from '@/domain/battle/types'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType } from '@/domain/buff/types'

export interface PassiveSkillConfig {
  id: string
  name: string
  description: string
  trigger: BattleTriggerPhase
  condition?: string
  skillId: string
  cooldown: number
  lastTriggeredTurn?: number
  triggerCount?: number
  maxTriggerCount?: number
  triggerProbability?: number
  hpThreshold?: number
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
  static create(skillManager: SkillManager, buffSystem: BuffSystem): PassiveSkillManager {
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
    context?: Record<string, any>,
  ): void {
    const characterPassives = this.passives.get(entity.id)
    if (!characterPassives) return

    for (const config of characterPassives) {
      if (config.trigger !== trigger) continue
      if (config.cooldown > 0 && config.lastTriggeredTurn) {
        const currentTurn = context?.currentTurn as number || 0
        if (currentTurn - config.lastTriggeredTurn < config.cooldown) continue
      }
      if (config.maxTriggerCount && config.triggerCount && config.triggerCount >= config.maxTriggerCount) continue
      if (config.triggerProbability && Math.random() > config.triggerProbability) continue
      if (config.trigger === BattleTriggerPhase.HP_LOWER_THAN && config.hpThreshold) {
        const hpPercent = entity.getAttribute('currentHealth') / Math.max(1, entity.getAttribute('maxHealth'))
        if (hpPercent > config.hpThreshold / 100) continue
      }
      if (config.condition && !this.evaluateCondition(config.condition, entity, target, context)) continue

      this.skillManager.executeSkill(config.skillId, entity, target!, context?.currentTurn as number || 0)
      config.lastTriggeredTurn = context?.currentTurn as number || 0
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
          return target ? (target.getAttribute('currentHealth') / Math.max(1, target.getAttribute('maxHealth'))) < BATTLE_CONSTANTS.HEAL_THRESHOLD : false
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
