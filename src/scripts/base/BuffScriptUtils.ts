import type { Character } from '@/types/character'
import type { BuffContext } from '@/core/BuffContext'

export class BuffScriptUtils {
  public static calculateDamage(
    attacker: Character,
    defender: Character,
    baseDamage: number,
    isCritical: boolean = false
  ): number {
    const attack = attacker.getAttribute('ATK')
    const defense = defender.getAttribute('DEF')
    
    // 基础伤害计算
    let damage = baseDamage * (attack / (attack + defense * 0.8))
    
    // 暴击伤害计算
    if (isCritical) {
      const critDmg = attacker.getAttribute('CRIT_DMG')
      damage *= (1 + critDmg)
    }
    
    // 确保伤害不低于最小值
    return Math.max(1, Math.floor(damage))
  }

  public static calculateHealing(
    character: Character,
    baseHealing: number
  ): number {
    const level = character.level
    const maxHP = character.getAttribute('HP')
    
    // 治疗量计算，基于角色等级和最大生命值
    let healing = baseHealing * (1 + level * 0.01)
    
    // 确保治疗量不超过最大生命值的一定比例
    const maxHealing = maxHP * 0.3
    return Math.min(maxHealing, Math.floor(healing))
  }

  public static checkCondition(
    context: BuffContext,
    condition: {
      type: string
      attribute?: string
      operator?: string
      value?: number
    }
  ): boolean {
    switch (condition.type) {
      case 'HP_BELOW':
        return context.getAttributeValue('HP') < condition.value!
      case 'MP_BELOW':
        return context.getAttributeValue('MP') < condition.value!
      case 'LEVEL_ABOVE':
        // 假设角色等级可以通过 context 获取
        return (context.getCharacter()?.level || 0) > condition.value!
      case 'HAS_BUFF':
        // 假设可以检查角色是否有特定 Buff
        return context.getCharacter()?.hasBuff(condition.attribute!) ?? false
      default:
        return true
    }
  }

  public static getRandomValue(min: number, max: number): number {
    return Math.random() * (max - min) + min
  }

  public static getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  public static calculateDuration(
    baseDuration: number,
    scaleFactor: number = 1,
    level: number = 1
  ): number {
    return baseDuration * scaleFactor * (1 + level * 0.05)
  }

  public static calculateEffectValue(
    baseValue: number,
    scaleFactor: number = 1,
    level: number = 1
  ): number {
    return baseValue * scaleFactor * (1 + level * 0.08)
  }

  public static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(ms / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }

  public static isExpired(context: BuffContext): boolean {
    const remaining = context.getRemainingTime()
    return remaining >= 0 && remaining <= 0
  }

  public static canStack(context: BuffContext, maxStacks: number): boolean {
    const character = context.getCharacter()
    if (!character) return false
    
    const buffId = context.config.id
    const currentStacks = character.buffs.filter(
      (buffInstanceId) => buffInstanceId.includes(buffId)
    ).length
    
    return currentStacks < maxStacks
  }
}
