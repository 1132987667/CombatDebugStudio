import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class ShieldBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'shield'

  protected _onApply(context: BuffContext): void {
    this.log(context, '获得护盾保护')
    
    // 计算护盾值
    const baseShield = this.getConfigValue(context, 'baseShield', 100)
    const shieldScale = this.getConfigValue(context, 'shieldScale', 1)
    
    const character = context.getCharacter()
    const maxHP = character ? character.getAttribute('HP') : 1000
    const shieldValue = Math.floor(baseShield * shieldScale + maxHP * 0.1)
    
    // 记录护盾相关参数
    context.setVariable('shieldValue', shieldValue)
    context.setVariable('maxShieldValue', shieldValue)
    context.setVariable('shieldRegen', this.getConfigValue(context, 'shieldRegen', 0))
  }

  protected _onRemove(context: BuffContext): void {
    const remainingShield = context.getVariable<number>('shieldValue') || 0
    this.log(context, `护盾效果消失，剩余护盾值：${remainingShield}`)
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
    
    this.log(context, `护盾值提升至 ${newShield}/${newMaxShield}`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = ShieldBuff.BUFF_ID
