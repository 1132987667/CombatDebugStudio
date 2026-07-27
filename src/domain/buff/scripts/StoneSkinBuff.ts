import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

/**
 * 石化皮肤buff脚本
 * 提供伤害减免，但可能降低移动速度
 */
export class StoneSkinBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_stone_skin'

  protected _onApply(context: BuffContext): void {
    this.log(context, '皮肤变得如石头般坚硬！')
    
    // 提供伤害减免
    const physicalReduction = this.getConfigValue(context, 'physicalReduction', 0.3) // 默认30%伤害减免
    this.addModifier(context, ATTRIBUTE_CODE.damageReduction, physicalReduction, ModifierType.MULTIPLICATIVE)
    
    // 降低移动速度作为代价
    const speedPenalty = this.getConfigValue(context, 'speedPenalty', 0.15) // 默认降低15%速度
    this.addModifier(context, ATTRIBUTE_CODE.speed, -speedPenalty, ModifierType.MULTIPLICATIVE)
    
    // 记录初始值
    context.setVariable('physicalReduction', physicalReduction)
    context.setVariable('speedPenalty', speedPenalty)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '石化皮肤效果消失')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 石化效果随时间逐渐增强
    const elapsed = context.getElapsedTime()
    const enhancementRate = this.getConfigValue(context, 'enhancementRate', 0.005) // 每秒增强0.5%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentReduction = context.getVariable<number>('physicalReduction') || 0.3
      const currentPenalty = context.getVariable<number>('speedPenalty') || 0.15
      
      const newReduction = Math.min(currentReduction + enhancementRate, 0.6) // 最大60%
      const newPenalty = Math.min(currentPenalty + enhancementRate * 0.5, 0.3) // 最大30%
      
      if (newReduction > currentReduction) {
        // 更新效果
        context.removeModifiers(ATTRIBUTE_CODE.damageReduction)
        context.removeModifiers(ATTRIBUTE_CODE.speed)
        
        this.addModifier(context, ATTRIBUTE_CODE.damageReduction, newReduction, ModifierType.MULTIPLICATIVE)
        this.addModifier(context, ATTRIBUTE_CODE.speed, -newPenalty, ModifierType.MULTIPLICATIVE)
        
        context.setVariable('physicalReduction', newReduction)
        context.setVariable('speedPenalty', newPenalty)
        
        this.log(context, `石化效果增强，伤害减免：${(newReduction * 100).toFixed(1)}%，速度惩罚：${(newPenalty * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '石化皮肤效果强化！')
    
    // 刷新时增强效果
    const currentReduction = context.getVariable<number>('physicalReduction') || 0.3
    const currentPenalty = context.getVariable<number>('speedPenalty') || 0.15
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    
    const newReduction = Math.min(currentReduction + refreshBonus, 0.8) // 最大80%
    const newPenalty = Math.min(currentPenalty + refreshBonus * 0.3, 0.4) // 最大40%
    
    // 更新效果
    context.removeModifiers(ATTRIBUTE_CODE.damageReduction)
    context.removeModifiers(ATTRIBUTE_CODE.speed)
    
    this.addModifier(context, ATTRIBUTE_CODE.damageReduction, newReduction, ModifierType.MULTIPLICATIVE)
    this.addModifier(context, ATTRIBUTE_CODE.speed, -newPenalty, ModifierType.MULTIPLICATIVE)
    
    context.setVariable('physicalReduction', newReduction)
    context.setVariable('speedPenalty', newPenalty)
    
    this.log(context, `伤害减免提升至 ${(newReduction * 100).toFixed(1)}%，速度惩罚提升至 ${(newPenalty * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = StoneSkinBuff.BUFF_ID
