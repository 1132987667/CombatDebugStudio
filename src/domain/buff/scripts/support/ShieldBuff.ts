import { BaseBuffScript } from '@/domain/buff/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export class ShieldBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_shield'

  protected _onApply(context: BuffContext): void {
    this.log(context, '获得护盾保护')

    // 优先使用 executeShield 传入的 shieldValue，其次为 shieldPercent * maxHP，否则按公式计算
    const shieldValue = this.getConfigValue(context, 'shieldValue', -1)
    if (shieldValue >= 0) {
      context.setVariable('shieldValue', shieldValue)
      context.setVariable('maxShieldValue', shieldValue)
    } else {
      const shieldPercent = this.getConfigValue(context, 'shieldPercent', -1)
      if (shieldPercent > 0) {
        const character = context.getCharacter()
        const maxHP = character ? character.getAttribute(ATTRIBUTE_CODE.maxHealth) : 1000
        const computed = Math.floor(maxHP * shieldPercent)
        context.setVariable('shieldValue', computed)
        context.setVariable('maxShieldValue', computed)
      } else {
        const baseShield = this.getConfigValue(context, 'baseShield', 100)
        const shieldScale = this.getConfigValue(context, 'shieldScale', 1)
        const character = context.getCharacter()
        const maxHP = character ? character.getAttribute(ATTRIBUTE_CODE.maxHealth) : 1000
        const calculatedShield = Math.floor(baseShield * shieldScale + maxHP * 0.1)
        context.setVariable('shieldValue', calculatedShield)
        context.setVariable('maxShieldValue', calculatedShield)
      }
    }
    context.setVariable('shieldRegen', this.getConfigValue(context, 'shieldRegen', 0))

    // 同步护盾值到 BuffSystem（供 takeDamage 吸收伤害）
    context.getBuffSystem()?.setShieldValue(context.characterId, shieldValue)
  }

  protected _onRemove(context: BuffContext): void {
    const remainingShield = context.getVariable<number>('shieldValue') || 0
    this.log(context, `护盾效果消失，剩余护盾值：${remainingShield}`)
    // 清除 BuffSystem 中的护盾值
    context.getBuffSystem()?.setShieldValue(context.characterId, 0)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 每秒钟恢复少量护盾值
    const shieldRegen = context.getVariable<number>('shieldRegen') || 0
    if (shieldRegen > 0) {
      const elapsed = context.getElapsedTime()
      if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
        const currentShield = context.getVariable<number>('shieldValue') || 0
        const maxShield = context.getVariable<number>('maxShieldValue') || 100
        
        const newShield = Math.min(currentShield + shieldRegen, maxShield)
        context.setVariable('shieldValue', newShield)
        // 同步更新 BuffSystem 中的护盾值
        context.getBuffSystem()?.setShieldValue(context.characterId, newShield)
        
        this.log(context, `护盾恢复：${shieldRegen}，当前护盾值：${newShield}`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '护盾效果增强！')
    
    // 刷新时增加护盾值
    const currentShield = context.getVariable<number>('shieldValue') || 0
    const maxShield = context.getVariable<number>('maxShieldValue') || 100
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 20)
    
    const newMaxShield = maxShield + refreshBonus
    const newShield = currentShield + refreshBonus
    
    context.setVariable('shieldValue', newShield)
    context.setVariable('maxShieldValue', newMaxShield)
    // 同步更新 BuffSystem 中的护盾值
    context.getBuffSystem()?.setShieldValue(context.characterId, newShield)
    
    this.log(context, `护盾值提升至 ${newShield}/${newMaxShield}`)
  }

  public getEffectLines(context: BuffContext): BuffEffectLine[] {
    const maxShield = context.getVariable<number>('maxShieldValue') ||
      Math.floor(this.getConfigValue(context, 'baseShield', 100) * this.getConfigValue(context, 'shieldScale', 1) + 1000 * 0.1)
    return [{ text: `吸收 ${maxShield} 点伤害`, kind: 'shield' }]
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = ShieldBuff.BUFF_ID

